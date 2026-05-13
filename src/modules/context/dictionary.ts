export interface DictEntry {
  phonetic: string;
  translation: string;
  pos: string;
}

export interface DictStatus {
  installed: boolean;
  type: "light" | "full" | "none";
  entryCount: number;
}

// ECDICT CSV source — available on GitHub, we convert to JSON locally
// The CSV columns: word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
const ECDICT_CSV_URLS = [
  "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv",
  "https://fastly.jsdelivr.net/gh/skywind3000/ECDICT@master/ecdict.csv",
];

let dictData: Record<string, { p: string; t: string; s: string }> = {};
let loadPromise: Promise<void> | null = null;

function getProfileDictPath(): string {
  const profileDir = (Zotero as any).Profile.dir;
  // profileDir may be an nsIFile; normalise to a string path
  const dirPath =
    typeof profileDir === "string" ? profileDir : profileDir.path;
  return `${dirPath}/context-translate-dict.json`;
}

export async function loadDictionary(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // ── 1. Try profile dir first ──────────────────────────────────────────────
    const profilePath = getProfileDictPath();
    try {
      const bytes = await IOUtils.read(profilePath);
      const raw = new TextDecoder().decode(bytes);
      dictData = JSON.parse(raw);
      Zotero.log(
        `[ContextTranslate] Dictionary loaded from profile dir: ${Object.keys(dictData).length} entries`,
        "warning",
      );
      return;
    } catch {
      Zotero.log(
        `[ContextTranslate] No profile-dir dictionary found, falling back to bundled dict`,
        "warning",
      );
    }

    // ── 2. Fallback: bundled ecdict-subset.json ───────────────────────────────
    const dictUrl = `${rootURI}dict/ecdict-subset.json`;
    Zotero.log(
      `[ContextTranslate] Loading bundled dictionary from: ${dictUrl}`,
      "warning",
    );

    let raw: string | null = null;

    // Strategy A: Zotero.File.getContentsFromURL (works for chrome:// URIs)
    try {
      raw = Zotero.File.getContentsFromURL(dictUrl) as string;
    } catch {
      /* fallback */
    }

    // Strategy B: fetch
    if (!raw) {
      try {
        const response = await fetch(dictUrl);
        if (response.ok) raw = await response.text();
      } catch {
        /* fallback */
      }
    }

    // Strategy C: IOUtils with file path
    if (!raw) {
      try {
        const addonDir = rootURI.replace(/^file:\/\//, "").replace(/\/$/, "");
        const filePath = `${addonDir}/dict/ecdict-subset.json`;
        const bytes = await IOUtils.read(filePath);
        raw = new TextDecoder().decode(bytes);
      } catch {
        /* fallback */
      }
    }

    if (raw) {
      try {
        dictData = JSON.parse(raw);
        Zotero.log(
          `[ContextTranslate] Bundled dictionary loaded: ${Object.keys(dictData).length} entries`,
          "warning",
        );
      } catch (err: any) {
        Zotero.log(
          `[ContextTranslate] Bundled dictionary parse failed: ${err?.message}`,
          "warning",
        );
        dictData = {};
      }
    } else {
      Zotero.log(
        `[ContextTranslate] All dictionary loading strategies failed, running with empty dict`,
        "warning",
      );
      dictData = {};
    }
  })();

  return loadPromise;
}

export function getDictStatus(): DictStatus {
  const count = Object.keys(dictData).length;
  if (count === 0) {
    return { installed: false, type: "none", entryCount: 0 };
  }
  // Heuristic: "light" subset has ~50 K entries, full has ~770 K
  const type: "light" | "full" = count < 200_000 ? "light" : "full";
  return { installed: true, type, entryCount: count };
}

/**
 * Download a dictionary JSON file from GitHub and save it to the profile dir.
 * After saving the file the in-memory dictionary is reloaded.
 *
 * @param type        "light" (~50 K entries) or "full" (~770 K entries)
 * @param onProgress  optional callback receiving a 0–100 percentage
 */
export async function downloadDictionary(
  type: "light" | "full",
  onProgress?: (pct: number) => void,
): Promise<void> {
  // Step 1: Download CSV from GitHub
  onProgress?.(0);

  let response: Response | null = null;
  for (const url of ECDICT_CSV_URLS) {
    try {
      Zotero.log(`[ContextTranslate] Trying CSV: ${url}`, "warning");
      const r = await fetch(url);
      if (r.ok) { response = r; break; }
    } catch (err: any) {
      Zotero.log(`[ContextTranslate] Failed: ${err?.message}`, "warning");
    }
  }

  if (!response) {
    throw new Error("CSV 下载失败，请检查网络。也可手动下载 ecdict.csv 并转换后放到 Zotero Profile 目录。");
  }

  onProgress?.(5);
  const csvText = await response.text();
  onProgress?.(50);

  // Step 2: Parse CSV → JSON
  const lines = csvText.split("\n");
  const result: Record<string, { p: string; t: string; s: string }> = {};
  let kept = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cols = _parseCSVLine(line);
    const word = cols[0]?.toLowerCase()?.trim();
    const phonetic = cols[1] || "";
    const translation = cols[3] || "";
    const pos = cols[4] || "";
    const bnc = parseInt(cols[8]) || 0;
    const frq = parseInt(cols[9]) || 0;
    const collins = parseInt(cols[5]) || 0;
    const oxford = parseInt(cols[6]) || 0;
    const tag = cols[7] || "";

    if (!word || !translation || word.includes(" ") || !/^[a-z]/.test(word)) continue;

    if (type === "light") {
      if (!bnc && !frq && !collins && !oxford && !tag) continue;
    }

    result[word] = { p: phonetic, t: translation, s: pos };
    kept++;

    if (i % 80000 === 0) onProgress?.(50 + Math.round((i / lines.length) * 40));
  }

  onProgress?.(92);

  // Step 3: Save JSON
  const jsonStr = JSON.stringify(result);
  const profilePath = getProfileDictPath();
  await IOUtils.write(profilePath, new TextEncoder().encode(jsonStr));
  Zotero.log(`[ContextTranslate] Dict saved: ${kept} entries`, "warning");

  // Step 4: Reload
  loadPromise = null;
  dictData = {};
  await loadDictionary();
  onProgress?.(100);
}

function _parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { result.push(cur); cur = ""; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

export function lookupWord(word: string): DictEntry | null {
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
  const exact = lookupWord(text);
  if (exact) return exact;
  const words = text.trim().split(/\s+/);
  if (words.length > 1 && words.length <= 3) {
    return lookupWord(words[0]);
  }
  return null;
}
