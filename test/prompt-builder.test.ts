import { expect } from "chai";
import { buildPrompt } from "../src/modules/translate/prompt-builder";
import { ContextLevel, GlossaryEntry } from "../src/types";

describe("prompt-builder", () => {
  const glossaryEntries: GlossaryEntry[] = [
    { term: "epistemological", translation: "认识论的" },
  ];

  describe("buildPrompt", () => {
    it("builds word-level prompt with sentence context", () => {
      const messages = buildPrompt({
        level: ContextLevel.Word,
        selected: "epistemological",
        context: "The epistemological foundations challenge positivism.",
        glossaryEntries,
        targetLanguage: "zh-CN",
      });
      expect(messages).to.have.length(2);
      expect(messages[0].role).to.equal("system");
      expect(messages[0].content).to.include("词");
      expect(messages[1].role).to.equal("user");
      expect(messages[1].content).to.include("epistemological");
      expect(messages[1].content).to.include("epistemological → 认识论的");
    });

    it("builds sentence-level prompt with paragraph context", () => {
      const messages = buildPrompt({
        level: ContextLevel.Sentence,
        selected: "This approach challenges assumptions.",
        context: "Full paragraph text here with multiple sentences.",
        glossaryEntries: [],
        targetLanguage: "zh-CN",
      });
      expect(messages).to.have.length(2);
      expect(messages[0].content).to.include("句子");
      expect(messages[1].content).to.include("This approach");
    });

    it("builds paragraph-level prompt with surrounding context", () => {
      const messages = buildPrompt({
        level: ContextLevel.Paragraph,
        selected: "The methodology paragraph.",
        context: "[前一段] Introduction.\n\n[选中段] The methodology paragraph.\n\n[后一段] Results.",
        glossaryEntries: [],
        targetLanguage: "zh-CN",
      });
      expect(messages).to.have.length(2);
      expect(messages[0].content).to.include("段");
    });

    it("includes glossary section when entries match", () => {
      const messages = buildPrompt({
        level: ContextLevel.Word,
        selected: "epistemological",
        context: "Some context.",
        glossaryEntries,
        targetLanguage: "zh-CN",
      });
      const userMsg = messages[1].content;
      expect(userMsg).to.include("epistemological → 认识论的");
    });

    it("omits glossary section when no entries", () => {
      const messages = buildPrompt({
        level: ContextLevel.Word,
        selected: "hello",
        context: "Some context.",
        glossaryEntries: [],
        targetLanguage: "zh-CN",
      });
      const userMsg = messages[1].content;
      expect(userMsg).to.not.include("术语参考");
    });
  });
});
