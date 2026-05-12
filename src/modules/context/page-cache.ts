import { PageTextData } from "../../types";

const cache = new Map<string, Map<number, PageTextData>>();

function docKey(itemId: number): string {
  return String(itemId);
}

export function getCachedPage(itemId: number, pageNumber: number): PageTextData | undefined {
  return cache.get(docKey(itemId))?.get(pageNumber);
}

export function setCachedPage(itemId: number, pageNumber: number, data: PageTextData): void {
  const key = docKey(itemId);
  if (!cache.has(key)) {
    cache.set(key, new Map());
  }
  cache.get(key)!.set(pageNumber, data);
}

export function clearDocumentCache(itemId: number): void {
  cache.delete(docKey(itemId));
}

export function clearAllCache(): void {
  cache.clear();
}
