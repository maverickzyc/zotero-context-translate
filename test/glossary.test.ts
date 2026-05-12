import { expect } from "chai";
import { matchGlossaryTerms } from "../src/modules/translate/glossary";
import { GlossaryEntry } from "../src/types";

describe("glossary", () => {
  const entries: GlossaryEntry[] = [
    { term: "epistemological", translation: "认识论的", field: "philosophy" },
    { term: "triangulation", translation: "三角验证", field: "methods" },
    { term: "mixed-methods", translation: "混合方法" },
    { term: "positivism", translation: "实证主义" },
    { term: "ontological", translation: "本体论的" },
  ];

  describe("matchGlossaryTerms", () => {
    it("matches terms found in text (case-insensitive)", () => {
      const text = "The Epistemological foundations challenge positivism.";
      const matched = matchGlossaryTerms(entries, text, text);
      expect(matched.map((m) => m.term)).to.include("epistemological");
      expect(matched.map((m) => m.term)).to.include("positivism");
    });

    it("does not return unmatched terms", () => {
      const text = "A simple sentence with no jargon.";
      const matched = matchGlossaryTerms(entries, text, text);
      expect(matched).to.have.length(0);
    });

    it("prioritizes terms in selected text over context-only terms", () => {
      const selected = "epistemological";
      const context = "The epistemological foundations of triangulation and mixed-methods and positivism and ontological approaches.";
      const matched = matchGlossaryTerms(entries, selected, context, 3);
      expect(matched[0].term).to.equal("epistemological");
      expect(matched.length).to.be.at.most(3);
    });

    it("respects maxTerms limit", () => {
      const text = "epistemological triangulation mixed-methods positivism ontological";
      const matched = matchGlossaryTerms(entries, text, text, 2);
      expect(matched).to.have.length(2);
    });
  });
});
