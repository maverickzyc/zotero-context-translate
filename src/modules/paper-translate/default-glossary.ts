import { GlossaryEntry } from "../../types";

export function parsePaperGlossaryTSV(input: string): GlossaryEntry[] {
  const lines = input
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const dataLines = lines[0]?.toLowerCase().startsWith("en\tzh")
    ? lines.slice(1)
    : lines;

  return dataLines
    .map((line) => {
      const [term = "", translation = "", note = ""] = line.split("\t");
      return {
        term: term.trim(),
        translation: translation.trim(),
        note: note.trim() || undefined,
      };
    })
    .filter((entry) => entry.term && entry.translation);
}

export function mergePaperGlossaries(
  ...groups: GlossaryEntry[][]
): GlossaryEntry[] {
  const merged = new Map<string, GlossaryEntry>();
  for (const entries of groups) {
    for (const entry of entries) {
      merged.set(entry.term.toLowerCase(), entry);
    }
  }
  return [...merged.values()];
}

export async function loadBuiltInPaperGlossary(): Promise<GlossaryEntry[]> {
  try {
    const resource = await Zotero.File.getResourceAsync(
      `${rootURI}content/paper-default-glossary.tsv`,
    );
    return parsePaperGlossaryTSV(resource);
  } catch (error) {
    Zotero.log(
      `[ContextTranslate] Could not load built-in paper glossary: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "warning",
    );
    return [];
  }
}
