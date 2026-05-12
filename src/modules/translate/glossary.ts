import { GlossaryData, GlossaryEntry } from "../../types";

/**
 * Default token budget: ~800 tokens / ~15 tokens per term ≈ 53 terms max.
 */
const DEFAULT_MAX_TERMS = 53;

/**
 * Match glossary entries against selected text and context.
 * Terms appearing in the selected text are prioritized over context-only matches.
 * Results are capped at maxTerms.
 */
export function matchGlossaryTerms(
  entries: GlossaryEntry[],
  selected: string,
  context: string,
  maxTerms: number = DEFAULT_MAX_TERMS,
): GlossaryEntry[] {
  const selectedLower = selected.toLowerCase();
  const contextLower = context.toLowerCase();

  const inSelected: GlossaryEntry[] = [];
  const inContextOnly: GlossaryEntry[] = [];

  for (const entry of entries) {
    const termLower = entry.term.toLowerCase();
    if (selectedLower.includes(termLower)) {
      inSelected.push(entry);
    } else if (contextLower.includes(termLower)) {
      inContextOnly.push(entry);
    }
  }

  const combined = [...inSelected, ...inContextOnly];
  return combined.slice(0, maxTerms);
}

/**
 * Format matched glossary entries for inclusion in a prompt.
 * Each entry is rendered as "term → translation (field)" (field omitted when absent).
 */
export function formatGlossaryForPrompt(entries: GlossaryEntry[]): string {
  return entries
    .map((e) => {
      const fieldSuffix = e.field ? ` (${e.field})` : "";
      return `${e.term} → ${e.translation}${fieldSuffix}`;
    })
    .join("\n");
}

/**
 * Load glossary from Zotero profile directory.
 * Uses Zotero globals — only callable at runtime inside the Zotero environment.
 */
export async function loadGlossary(
  profileDir: string,
  libraryId: number,
): Promise<GlossaryData> {
  const path = PathUtils.join(profileDir, `glossary-${libraryId}.json`);
  try {
    const raw = await Zotero.File.getContentsAsync(path);
    return JSON.parse(raw as string) as GlossaryData;
  } catch {
    return { entries: [] };
  }
}

/**
 * Save glossary to Zotero profile directory.
 * Uses Zotero globals — only callable at runtime inside the Zotero environment.
 */
export async function saveGlossary(
  profileDir: string,
  libraryId: number,
  data: GlossaryData,
): Promise<void> {
  const path = PathUtils.join(profileDir, `glossary-${libraryId}.json`);
  await Zotero.File.putContentsAsync(path, JSON.stringify(data, null, 2));
}

/**
 * Add or update a glossary entry (matched by term, case-sensitive).
 */
export function addGlossaryEntry(
  data: GlossaryData,
  entry: GlossaryEntry,
): GlossaryData {
  const existing = data.entries.findIndex((e) => e.term === entry.term);
  if (existing >= 0) {
    const entries = [...data.entries];
    entries[existing] = entry;
    return { ...data, entries };
  }
  return { ...data, entries: [...data.entries, entry] };
}

/**
 * Remove a glossary entry by term (case-sensitive).
 */
export function removeGlossaryEntry(
  data: GlossaryData,
  term: string,
): GlossaryData {
  return {
    ...data,
    entries: data.entries.filter((e) => e.term !== term),
  };
}

/**
 * Parse a CSV string into glossary entries.
 * Expected columns: term, translation, field (optional), note (optional).
 * First line is treated as a header and skipped.
 */
export function glossaryFromCSV(csv: string): GlossaryEntry[] {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  // Skip header row
  const dataLines = lines.slice(1);
  return dataLines.map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const [term, translation, field, note] = cols;
    const entry: GlossaryEntry = { term, translation };
    if (field) entry.field = field;
    if (note) entry.note = note;
    return entry;
  });
}

/**
 * Serialize glossary entries to a CSV string with a header row.
 */
export function glossaryToCSV(entries: GlossaryEntry[]): string {
  const header = "term,translation,field,note";
  const rows = entries.map((e) => {
    const cols = [
      e.term ?? "",
      e.translation ?? "",
      e.field ?? "",
      e.note ?? "",
    ].map((v) => (v.includes(",") ? `"${v}"` : v));
    return cols.join(",");
  });
  return [header, ...rows].join("\n");
}
