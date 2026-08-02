import { PaperBlock, PaperDocument } from "./types";

export interface PaperStructureRepairResult {
  mergedIntoIDs: string[];
  removedIDs: string[];
}

export interface PaperStructureAnomaly {
  previousID: string;
  continuationID: string;
  message: string;
}

const SENTENCE_END = /[.!?]["”’')\]]*$/;
const LOWERCASE_START = /^["“‘'([]*[a-zà-öø-ÿ]/u;
const TRAILING_DEPENDENT_CITATION = new RegExp(
  String.raw`\b(?:although|though|while|whereas|because|since|if|when|as)\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+(?:(?:and|&)\s+)?(?:[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+|et al\.)){0,3}\s*\((?:18|19|20)\d{2}[a-z]?\)["”’')\]]*$`,
  "i",
);

function startsLikeContinuation(block: PaperBlock): boolean {
  return (
    block.type === "paragraph" && LOWERCASE_START.test(block.source.trim())
  );
}

function endsLikeIncompleteSentence(block: PaperBlock): boolean {
  const source = block.source.trim();
  if (!source || SENTENCE_END.test(source)) return false;
  return (
    /[,;:–—-]$/.test(source) ||
    /\b(?:and|or|but|nor|to|of|for|with|by|from|as)$/i.test(source) ||
    TRAILING_DEPENDENT_CITATION.test(source) ||
    !/[.!?]["”’')\]]*$/.test(source)
  );
}

function isFloatLabel(block: PaperBlock): boolean {
  return (
    (block.type === "heading" || block.type === "subheading") &&
    /^(?:table|fig(?:ure)?)[ .:]?\s*\d+/i.test(block.source.trim())
  );
}

function floatContinuationIndex(
  blocks: PaperBlock[],
  previousIndex: number,
): number | null {
  const intermediate: PaperBlock[] = [];
  for (
    let index = previousIndex + 1;
    index < blocks.length && index <= previousIndex + 5;
    index++
  ) {
    const block = blocks[index];
    if (startsLikeContinuation(block)) {
      const hasFloat = intermediate.some(
        (candidate) => candidate.type === "table" || candidate.type === "image",
      );
      const onlyFloatMatter = intermediate.every(
        (candidate) =>
          candidate.type === "table" ||
          candidate.type === "image" ||
          candidate.type === "caption" ||
          isFloatLabel(candidate) ||
          (candidate.type === "paragraph" && candidate.source.length <= 260),
      );
      return hasFloat && onlyFloatMatter ? index : null;
    }
    intermediate.push(block);
    if (!(
      block.type === "table" ||
      block.type === "image" ||
      block.type === "caption" ||
      isFloatLabel(block) ||
      (block.type === "paragraph" && block.source.length <= 260)
    )) {
      return null;
    }
  }
  return null;
}

function continuationIndex(
  blocks: PaperBlock[],
  previousIndex: number,
): number | null {
  const previous = blocks[previousIndex];
  if (previous.type !== "paragraph" || !endsLikeIncompleteSentence(previous)) {
    return null;
  }
  const adjacent = blocks[previousIndex + 1];
  if (adjacent && startsLikeContinuation(adjacent)) {
    return previousIndex + 1;
  }
  return floatContinuationIndex(blocks, previousIndex);
}

function joinText(previous: string, continuation: string): string {
  if (/\s$/.test(previous) || /^\s/.test(continuation)) {
    return `${previous}${continuation}`.trim();
  }
  return `${previous} ${continuation}`.trim();
}

export function repairPaperStructure(
  document: PaperDocument,
  options: { resetTranslations?: boolean; reindex?: boolean } = {},
): PaperStructureRepairResult {
  const mergedIntoIDs: string[] = [];
  const removedIDs: string[] = [];
  const blocks = document.blocks;

  for (let index = 0; index < blocks.length; index++) {
    const targetIndex = continuationIndex(blocks, index);
    if (targetIndex === null) continue;
    const primary = blocks[index];
    const continuation = blocks[targetIndex];
    primary.source = joinText(primary.source, continuation.source);
    if (options.resetTranslations) {
      delete primary.translation;
      delete primary.error;
      primary.status = "pending";
    } else if (primary.translation && continuation.translation) {
      primary.translation = joinText(
        primary.translation,
        continuation.translation,
      );
    }
    mergedIntoIDs.push(primary.id);
    removedIDs.push(continuation.id);
    blocks.splice(targetIndex, 1);
    index -= 1;
  }

  if (options.reindex) {
    blocks.forEach((block, index) => {
      block.id = `b${String(index + 1).padStart(4, "0")}`;
    });
  }
  if (removedIDs.length) document.updatedAt = Date.now();
  return { mergedIntoIDs, removedIDs };
}

export function findPaperStructureAnomalies(
  document: PaperDocument,
): PaperStructureAnomaly[] {
  const anomalies: PaperStructureAnomaly[] = [];
  for (let index = 0; index < document.blocks.length; index++) {
    const continuation = continuationIndex(document.blocks, index);
    if (continuation === null) continue;
    anomalies.push({
      previousID: document.blocks[index].id,
      continuationID: document.blocks[continuation].id,
      message: `Blocks ${document.blocks[index].id} and ${document.blocks[continuation].id} appear to split one sentence`,
    });
  }
  return anomalies;
}

export const structureNormalizerInternals = {
  startsLikeContinuation,
  endsLikeIncompleteSentence,
  continuationIndex,
};
