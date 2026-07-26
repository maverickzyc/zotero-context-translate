#!/usr/bin/env node
/* global AbortSignal, console, fetch, process */

import fs from "node:fs/promises";
import path from "node:path";

const profileDirectory =
  process.argv[2] ||
  path.join(
    process.env.HOME || "",
    "Library/Application Support/Zotero/Profiles",
  );

function prefString(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`user_pref\\("${escaped}",\\s*("(?:[^"\\\\]|\\\\.)*")\\);`),
  );
  return match ? JSON.parse(match[1]) : "";
}

function redact(value) {
  return String(value || "")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "<redacted-api-key>")
    .replace(
      /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
      "<redacted-token>",
    )
    .slice(0, 500);
}

async function findPrefs() {
  const stat = await fs.stat(profileDirectory);
  if (stat.isFile()) return profileDirectory;
  const direct = path.join(profileDirectory, "prefs.js");
  try {
    await fs.access(direct);
    return direct;
  } catch {
    const entries = await fs.readdir(profileDirectory, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(profileDirectory, entry.name, "prefs.js");
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try the next profile.
      }
    }
  }
  throw new Error("Could not locate Zotero prefs.js");
}

async function checkDeepSeek(source) {
  const rawPresets = prefString(
    source,
    "extensions.zotero.contextTranslate.llm.presets",
  );
  const presets = rawPresets ? JSON.parse(rawPresets) : [];
  const activeIndex = Number(
    source.match(
      /user_pref\("extensions\.zotero\.contextTranslate\.llm\.activeIndex",\s*(\d+)\);/,
    )?.[1] || 0,
  );
  const preset = presets[activeIndex] || presets[0];
  if (!preset?.apiKey) {
    return { configured: false, error: "LLM API key is not configured" };
  }
  const baseUrl = String(preset.baseUrl || "https://api.deepseek.com").replace(
    /\/+$/,
    "",
  );
  const result = {
    configured: true,
    baseUrl,
    model: String(preset.model || ""),
    modelsStatus: null,
    chatStatus: null,
    error: null,
  };
  try {
    const models = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${preset.apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    result.modelsStatus = models.status;
    if (!models.ok) {
      result.error = redact(await models.text());
      return result;
    }
    const chat = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${preset.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: preset.model,
        messages: [{ role: "user", content: "Reply with OK only." }],
        max_tokens: 16,
        temperature: 0,
        stream: false,
        thinking: { type: "disabled" },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    result.chatStatus = chat.status;
    if (!chat.ok) result.error = redact(await chat.text());
  } catch (error) {
    result.error = redact(error instanceof Error ? error.message : error);
  }
  return result;
}

async function checkMinerU(source) {
  const token = prefString(
    source,
    "extensions.zotero.contextTranslate.paper.mineruToken",
  );
  if (!token) {
    return { configured: false, error: "MinerU token is not configured" };
  }
  const baseUrl = (
    prefString(
      source,
      "extensions.zotero.contextTranslate.paper.mineruBaseURL",
    ) || "https://mineru.net/api/v4"
  ).replace(/\/+$/, "");
  const result = {
    configured: true,
    baseUrl,
    requestStatus: null,
    apiCode: null,
    message: null,
    error: null,
  };
  try {
    const response = await fetch(`${baseUrl}/file-urls/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: [{ name: "context-translate-connection-check.pdf" }],
        model_version: "vlm",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    result.requestStatus = response.status;
    const body = await response.json().catch(async () => ({
      msg: await response.text(),
    }));
    result.apiCode = body.code ?? null;
    result.message = redact(body.msg || "");
    if (!response.ok || body.code !== 0) {
      result.error = result.message || response.statusText;
    }
  } catch (error) {
    result.error = redact(error instanceof Error ? error.message : error);
  }
  return result;
}

const prefsPath = await findPrefs();
const source = await fs.readFile(prefsPath, "utf8");
const [deepSeek, minerU] = await Promise.all([
  checkDeepSeek(source),
  checkMinerU(source),
]);
console.log(JSON.stringify({ deepSeek, minerU }, null, 2));
if (deepSeek.error || minerU.error) process.exitCode = 1;
