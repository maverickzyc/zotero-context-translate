import { expect } from "chai";
import {
  mergePaperGlossaries,
  parsePaperGlossaryTSV,
} from "../src/modules/paper-translate/default-glossary";

describe("paper default glossary", function () {
  it("parses the skill TSV format", function () {
    const entries = parsePaperGlossaryTSV(
      "en\tzh\tnote\napparent time\t显像时间\t又译「表观时间」\n",
    );
    expect(entries).to.deep.equal([
      {
        term: "apparent time",
        translation: "显像时间",
        note: "又译「表观时间」",
      },
    ]);
  });

  it("lets the Zotero library glossary override built-in terms", function () {
    const merged = mergePaperGlossaries(
      [{ term: "agency", translation: "能动性" }],
      [{ term: "Agency", translation: "行动能力", note: "本项目约定" }],
    );
    expect(merged).to.deep.equal([
      {
        term: "Agency",
        translation: "行动能力",
        note: "本项目约定",
      },
    ]);
  });
});
