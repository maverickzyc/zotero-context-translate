import { expect } from "chai";
import { ContextLevel } from "../src/types";
import {
  clearAllTranslateCache,
  getCached,
  setCache,
} from "../src/modules/context/translate-cache";

describe("translation action cache", function () {
  beforeEach(function () {
    clearAllTranslateCache();
  });

  it("keeps lookup and translation results separate for identical text", function () {
    setCache(1, 2, "agency", "lookup", {
      level: ContextLevel.Word,
      dictResult: null,
      llmResult: "语境查词结果",
      timestamp: 1,
    });
    setCache(1, 2, "agency", "translate", {
      level: ContextLevel.Sentence,
      dictResult: null,
      llmResult: "翻译结果",
      timestamp: 2,
    });

    expect(getCached(1, 2, "agency", "lookup")?.llmResult).to.equal(
      "语境查词结果",
    );
    expect(getCached(1, 2, "agency", "translate")?.llmResult).to.equal(
      "翻译结果",
    );
  });

  it("invalidates only the selected action", function () {
    setCache(1, 2, "agency", "lookup", {
      level: ContextLevel.Word,
      dictResult: null,
      llmResult: "旧查词结果",
      timestamp: 0,
    });
    setCache(1, 2, "agency", "translate", {
      level: ContextLevel.Sentence,
      dictResult: null,
      llmResult: "仍可使用的翻译",
      timestamp: 2,
    });

    expect(getCached(1, 2, "agency", "lookup")).to.equal(null);
    expect(getCached(1, 2, "agency", "translate")?.llmResult).to.equal(
      "仍可使用的翻译",
    );
  });
});
