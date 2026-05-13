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

// Placeholder URLs — replace with real hosted JSON URLs when available
const DICT_URLS: Record<"light" | "full", string> = {
  light:
    "https://github.com/skywind3000/ECDICT/releases/download/v1.0.28/ecdict-sqlite-28.zip",
  full: "https://github.com/skywind3000/ECDICT/releases/download/v1.0.28/ecdict-sqlite-28.zip",
};

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
  const url = DICT_URLS[type];
  Zotero.log(
    `[ContextTranslate] Downloading ${type} dictionary from ${url}`,
    "warning",
  );

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Dictionary download failed: HTTP ${response.status} ${response.statusText}`,
    );
  }

  // Stream-read with progress reporting when Content-Length is known
  const contentLength = Number(response.headers.get("Content-Length") ?? "0");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await (reader as any).read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (onProgress && contentLength > 0) {
        onProgress(Math.round((received / contentLength) * 100));
      }
    }
  }

  // Merge chunks
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // Validate JSON before writing
  const text = new TextDecoder().decode(merged);
  JSON.parse(text); // throws if invalid

  // Write to profile dir
  const profilePath = getProfileDictPath();
  await IOUtils.write(profilePath, merged);
  Zotero.log(
    `[ContextTranslate] Dictionary saved to ${profilePath}`,
    "warning",
  );

  // Reload in-memory dictionary
  loadPromise = null;
  dictData = {};
  await loadDictionary();

  if (onProgress) onProgress(100);
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
