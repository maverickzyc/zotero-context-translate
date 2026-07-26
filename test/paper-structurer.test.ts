import { expect } from "chai";
import { structureParsedPaper } from "../src/modules/paper-translate/paper-structurer";
import { repairPaperStructure } from "../src/modules/paper-translate/structure-normalizer";
import { PaperSource, ParsedPaper } from "../src/modules/paper-translate/types";

describe("paper-structurer", function () {
  const source: PaperSource = {
    attachmentID: 10,
    attachmentKey: "ABC123",
    parentItemID: 9,
    libraryID: 1,
    title: "A Test Paper",
    authors: "Ada Lovelace",
    filePath: "/tmp/paper.pdf",
    fingerprint: "ABC123:1:2",
  };

  it("converts MinerU markdown into stable typed blocks", function () {
    const parsed: ParsedPaper = {
      parser: "mineru",
      assets: [
        {
          originalPath: "images/figure-1.png",
          relativePath: "/tmp/job/assets/figure-1.png",
          contentType: "image/png",
        },
      ],
      markdown: `# A Test Paper

Ada Lovelace

## Introduction

This is the first paragraph (Lovelace, 1843).

![](images/figure-1.png)

Figure 1. A machine.

> A quoted observation.

$$E = mc^2$$

| A | B |
| --- | --- |
| one | two |

## References

Lovelace, A. (1843). Notes.
Turing, A. (1950). Computing machinery.`,
    };

    const document = structureParsedPaper(parsed, source, "zh-CN");
    expect(document.blocks.map((block) => block.type)).to.deep.equal([
      "title",
      "author",
      "heading",
      "paragraph",
      "image",
      "caption",
      "quote",
      "formula",
      "table",
      "heading",
      "reference",
      "reference",
    ]);
    expect(document.blocks.map((block) => block.id)).to.deep.equal(
      Array.from(
        { length: 12 },
        (_, index) => `b${String(index + 1).padStart(4, "0")}`,
      ),
    );
    expect(document.blocks[4].assetPath).to.equal(
      "/tmp/job/assets/figure-1.png",
    );
    expect(document.blocks[10].status).to.equal("validated");
  });

  it("marks boilerplate as drop and preserves a fallback title", function () {
    const document = structureParsedPaper(
      {
        parser: "zotero-fulltext",
        assets: [],
        markdown: `A Test Paper

Copyright © Publisher

Body paragraph.`,
      },
      source,
      "zh-CN",
    );
    expect(document.blocks[0].type).to.equal("title");
    expect(document.blocks[1].type).to.equal("drop");
  });

  it("merges a sentence split by a PDF page boundary", function () {
    const document = structureParsedPaper(
      {
        parser: "mineru",
        assets: [],
        markdown: `# A Test Paper

Ada Lovelace

## Findings

Agency is negotiated over time, while Chen and Li (2025)

reveal how emotions constrain practice.

This is a separate paragraph.`,
      },
      source,
      "zh-CN",
    );
    const paragraphs = document.blocks.filter(
      (block) => block.type === "paragraph",
    );
    expect(paragraphs).to.have.length(2);
    expect(paragraphs[0].source).to.equal(
      "Agency is negotiated over time, while Chen and Li (2025) reveal how emotions constrain practice.",
    );
  });

  it("merges a sentence interrupted by a floated table without moving the table", function () {
    const document = structureParsedPaper(
      {
        parser: "mineru",
        assets: [],
        markdown: `# A Test Paper

Ada Lovelace

## Findings

The analysis connected agency and

Table 1. Results

| Construct | Value |
| --- | --- |
| Agency | High |

object-transformation across settings.

The next paragraph is complete.`,
      },
      source,
      "zh-CN",
    );
    const types = document.blocks.map((block) => block.type);
    const merged = document.blocks.find((block) =>
      block.source.startsWith("The analysis connected"),
    );
    expect(merged?.source).to.equal(
      "The analysis connected agency and object-transformation across settings.",
    );
    expect(types.indexOf("caption")).to.be.greaterThan(
      document.blocks.indexOf(merged!),
    );
    expect(types.indexOf("table")).to.be.greaterThan(types.indexOf("caption"));
  });

  it("invalidates an old translation when repairing historical blocks", function () {
    const document = structureParsedPaper(
      {
        parser: "mineru",
        assets: [],
        markdown: `# A Test Paper

Ada Lovelace

## Findings

The result depends on

how participants respond.`,
      },
      source,
      "zh-CN",
    );
    // Recreate the historical split because new parsing repairs it immediately.
    const paragraph = document.blocks.find(
      (block) => block.type === "paragraph",
    )!;
    paragraph.source = "The result depends on";
    paragraph.translation = "结果取决于";
    paragraph.status = "validated";
    document.blocks.push({
      id: "old-continuation",
      type: "paragraph",
      source: "how participants respond.",
      translation: "参与者如何回应。",
      status: "validated",
    });

    const result = repairPaperStructure(document, {
      resetTranslations: true,
    });
    expect(result.removedIDs).to.deep.equal(["old-continuation"]);
    expect(paragraph.translation).to.equal(undefined);
    expect(paragraph.status).to.equal("pending");
  });
});
