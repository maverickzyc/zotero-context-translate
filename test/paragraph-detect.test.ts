import { expect } from "chai";
import {
  reconstructParagraphs,
  detectColumns,
  splitSentences,
} from "../src/modules/context/paragraph-detect.js";

describe("paragraph-detect", () => {
  describe("reconstructParagraphs", () => {
    it("groups text items into lines by Y coordinate", () => {
      const items = [
        { str: "Hello ", x: 0, y: 100, width: 30, height: 12 },
        { str: "world.", x: 30, y: 100, width: 30, height: 12 },
        { str: "Next line.", x: 0, y: 86, width: 50, height: 12 },
      ];
      const result = reconstructParagraphs(items);
      expect(result.paragraphs).to.have.length(1);
      expect(result.paragraphs[0]).to.include("Hello world.");
      expect(result.paragraphs[0]).to.include("Next line.");
    });

    it("detects paragraph breaks from large vertical gaps", () => {
      const items = [
        { str: "First paragraph.", x: 0, y: 200, width: 80, height: 12 },
        { str: "Second paragraph.", x: 0, y: 170, width: 80, height: 12 },
      ];
      const result = reconstructParagraphs(items);
      expect(result.paragraphs).to.have.length(2);
      expect(result.paragraphs[0]).to.equal("First paragraph.");
      expect(result.paragraphs[1]).to.equal("Second paragraph.");
    });

    it("returns rawText as joined paragraphs", () => {
      const items = [
        { str: "Para one.", x: 0, y: 200, width: 40, height: 12 },
        { str: "Para two.", x: 0, y: 170, width: 40, height: 12 },
      ];
      const result = reconstructParagraphs(items);
      expect(result.rawText).to.equal("Para one.\nPara two.");
    });
  });

  describe("detectColumns", () => {
    it("returns 1 for single-column layout", () => {
      const items = [
        { str: "Line 1", x: 50, y: 100, width: 200, height: 12 },
        { str: "Line 2", x: 50, y: 88, width: 200, height: 12 },
      ];
      expect(detectColumns(items)).to.equal(1);
    });

    it("returns 2 for two-column layout", () => {
      const items = [
        { str: "Left col", x: 50, y: 100, width: 200, height: 12 },
        { str: "Right col", x: 320, y: 100, width: 200, height: 12 },
        { str: "Left 2", x: 50, y: 88, width: 200, height: 12 },
        { str: "Right 2", x: 320, y: 88, width: 200, height: 12 },
      ];
      expect(detectColumns(items)).to.equal(2);
    });
  });

  describe("splitSentences", () => {
    it("splits on sentence-ending punctuation", () => {
      const text = "First sentence. Second sentence? Third!";
      const sentences = splitSentences(text);
      expect(sentences).to.deep.equal([
        "First sentence.",
        "Second sentence?",
        "Third!",
      ]);
    });

    it("does not split on common abbreviations", () => {
      const text = "Smith et al. found that e.g. in Fig. 3 the results were significant.";
      const sentences = splitSentences(text);
      expect(sentences).to.have.length(1);
    });

    it("does not split on decimal numbers", () => {
      const text = "The p-value was 0.05 and the effect size was 3.14 units.";
      const sentences = splitSentences(text);
      expect(sentences).to.have.length(1);
    });

    it("handles multiple sentences with abbreviations", () => {
      const text = "See Fig. 1 for details. The results (p < 0.05) were significant.";
      const sentences = splitSentences(text);
      expect(sentences).to.have.length(2);
    });
  });
});
