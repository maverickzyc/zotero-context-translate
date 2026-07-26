import {
  PaperBlock,
  PaperBlockType,
  PaperDocument,
  PaperSource,
  ParsedAsset,
  ParsedPaper,
} from "./types";
import { repairPaperStructure } from "./structure-normalizer";

interface RawBlock {
  text: string;
  fenced: boolean;
}

function splitMarkdownBlocks(markdown: string): RawBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const result: RawBlock[] = [];
  let buffer: string[] = [];
  let fenced = false;
  let htmlTable = false;

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) result.push({ text, fenced });
    buffer = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (!fenced && buffer.length) flush();
      buffer.push(line);
      fenced = !fenced;
      if (!fenced) flush();
      continue;
    }

    if (!fenced && /<table(?:\s|>)/i.test(line)) htmlTable = true;
    if (!fenced && htmlTable) {
      buffer.push(line);
      if (/<\/table>/i.test(line)) {
        htmlTable = false;
        flush();
      }
      continue;
    }

    if (!fenced && !line.trim()) {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return result;
}

function cleanMarkdownEscapes(text: string): string {
  return text.replace(/\\([_~`*[\]#\\])/g, "$1").trim();
}

function looksLikeMarkdownTable(text: string): boolean {
  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 2) return false;
  return (
    lines[0].includes("|") &&
    /^\s*\|?\s*:?-{3,}/.test(lines[1]) &&
    lines[1].includes("|")
  );
}

function looksLikeFormula(text: string): boolean {
  const trimmed = text.trim();
  return (
    (/^\$\$[\s\S]*\$\$$/.test(trimmed) || /^\\\[[\s\S]*\\\]$/.test(trimmed)) &&
    trimmed.length > 4
  );
}

function looksLikeAuthor(text: string): boolean {
  if (text.length > 240 || /[.!?]\s*$/.test(text)) return false;
  if (/\b(university|institute|department|college|school)\b/i.test(text)) {
    return true;
  }
  const words = text.split(/\s+/);
  return (
    words.length >= 2 &&
    words.length <= 20 &&
    words.filter((word) => /^[A-Z][A-Za-z'’-]+,?$/.test(word)).length >=
      Math.ceil(words.length / 2)
  );
}

function looksLikeDrop(text: string): boolean {
  return /^(downloaded from|copyright ©|all rights reserved|reuse guidelines|supplementary material|view publication stats|terms and conditions)/i.test(
    text.trim(),
  );
}

function looksLikeCaption(text: string): boolean {
  return /^(fig(?:ure)?\.?|table)\s+\d+[.:\s]/i.test(text.trim());
}

function imageParts(
  text: string,
): { alt: string; src: string; trailing: string } | null {
  const match = text.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*([\s\S]*)$/);
  if (!match) return null;
  return {
    alt: match[1].trim(),
    src: match[2].trim().replace(/^<|>$/g, ""),
    trailing: match[3].trim(),
  };
}

function assetForSource(
  sourcePath: string,
  assets: ParsedAsset[],
): ParsedAsset | undefined {
  const normalized = sourcePath.replace(/\\/g, "/");
  const base = normalized.split("/").pop();
  return assets.find((asset) => {
    const original = asset.originalPath.replace(/\\/g, "/");
    return original === normalized || original.endsWith(`/${base}`);
  });
}

function makeBlock(
  index: number,
  type: PaperBlockType,
  source: string,
  extra: Partial<PaperBlock> = {},
): PaperBlock {
  return {
    id: `b${String(index).padStart(4, "0")}`,
    type,
    source: cleanMarkdownEscapes(source),
    status: "pending",
    ...extra,
  };
}

export function structureParsedPaper(
  parsed: ParsedPaper,
  source: PaperSource,
  targetLanguage: string,
  sourceLanguage = "en",
): PaperDocument {
  const rawBlocks = splitMarkdownBlocks(parsed.markdown);
  const blocks: PaperBlock[] = [];
  let seenTitle = false;
  let inReferences = false;

  const push = (
    type: PaperBlockType,
    text: string,
    extra: Partial<PaperBlock> = {},
  ) => {
    blocks.push(makeBlock(blocks.length + 1, type, text, extra));
  };

  for (const raw of rawBlocks) {
    const text = raw.text.trim();
    if (!text) continue;

    const headingMatch = text.match(/^(#{1,6})\s+([\s\S]+)$/);
    if (headingMatch) {
      const headingText = headingMatch[2].trim();
      if (/^references?$/i.test(headingText)) {
        inReferences = true;
      } else if (inReferences) {
        inReferences = false;
      }

      if (!seenTitle && headingMatch[1].length === 1) {
        push("title", headingText);
        seenTitle = true;
      } else {
        push(
          headingMatch[1].length >= 3 ? "subheading" : "heading",
          headingText,
        );
      }
      continue;
    }

    const image = imageParts(text);
    if (image) {
      const asset = assetForSource(image.src, parsed.assets);
      push("image", image.alt, {
        assetPath: asset?.relativePath,
        sourceAssetPath: image.src,
        status: "validated",
      });
      if (image.trailing) push("caption", image.trailing);
      continue;
    }

    if (looksLikeDrop(text)) {
      push("drop", text, { status: "validated" });
    } else if (inReferences) {
      for (const reference of text.split(/\n(?=[A-Z][\w'’.-]+,)/)) {
        push("reference", reference.trim(), { status: "validated" });
      }
    } else if (raw.fenced || looksLikeFormula(text)) {
      push("formula", text, { status: "validated" });
    } else if (looksLikeMarkdownTable(text) || /^<table(?:\s|>)/i.test(text)) {
      push("table", text);
    } else if (/^>\s?/.test(text)) {
      push("quote", text.replace(/^>\s?/gm, ""));
    } else if (looksLikeCaption(text)) {
      push("caption", text);
    } else if (seenTitle && blocks.length <= 3 && looksLikeAuthor(text)) {
      push("author", text, { status: "validated" });
    } else if (!seenTitle && text.length < 300) {
      push("title", text);
      seenTitle = true;
    } else {
      push("paragraph", text);
    }
  }

  const now = Date.now();
  const document: PaperDocument = {
    version: 1,
    sourceAttachmentID: source.attachmentID,
    sourceFingerprint: source.fingerprint,
    parser: parsed.parser,
    metadata: {
      title: source.title,
      authors: source.authors,
      sourceLanguage,
      targetLanguage,
    },
    glossary: [],
    blocks,
    createdAt: now,
    updatedAt: now,
  };
  repairPaperStructure(document, { reindex: true });
  return document;
}

export const paperStructurerInternals = {
  splitMarkdownBlocks,
  looksLikeMarkdownTable,
  looksLikeFormula,
  imageParts,
};
