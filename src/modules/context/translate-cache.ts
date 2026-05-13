import { ContextLevel } from "../../types";
import { DictEntry } from "./dictionary";

export interface CacheEntry {
  level: ContextLevel;
  dictResult: DictEntry | null;
  llmResult: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function makeKey(itemId: number | string, page: number, text: string): string {
  return `${itemId}:${page}:${text.trim().toLowerCase()}`;
}

export function getCached(
  itemId: number | string,
  page: number,
  text: string,
): CacheEntry | null {
  return cache.get(makeKey(itemId, page, text)) || null;
}

export function setCache(
  itemId: number | string,
  page: number,
  text: string,
  entry: CacheEntry,
): void {
  cache.set(makeKey(itemId, page, text), entry);
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
