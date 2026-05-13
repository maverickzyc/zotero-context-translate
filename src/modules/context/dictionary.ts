export interface DictEntry {
  phonetic: string;
  translation: string;
  pos: string;
}

let dictData: Record<string, { p: string; t: string; s: string }> | null = null;
let loadPromise: Promise<void> | null = null;

export async function loadDictionary(): Promise<void> {
  if (dictData) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const dictPath = `${rootURI}dict/ecdict-subset.json`;
      const response = await fetch(dictPath);
      if (!response.ok) throw new Error(`Dict fetch failed: ${response.status}`);
      const raw = await response.text();
      dictData = JSON.parse(raw);
      Zotero.log(`[ContextTranslate] Dictionary loaded: ${Object.keys(dictData!).length} entries`, "warning");
    } catch (err: any) {
      Zotero.log(`[ContextTranslate] Dictionary load failed: ${err?.message}`, "warning");
      dictData = {};
    }
  })();

  return loadPromise;
}

export function lookupWord(word: string): DictEntry | null {
  if (!dictData) return null;

  const key = word.toLowerCase().trim();
  const entry = dictData[key];
  if (!entry) return null;

  return {
    phonetic: entry.p || "",
    translation: entry.t || "",
    pos: entry.s || "",
  };
}

export function lookupPhrase(text: string): DictEntry | null {
  if (!dictData) return null;

  // Try exact match first
  const exact = lookupWord(text);
  if (exact) return exact;

  // For multi-word selections, try the first word
  const words = text.trim().split(/\s+/);
  if (words.length > 1 && words.length <= 3) {
    return lookupWord(words[0]);
  }

  return null;
}
