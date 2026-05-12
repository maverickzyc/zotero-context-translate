import { ChatMessage, TranslationCallbacks } from "../../types";
import { SSEParser } from "./stream-parser";

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export function getLLMConfig(): LLMConfig {
  const prefix = "extensions.zotero.contextTranslate";
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
