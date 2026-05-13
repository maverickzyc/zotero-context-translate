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
      // Try multiple loading strategies
      const dictUrl = `${rootURI}dict/ecdict-subset.json`;
      Zotero.log(`[ContextTranslate] Loading dictionary from: ${dictUrl}`, "warning");

      let raw: string | null = null;

      // Strategy 1: Zotero.File.getContentsFromURL (works for chrome:// URIs)
      try {
        raw = Zotero.File.getContentsFromURL(dictUrl) as string;
      } catch { /* fallback */ }

      // Strategy 2: fetch
      if (!raw) {
        try {
          const response = await fetch(dictUrl);
          if (response.ok) raw = await response.text();
        } catch { /* fallback */ }
      }

      // Strategy 3: IOUtils for file path
      if (!raw) {
        try {
          const addonDir = rootURI.replace(/^file:\/\//, "").replace(/\/$/, "");
          const filePath = `${addonDir}/dict/ecdict-subset.json`;
          const bytes = await IOUtils.read(filePath);
          raw = new TextDecoder().decode(bytes);
        } catch { /* fallback */ }
      }

      if (!raw) throw new Error("All loading strategies failed");

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
  const exact = lookupWord(text);
  if (exact) return exact;
  const words = text.trim().split(/\s+/);
  if (words.length > 1 && words.length <= 3) {
    return lookupWord(words[0]);
  }
  return null;
}
