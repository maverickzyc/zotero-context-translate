import { ContextLevel } from "../../types";
import { DictEntry } from "./dictionary";

export type TranslationAction = "lookup" | "translate";

export interface CacheEntry {
  level: ContextLevel;
  dictResult: DictEntry | null;
  llmResult: string;
  timestamp: number;
  dictionaryOnly?: boolean;
}

const cache = new Map<string, CacheEntry>();

function makeKey(
  itemId: number | string,
  page: number,
  text: string,
  action: TranslationAction,
): string {
  return `${itemId}:${page}:${action}:${text.trim().toLowerCase()}`;
}

export function getCached(
  itemId: number | string,
  page: number,
  text: string,
  action: TranslationAction,
): CacheEntry | null {
  const key = makeKey(itemId, page, text, action);
  const entry = cache.get(key);
  if (entry && entry.timestamp <= 0) {
    cache.delete(key);
    return null;
  }
  return entry || null;
}

export function setCache(
  itemId: number | string,
  page: number,
  text: string,
  action: TranslationAction,
  entry: CacheEntry,
): void {
  cache.set(makeKey(itemId, page, text, action), entry);
}

export function clearCacheForDocument(itemId: number | string): void {
  const prefix = `${itemId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function clearAllTranslateCache(): void {
  cache.clear();
}
