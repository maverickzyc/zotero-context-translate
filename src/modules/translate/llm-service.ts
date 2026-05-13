import { ChatMessage, TranslationCallbacks } from "../../types";
import { SSEParser } from "./stream-parser";

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface LLMPreset {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: string;
}

const prefix = "extensions.zotero.contextTranslate";

export function getPresets(): LLMPreset[] {
  const raw = (Zotero.Prefs.get(`${prefix}.llm.presets`, true) as string) || "[]";
  try {
    return JSON.parse(raw) as LLMPreset[];
  } catch {
    return [];
  }
}

function savePresets(presets: LLMPreset[]): void {
  Zotero.Prefs.set(`${prefix}.llm.presets`, JSON.stringify(presets), true);
}

export function setActiveIndex(index: number): void {
  Zotero.Prefs.set(`${prefix}.llm.activeIndex`, index, true);
}

export function getActivePresetName(): string {
  const presets = getPresets();
  const activeIndex = (Zotero.Prefs.get(`${prefix}.llm.activeIndex`, true) as number) ?? 0;
  if (presets.length > 0 && activeIndex >= 0 && activeIndex < presets.length) {
    return presets[activeIndex].name;
  }
  return "Default";
}

export function getLLMConfig(): LLMConfig {
  let presets = getPresets();
  const activeIndex = (Zotero.Prefs.get(`${prefix}.llm.activeIndex`, true) as number) ?? 0;

  // One-time migration: if no presets exist but an apiKey was set, migrate to first preset
  if (presets.length === 0) {
    const legacyApiKey = (Zotero.Prefs.get(`${prefix}.llm.apiKey`, true) as string) || "";
    if (legacyApiKey) {
      const migratedPreset: LLMPreset = {
        name: "Default",
        baseUrl: (Zotero.Prefs.get(`${prefix}.llm.baseUrl`, true) as string) || "https://api.openai.com/v1",
        apiKey: legacyApiKey,
        model: (Zotero.Prefs.get(`${prefix}.llm.model`, true) as string) || "gpt-4o-mini",
        temperature: (Zotero.Prefs.get(`${prefix}.llm.temperature`, true) as string) || "0.3",
      };
      presets = [migratedPreset];
      savePresets(presets);
    }
  }

  // Use active preset if available
  if (presets.length > 0 && activeIndex >= 0 && activeIndex < presets.length) {
    const preset = presets[activeIndex];
    return {
      baseUrl: preset.baseUrl || "https://api.openai.com/v1",
      apiKey: preset.apiKey || "",
      model: preset.model || "gpt-4o-mini",
      temperature: parseFloat(preset.temperature || "0.3"),
      maxTokens: (Zotero.Prefs.get(`${prefix}.llm.maxTokens`, true) as number) || 1024,
    };
  }

  // Fallback to individual pref keys (backward compatible)
  return {
    baseUrl: (Zotero.Prefs.get(`${prefix}.llm.baseUrl`, true) as string) || "https://api.openai.com/v1",
    apiKey: (Zotero.Prefs.get(`${prefix}.llm.apiKey`, true) as string) || "",
    model: (Zotero.Prefs.get(`${prefix}.llm.model`, true) as string) || "gpt-4o-mini",
    temperature: parseFloat((Zotero.Prefs.get(`${prefix}.llm.temperature`, true) as string) || "0.3"),
    maxTokens: (Zotero.Prefs.get(`${prefix}.llm.maxTokens`, true) as number) || 1024,
  };
}

export async function streamTranslation(
  messages: ChatMessage[],
  callbacks: TranslationCallbacks,
  config?: LLMConfig,
): Promise<void> {
  const cfg = config || getLLMConfig();

  if (!cfg.apiKey) {
    callbacks.onError(new Error("API Key not configured. Go to Settings → Context Translate to set it."));
    return;
  }

  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const body = JSON.stringify({
    model: cfg.model,
    messages,
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
    stream: true,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      callbacks.onError(new Error(`LLM API error ${response.status}: ${errorText}`));
      return;
    }

    const streamReader = response.body?.getReader() as ReadableStreamDefaultReader<Uint8Array> | undefined;
    if (!streamReader) {
      callbacks.onError(new Error("Response body is not readable"));
      return;
    }

    const decoder = new TextDecoder();
    const parser = new SSEParser(callbacks);

    while (true) {
      const { done, value } = await (streamReader as any).read();
      if (done) {
        parser.finish();
        break;
      }
      parser.feed(decoder.decode(value, { stream: true }));
    }
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}
