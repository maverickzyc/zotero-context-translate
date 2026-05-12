import { expect } from "chai";
import { parseSSEChunk, SSEParser } from "../src/modules/translate/stream-parser";

describe("stream-parser", () => {
  describe("parseSSEChunk", () => {
    it("extracts delta content from a data line", () => {
      const line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
      expect(parseSSEChunk(line)).to.equal("Hello");
    });

    it("returns null for [DONE] signal", () => {
      expect(parseSSEChunk("data: [DONE]")).to.be.null;
    });

    it("returns empty string for empty delta", () => {
      const line = 'data: {"choices":[{"delta":{}}]}';
      expect(parseSSEChunk(line)).to.equal("");
    });

    it("returns empty string for non-data lines", () => {
      expect(parseSSEChunk("")).to.equal("");
      expect(parseSSEChunk(": comment")).to.equal("");
      expect(parseSSEChunk("event: ping")).to.equal("");
    });
  });

  describe("SSEParser", () => {
    it("accumulates chunks and calls onChunk for each content piece", () => {
      const chunks: string[] = [];
      const parser = new SSEParser({
        onChunk: (text) => chunks.push(text),
        onDone: () => {},
        onError: () => {},
      });

      parser.feed('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
      parser.feed('data: {"choices":[{"delta":{"content":" world"}}]}\n\n');

      expect(chunks).to.deep.equal(["Hello", " world"]);
    });

    it("calls onDone with full text when [DONE] received", () => {
      let doneText = "";
      const parser = new SSEParser({
        onChunk: () => {},
        onDone: (text) => { doneText = text; },
        onError: () => {},
      });

      parser.feed('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n');
      parser.feed("data: [DONE]\n\n");

      expect(doneText).to.equal("Hi");
    });

    it("handles chunks split across feed boundaries", () => {
      const chunks: string[] = [];
      const parser = new SSEParser({
        onChunk: (text) => chunks.push(text),
        onDone: () => {},
        onError: () => {},
      });

      parser.feed('data: {"choices":[{"del');
      parser.feed('ta":{"content":"split"}}]}\n\n');

      expect(chunks).to.deep.equal(["split"]);
    });
  });
});
