import { expect } from "chai";
import {
  determineLevel,
  resolveContext,
} from "../src/modules/context/context-resolver";
import { ContextLevel } from "../src/types";

describe("context-resolver", function () {
  describe("determineLevel", function () {
    it("returns Word for 1-3 word selections", function () {
      expect(determineLevel("epistemological")).to.equal(ContextLevel.Word);
      expect(determineLevel("mixed methods")).to.equal(ContextLevel.Word);
      expect(determineLevel("et al findings")).to.equal(ContextLevel.Word);
    });

    it("returns Sentence for 4+ words with ≤1 period", function () {
      expect(
        determineLevel("This approach challenges traditional assumptions."),
      ).to.equal(ContextLevel.Sentence);
      expect(
        determineLevel("the results were statistically significant"),
      ).to.equal(ContextLevel.Sentence);
    });

    it("returns Paragraph for text with 2+ sentence-ending punctuation", function () {
      expect(
        determineLevel("First sentence. Second sentence. Third sentence."),
      ).to.equal(ContextLevel.Paragraph);
    });
  });

  describe("resolveContext", function () {
    const paragraphs = [
      "This is the introduction paragraph with some context about the study.",
      "The methodology section describes the mixed-methods approach. It combines qualitative and quantitative data. The epistemological foundations challenge positivism.",
      "Results showed significant findings in the primary analysis.",
    ];

    it("returns sentence context for word-level selection", function () {
      const result = resolveContext("epistemological", paragraphs);
      expect(result.level).to.equal(ContextLevel.Word);
      expect(result.context).to.include("epistemological");
      expect(result.context.length).to.be.greaterThan("epistemological".length);
    });

    it("returns paragraph context for sentence-level selection", function () {
      const selected = "It combines qualitative and quantitative data.";
      const result = resolveContext(selected, paragraphs);
      expect(result.level).to.equal(ContextLevel.Sentence);
      expect(result.context).to.include("methodology");
      expect(result.context).to.include("epistemological");
    });

    it("returns surrounding paragraphs for paragraph-level selection", function () {
      const selected =
        "The methodology section describes the mixed-methods approach. It combines qualitative and quantitative data. The epistemological foundations challenge positivism.";
      const result = resolveContext(selected, paragraphs);
      expect(result.level).to.equal(ContextLevel.Paragraph);
      expect(result.context).to.include("introduction");
      expect(result.context).to.include("Results");
    });

    it("handles selection not found in paragraphs gracefully", function () {
      const result = resolveContext("nonexistent text", paragraphs);
      expect(result.level).to.equal(ContextLevel.Word);
      expect(result.context).to.equal("");
    });
  });
});
