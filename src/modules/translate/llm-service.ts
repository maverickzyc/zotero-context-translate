import { ChatMessage, TranslationCallbacks } from "../../types";
import {
  createZoteroTextDecoder,
  zoteroFetch,
} from "../paper-translate/runtime";
import { SSEParser } from "./stream-parser";

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface ChatCompletionOptions {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
  disableThinking?: boolean;
}

export interface ChatCompletionResult {
  content: string;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMPreset {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: string;
}

export const BUILTIN_PROVIDERS: Omit<LLMPreset, "apiKey">[] = [
  {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    temperature: "0.2",
  },
  {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    temperature: "0.3",
  },
  {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "deepseek/deepseek-chat",
    temperature: "0.3",
  },
  {
    name: "Ollama (本地)",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5",
    temperature: "0.3",
  },
  {
    name: "Claude",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-6",
    temperature: "0.3",
  },
  { name: "自定义", baseUrl: "", model: "", temperature: "0.3" },
];

const prefix = "extensions.zotero.contextTranslate";

function currentModel(baseUrl: string, model: string): string {
  if (
    /api\.deepseek\.com/i.test(baseUrl) &&
    (model === "deepseek-chat" || model === "deepseek-reasoner")
  ) {
    return "deepseek-v4-flash";
  }
  return model;
}

export function getPresets(): LLMPreset[] {
  const raw =
    (Zotero.Prefs.get(`${prefix}.llm.presets`, true) as string) || "[]";
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
  const activeIndex =
    (Zotero.Prefs.get(`${prefix}.llm.activeIndex`, true) as number) ?? 0;
  if (presets.length > 0 && activeIndex >= 0 && activeIndex < presets.length) {
    return presets[activeIndex].name;
  }
  return "Default";
}

export function getLLMConfig(): LLMConfig {
  let presets = getPresets();
  const activeIndex =
    (Zotero.Prefs.get(`${prefix}.llm.activeIndex`, true) as number) ?? 0;

  // One-time migration: if no presets exist but an apiKey was set, migrate to first preset
  if (presets.length === 0) {
    const legacyApiKey =
      (Zotero.Prefs.get(`${prefix}.llm.apiKey`, true) as string) || "";
    if (legacyApiKey) {
      const migratedPreset: LLMPreset = {
        name: "Default",
        baseUrl:
          (Zotero.Prefs.get(`${prefix}.llm.baseUrl`, true) as string) ||
          "https://api.openai.com/v1",
        apiKey: legacyApiKey,
        model:
          (Zotero.Prefs.get(`${prefix}.llm.model`, true) as string) ||
          "gpt-4o-mini",
        temperature:
          (Zotero.Prefs.get(`${prefix}.llm.temperature`, true) as string) ||
          "0.3",
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
      model: currentModel(preset.baseUrl || "", preset.model || "gpt-4o-mini"),
      temperature: parseFloat(preset.temperature || "0.3"),
      maxTokens:
        (Zotero.Prefs.get(`${prefix}.llm.maxTokens`, true) as number) || 1024,
    };
  }

  // Fallback to individual pref keys (backward compatible)
  return {
    baseUrl:
      (Zotero.Prefs.get(`${prefix}.llm.baseUrl`, true) as string) ||
      "https://api.openai.com/v1",
    apiKey: (Zotero.Prefs.get(`${prefix}.llm.apiKey`, true) as string) || "",
    model:
      (Zotero.Prefs.get(`${prefix}.llm.model`, true) as string) ||
      "gpt-4o-mini",
    temperature: parseFloat(
      (Zotero.Prefs.get(`${prefix}.llm.temperature`, true) as string) || "0.3",
    ),
    maxTokens:
      (Zotero.Prefs.get(`${prefix}.llm.maxTokens`, true) as number) || 1024,
  };
}

export async function streamTranslation(
  messages: ChatMessage[],
  callbacks: TranslationCallbacks,
  config?: LLMConfig,
): Promise<void> {
  const cfg = config || getLLMConfig();

  if (!cfg.apiKey) {
    callbacks.onError(
      new Error(
        "API Key not configured. Go to Settings → Context Translate to set it.",
      ),
    );
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
    const response = await zoteroFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      callbacks.onError(
        new Error(`LLM API error ${response.status}: ${errorText}`),
      );
      return;
    }

    const streamReader = response.body?.getReader() as
      ReadableStreamDefaultReader<Uint8Array> | undefined;
    if (!streamReader) {
      callbacks.onError(new Error("Response body is not readable"));
      return;
    }

    const decoder = createZoteroTextDecoder();
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
    callbacks.onError(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

export async function completeChat(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
  config?: LLMConfig,
): Promise<ChatCompletionResult> {
  const cfg = config || getLLMConfig();
  if (!cfg.apiKey) {
    throw new Error(
      "API Key not configured. Go to Settings → Context Translate to set it.",
    );
  }

  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: currentModel(cfg.baseUrl, cfg.model),
    messages,
    temperature: options.temperature ?? cfg.temperature,
    max_tokens: options.maxTokens ?? cfg.maxTokens,
    stream: false,
  };
  if (options.responseFormat) {
    body.response_format = { type: options.responseFormat };
  }
  if (options.disableThinking && /^deepseek-v4-/i.test(String(body.model))) {
    body.thinking = { type: "disabled" };
  }

  const response = await zoteroFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(
      `LLM API error ${response.status}: ${detail || response.statusText}`,
    );
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const result = (await response.json()) as {
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string | null };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  const content = result.choices?.[0]?.message?.content || "";
  if (!content.trim()) {
    throw new Error("LLM API returned an empty response");
  }
  return {
    content,
    finishReason: result.choices?.[0]?.finish_reason || "unknown",
    usage: {
      promptTokens: result.usage?.prompt_tokens || 0,
      completionTokens: result.usage?.completion_tokens || 0,
      totalTokens: result.usage?.total_tokens || 0,
    },
  };
}
