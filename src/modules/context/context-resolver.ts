import { ContextLevel, ContextResult } from "../../types";
import { splitSentences } from "./paragraph-detect";

export function determineLevel(selected: string): ContextLevel {
  const trimmed = selected.trim();
  const words = trimmed.split(/\s+/);
  const sentenceEndings = trimmed.match(/[.?!]\s/g) || [];
  const trailingEnd = /[.?!]$/.test(trimmed) ? 1 : 0;
  const totalEndings = sentenceEndings.length + trailingEnd;

  if (words.length <= 3) return ContextLevel.Word;
  if (totalEndings >= 2) return ContextLevel.Paragraph;
  return ContextLevel.Sentence;
}

function findParagraphIndex(selected: string, paragraphs: string[]): number {
  const normalized = selected.trim().toLowerCase();
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].toLowerCase().includes(normalized)) {
      return i;
    }
  }
  return -1;
}

function findSentenceContext(selected: string, paragraphs: string[]): string {
  const paraIdx = findParagraphIndex(selected, paragraphs);
  if (paraIdx === -1) return "";
  const sentences = splitSentences(paragraphs[paraIdx]);
  const normalized = selected.trim().toLowerCase();
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(normalized)) {
      return sentence;
    }
  }
  return paragraphs[paraIdx];
}

function getParagraphContext(selected: string, paragraphs: string[]): string {
  const paraIdx = findParagraphIndex(selected, paragraphs);
  if (paraIdx === -1) return "";
  return paragraphs[paraIdx];
}

function getSurroundingParagraphs(
  selected: string,
  paragraphs: string[],
): string {
  const paraIdx = findParagraphIndex(selected, paragraphs);
  if (paraIdx === -1) return "";
  const parts: string[] = [];
  if (paraIdx > 0) parts.push("[前一段] " + paragraphs[paraIdx - 1]);
  parts.push("[选中段] " + paragraphs[paraIdx]);
  if (paraIdx < paragraphs.length - 1)
    parts.push("[后一段] " + paragraphs[paraIdx + 1]);
  return parts.join("\n\n");
}

export function resolveContext(
  selected: string,
  paragraphs: string[],
): ContextResult {
  const level = determineLevel(selected);
  let context: string;
  let paragraphIndex: number | undefined;

  switch (level) {
    case ContextLevel.Word:
      context = findSentenceContext(selected, paragraphs);
      break;
    case ContextLevel.Sentence:
      context = getParagraphContext(selected, paragraphs);
      paragraphIndex = findParagraphIndex(selected, paragraphs);
      break;
    case ContextLevel.Paragraph:
      context = getSurroundingParagraphs(selected, paragraphs);
      paragraphIndex = findParagraphIndex(selected, paragraphs);
      break;
  }

  return {
    level,
    selected: selected.trim(),
    context,
    paragraphIndex:
      paragraphIndex !== undefined ? paragraphIndex : undefined,
  };
}
