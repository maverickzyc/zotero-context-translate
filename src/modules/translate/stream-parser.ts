import { TranslationCallbacks } from "../../types";

export function parseSSEChunk(line: string): string | null {
  if (!line.startsWith("data: ")) return "";
  const data = line.slice(6).trim();
  if (data === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}

export class SSEParser {
  private callbacks: TranslationCallbacks;
  private buffer = "";
  private accumulated = "";
  private finished = false;

  constructor(callbacks: TranslationCallbacks) {
    this.callbacks = callbacks;
  }

  feed(chunk: string): void {
    if (this.finished) return;
    this.buffer += chunk;
    const parts = this.buffer.split("\n");
    this.buffer = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line) continue;
      const content = parseSSEChunk(line);
      if (content === null) {
        this.finished = true;
        this.callbacks.onDone(this.accumulated);
        return;
      }
      if (content) {
        this.accumulated += content;
        this.callbacks.onChunk(content);
      }
    }
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.buffer.trim()) {
      const content = parseSSEChunk(this.buffer.trim());
      if (content && content !== null) {
        this.accumulated += content;
        this.callbacks.onChunk(content);
      }
    }
    this.callbacks.onDone(this.accumulated);
  }
}
