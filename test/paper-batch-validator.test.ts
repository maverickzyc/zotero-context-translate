import { expect } from "chai";
import { planTranslationBatches } from "../src/modules/paper-translate/batch-planner";
import { validatePaperDocument } from "../src/modules/paper-translate/translation-validator";
import {
  PaperBlock,
  PaperDocument,
} from "../src/modules/paper-translate/types";

function block(id: string, source: string, translation?: string): PaperBlock {
  return {
    id,
    type: "paragraph",
    source,
    translation,
    status: translation ? "translated" : "pending",
  };
}

function document(blocks: PaperBlock[]): PaperDocument {
  return {
    version: 1,
    sourceAttachmentID: 1,
    sourceFingerprint: "x",
    parser: "zotero-fulltext",
    metadata: {
      title: "Paper",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
    },
    glossary: [],
    blocks,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("paper batch planning and validation", function () {
  it("batches only untranslated translatable blocks within limits", function () {
    const blocks = [
      block("b1", "12345"),
      block("b2", "12345"),
      block("b3", "done", "完成"),
      {
        id: "b4",
        type: "reference",
        source: "Reference",
        status: "validated",
      } as PaperBlock,
    ];
    const batches = planTranslationBatches(blocks, 7, 20);
    expect(batches.map((batch) => batch.blockIDs)).to.deep.equal([
      ["b1"],
      ["b2"],
    ]);
  });

  it("reports missing translations, assets and duplicate ids", function () {
    const result = validatePaperDocument(
      document([
        block("b1", "text"),
        block("b1", "text", "译文"),
        {
          id: "img",
          type: "image",
          source: "",
          status: "validated",
        },
      ]),
    );
    expect(result.valid).to.equal(false);
    expect(result.issues.map((issue) => issue.code)).to.include.members([
      "missing-translation",
      "duplicate-id",
      "missing-asset",
    ]);
  });

  it("rejects translation protocol markers that reach validation", function () {
    const result = validatePaperDocument(
      document([block("b1", "text", "[TYPE=paragraph]\n译文")]),
    );
    expect(result.valid).to.equal(false);
    expect(result.issues.map((issue) => issue.code)).to.include(
      "protocol-leak",
    );
  });

  it("rejects untranslated narrative connectors and split sentences", function () {
    const result = validatePaperDocument(
      document([
        block(
          "b1",
          "The mechanism matters, while Chen and Li (2025)",
          "这一机制很重要。While Chen and Li (2025)",
        ),
        block(
          "b2",
          "show how emotions shape agency.",
          "说明了情感如何塑造能动性。",
        ),
      ]),
    );
    expect(result.valid).to.equal(false);
    expect(result.issues.map((issue) => issue.code)).to.include.members([
      "untranslated-connector",
      "structure-boundary",
    ]);
  });
});
