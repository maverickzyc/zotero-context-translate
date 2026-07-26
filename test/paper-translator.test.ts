import { expect } from "chai";
import {
  paperTranslatorInternals,
  parseIDTranslations,
  parseJSONTranslations,
  protectTranslationText,
  restoreTranslationText,
} from "../src/modules/paper-translate/paper-translator";
import {
  containsPaperProtocolLeak,
  containsUntranslatedNarrativeConnector,
  repairPaperDocumentTranslations,
  sanitizePaperTranslation,
} from "../src/modules/paper-translate/translation-protocol";
import { PaperDocument } from "../src/modules/paper-translate/types";

describe("paper-translator formatting", function () {
  it("protects and restores citations, URLs, DOI and formulas", function () {
    const source =
      "See Harvey (2005, p. 3), (Rose, 1999), https://example.com, " +
      '10.1000/xyz, $x+y$, and <td colspan="2">value</td>.';
    const protectedText = protectTranslationText(source);
    expect(protectedText.text).to.match(/⟦CIT_\d+⟧/);
    expect(protectedText.text).to.match(/⟦URL_\d+⟧/);
    expect(protectedText.text).to.match(/⟦DOI_\d+⟧/);
    expect(protectedText.text).to.match(/⟦MATH_\d+⟧/);

    const restored = restoreTranslationText(
      `参见 ${protectedText.text}`,
      protectedText,
    );
    expect(restored).to.include("(Rose, 1999)");
    expect(restored).to.include("Harvey (2005, p. 3)");
    expect(restored).to.include("https://example.com");
    expect(restored).to.include("10.1000/xyz");
    expect(restored).to.include("$x+y$");
    expect(restored).to.include('<td colspan="2">');
  });

  it("fails when a protected token is lost", function () {
    const protectedText = protectTranslationText("See (Rose, 1999).");
    expect(() => restoreTranslationText("参见该文。", protectedText)).to.throw(
      "lost protected token",
    );
  });

  it("protects narrative citations without swallowing sentence connectors", function () {
    const though = protectTranslationText(
      "Though Diao et al. (2022) identified dialogical agency, the contradiction remains.",
    );
    const whileText = protectTranslationText(
      "While Chen and Li (2025) traced emotion-agency interactions, they lacked a framework.",
    );
    expect(though.text).to.match(/^Though ⟦CIT_\d+⟧ identified/);
    expect(whileText.text).to.match(/^While ⟦CIT_\d+⟧ traced/);
    expect([...though.values.values()]).to.deep.equal(["Diao et al. (2022)"]);
    expect([...whileText.values.values()]).to.deep.equal([
      "Chen and Li (2025)",
    ]);
  });

  it("detects untranslated narrative connectors in non-English output", function () {
    expect(
      containsUntranslatedNarrativeConnector(
        "前文说明了局限。Though Diao et al. (2022) 识别了能动性。",
        "zh-CN",
      ),
    ).to.equal(true);
    expect(
      containsUntranslatedNarrativeConnector(
        "While Chen and Li (2025) traced the process.",
        "en",
      ),
    ).to.equal(false);
    expect(
      containsUntranslatedNarrativeConnector(
        "尽管 Diao et al. (2022) 识别了能动性，但仍有局限。",
        "zh-CN",
      ),
    ).to.equal(false);
  });

  it("parses @@id output without requiring JSON escaping", function () {
    const parsed = parseIDTranslations(`前言会被忽略
@@b0001
第一段
仍是第一段

@@b0002
第二段`);
    expect(parsed.get("b0001")).to.equal("第一段\n仍是第一段");
    expect(parsed.get("b0002")).to.equal("第二段");
  });

  it("parses structured JSON translations with multiline values", function () {
    const parsed = parseJSONTranslations(`\`\`\`json
{"translations":{"b0001":"第一段\\n第二行","b0002":"标题"}}
\`\`\``);
    expect(parsed.get("b0001")).to.equal("第一段\n第二行");
    expect(parsed.get("b0002")).to.equal("标题");
  });

  it("keeps block metadata separate from source text in both protocols", function () {
    const blocks = [
      {
        id: "b0001",
        type: "title",
        source: "Teacher agency",
        status: "pending",
      },
    ] as PaperDocument["blocks"];
    const protectedByID = new Map([
      ["b0001", protectTranslationText(blocks[0].source)],
    ]);
    const jsonMessages = paperTranslatorInternals.buildJSONBatchMessages(
      blocks,
      protectedByID,
      [],
      "zh-CN",
    );
    const textMessages = paperTranslatorInternals.buildTextBatchMessages(
      blocks,
      protectedByID,
      [],
      "zh-CN",
    );
    expect(jsonMessages[1].content).to.include('"type":"title"');
    expect(jsonMessages[1].content).not.to.include("[TYPE=");
    expect(textMessages[1].content).to.equal("@@b0001\nTeacher agency");
  });

  it("cleans leaked TYPE markers without changing legitimate prose", function () {
    expect(sanitizePaperTranslation("[TYPE=title]\n教师能动性")).to.equal(
      "教师能动性",
    );
    expect(
      sanitizePaperTranslation("**【type：paragraph】**\n这是译文。"),
    ).to.equal("这是译文。");
    expect(sanitizePaperTranslation("The type matters.")).to.equal(
      "The type matters.",
    );
    expect(containsPaperProtocolLeak("@@b0001\n译文")).to.equal(true);
  });

  it("repairs protocol markers in historical document checkpoints", function () {
    const historical = {
      version: 1,
      sourceAttachmentID: 1,
      sourceFingerprint: "x",
      parser: "mineru",
      metadata: {
        title: "Test",
        sourceLanguage: "en",
        targetLanguage: "zh-CN",
      },
      glossary: [],
      blocks: [
        {
          id: "b0001",
          type: "paragraph",
          source: "Source",
          translation: "[TYPE=paragraph]\n译文",
          status: "validated",
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    } as PaperDocument;
    expect(repairPaperDocumentTranslations(historical)).to.equal(1);
    expect(historical.blocks[0].translation).to.equal("译文");
    expect(historical.updatedAt).to.be.greaterThan(1);
  });

  it("matches built-in terms at word boundaries", function () {
    const document = {
      metadata: {
        title: "Test",
        sourceLanguage: "en",
        targetLanguage: "zh-CN",
      },
      blocks: [
        {
          id: "b0001",
          type: "paragraph",
          source: "This fact supports the finding.",
          status: "pending",
        },
      ],
    } as PaperDocument;
    const matched = paperTranslatorInternals.matchingGlossary(
      [
        { term: "act", translation: "行为" },
        { term: "fact", translation: "事实" },
      ],
      document,
    );
    expect(matched.map((entry) => entry.term)).to.deep.equal(["fact"]);
  });
});
