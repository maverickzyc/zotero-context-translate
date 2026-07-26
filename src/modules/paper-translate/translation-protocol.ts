import { PaperDocument } from "./types";

const PAPER_BLOCK_TYPES =
  "title|author|heading|subheading|paragraph|quote|reference|image|caption|formula|table|drop";

const BRACKETED_TYPE_MARKER = new RegExp(
  `^\\s*(?:(?:\\*\\*|__|\`)\\s*)?[\\[【(（]\\s*TYPE\\s*[:=：＝]\\s*(?:${PAPER_BLOCK_TYPES})\\s*[\\]】)）]\\s*(?:(?:\\*\\*|__|\`)\\s*)?`,
  "i",
);

const BARE_TYPE_MARKER = new RegExp(
  `^\\s*(?:(?:\\*\\*|__|\`)\\s*)?TYPE\\s*[:=：＝]\\s*(?:${PAPER_BLOCK_TYPES})\\s*(?:(?:\\*\\*|__|\`)\\s*)?(?:\\r?\\n+|$)`,
  "i",
);

const PROTOCOL_LEAK = new RegExp(
  `(?:^|\\r?\\n)\\s*(?:(?:\\*\\*|__|\`)\\s*)?(?:[\\[【(（]\\s*)?TYPE\\s*[:=：＝]\\s*[A-Za-z_-]+\\s*(?:[\\]】)）]\\s*)?(?:(?:\\*\\*|__|\`)\\s*)?(?:\\r?\\n|$)|(?:^|\\r?\\n)\\s*@@[A-Za-z0-9_-]+\\s*(?:\\r?\\n|$)`,
  "i",
);

export function sanitizePaperTranslation(value: string): string {
  let cleaned = value;
  for (let index = 0; index < 4; index++) {
    const next = cleaned
      .replace(BRACKETED_TYPE_MARKER, "")
      .replace(BARE_TYPE_MARKER, "");
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned.trim();
}

export function containsPaperProtocolLeak(value: string): boolean {
  return PROTOCOL_LEAK.test(value);
}

const UNTRANSLATED_NARRATIVE_CONNECTOR = new RegExp(
  String.raw`(?:^|[.!?。！？]["”’')\]]*\s*)(?:Though|Although|While|Whereas)\s+(?:[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+|(?:van|von|de|del|da)\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+)(?:\s+et al\.|\s+(?:and|&)\s+(?:[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+|(?:van|von|de|del|da)\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+))?\s*\((?:18|19|20)\d{2}[a-z]?\)`,
  "i",
);

export function containsUntranslatedNarrativeConnector(
  value: string,
  targetLanguage: string,
): boolean {
  if (/^en(?:-|$)/i.test(targetLanguage)) return false;
  return UNTRANSLATED_NARRATIVE_CONNECTOR.test(value);
}

export function repairPaperDocumentTranslations(
  document: PaperDocument,
): number {
  let repaired = 0;
  for (const block of document.blocks) {
    if (typeof block.translation !== "string") continue;
    const cleaned = sanitizePaperTranslation(block.translation);
    if (cleaned === block.translation) continue;
    block.translation = cleaned;
    repaired += 1;
  }
  if (repaired) document.updatedAt = Date.now();
  return repaired;
}

export function clearUntranslatedNarrativeConnectorTranslations(
  document: PaperDocument,
): number {
  let cleared = 0;
  for (const block of document.blocks) {
    if (
      !block.translation ||
      !containsUntranslatedNarrativeConnector(
        block.translation,
        document.metadata.targetLanguage,
      )
    ) {
      continue;
    }
    delete block.translation;
    delete block.error;
    block.status = "pending";
    cleared += 1;
  }
  if (cleared) document.updatedAt = Date.now();
  return cleared;
}
