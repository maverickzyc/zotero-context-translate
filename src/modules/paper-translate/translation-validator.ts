import {
  isTranslatableBlock,
  PaperDocument,
  PaperValidationIssue,
  PaperValidationResult,
} from "./types";
import { findPaperStructureAnomalies } from "./structure-normalizer";
import {
  containsPaperProtocolLeak,
  containsUntranslatedNarrativeConnector,
} from "./translation-protocol";

export function validatePaperDocument(
  document: PaperDocument,
): PaperValidationResult {
  const issues: PaperValidationIssue[] = [];
  const ids = new Set<string>();

  for (const block of document.blocks) {
    if (ids.has(block.id)) {
      issues.push({
        blockID: block.id,
        code: "duplicate-id",
        message: `Duplicate block id: ${block.id}`,
      });
    }
    ids.add(block.id);

    if (
      block.type !== "image" &&
      block.type !== "drop" &&
      !block.source.trim()
    ) {
      issues.push({
        blockID: block.id,
        code: "missing-source",
        message: `Block ${block.id} has no source text`,
      });
    }

    if (isTranslatableBlock(block) && !block.translation?.trim()) {
      issues.push({
        blockID: block.id,
        code: "missing-translation",
        message: `Block ${block.id} has no translation`,
      });
    }

    if (
      block.translation &&
      /⟦(?:CIT|URL|DOI|MATH|CODE)_\d+⟧/.test(block.translation)
    ) {
      issues.push({
        blockID: block.id,
        code: "unresolved-placeholder",
        message: `Block ${block.id} contains an unresolved protected token`,
      });
    }

    if (block.translation && containsPaperProtocolLeak(block.translation)) {
      issues.push({
        blockID: block.id,
        code: "protocol-leak",
        message: `Block ${block.id} contains a leaked translation protocol marker`,
      });
    }

    if (
      block.translation &&
      containsUntranslatedNarrativeConnector(
        block.translation,
        document.metadata.targetLanguage,
      )
    ) {
      issues.push({
        blockID: block.id,
        code: "untranslated-connector",
        message: `Block ${block.id} contains an untranslated narrative connector`,
      });
    }

    if (block.type === "image" && !block.assetPath) {
      issues.push({
        blockID: block.id,
        code: "missing-asset",
        message: `Image block ${block.id} has no local asset`,
      });
    }
  }

  for (const anomaly of findPaperStructureAnomalies(document)) {
    issues.push({
      blockID: anomaly.previousID,
      code: "structure-boundary",
      message: anomaly.message,
    });
  }

  return { valid: issues.length === 0, issues };
}
