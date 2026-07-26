import { expect } from "chai";
import { ContextLevel } from "../src/types";
import { PaperJob } from "../src/modules/paper-translate/types";
import {
  effectivePaperJobStage,
  filterWorkbenchHistory,
  paperJobProgressPercent,
} from "../src/modules/ui/workbench-model";

function job(overrides: Partial<PaperJob> = {}): PaperJob {
  return {
    version: 1,
    id: "job-1",
    source: {
      attachmentID: 1,
      attachmentKey: "ABC",
      libraryID: 1,
      title: "Paper",
      filePath: "/tmp/paper.pdf",
      fingerprint: "fp",
    },
    options: {
      parser: "auto",
      template: "classic",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      concurrency: 2,
      maxBatchCharacters: 24000,
      maxOutputTokens: 8192,
      mineruModel: "vlm",
      mineruOCR: true,
    },
    stage: "translating",
    progress: { completed: 5, total: 10, message: "Translating" },
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("workbench model", function () {
  it("keeps the interrupted pipeline stage visible while paused", function () {
    const paused = job({
      stage: "paused",
      lastActiveStage: "translating",
    });
    expect(effectivePaperJobStage(paused)).to.equal("translating");
    expect(paperJobProgressPercent(paused)).to.be.greaterThan(40);
  });

  it("reports completed jobs as 100 percent", function () {
    expect(paperJobProgressPercent(job({ stage: "completed" }))).to.equal(100);
  });

  it("searches source, result, context and library name", function () {
    const entries = [
      {
        libraryID: 1,
        libraryName: "My Library",
        record: {
          id: "history-1",
          selected: "agency",
          context: "teacher agency",
          level: ContextLevel.Word,
          result: "能动性",
          operation: "lookup" as const,
          dictionary: {
            phonetic: "ˈeɪdʒənsi",
            pos: "n.",
            translation: "代理；能动性",
          },
          itemId: "1",
          page: 2,
          timestamp: 1,
        },
      },
    ];
    expect(filterWorkbenchHistory(entries, "能动").length).to.equal(1);
    expect(filterWorkbenchHistory(entries, "teacher").length).to.equal(1);
    expect(filterWorkbenchHistory(entries, "ˈeɪdʒənsi").length).to.equal(1);
    expect(filterWorkbenchHistory(entries, "代理").length).to.equal(1);
    expect(filterWorkbenchHistory(entries, "missing").length).to.equal(0);
  });
});
