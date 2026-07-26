import { HistoryRecord } from "../../types";
import { PaperJob, PaperJobStage } from "../paper-translate/types";

export const PAPER_PIPELINE_STAGES: PaperJobStage[] = [
  "extracting",
  "structuring",
  "terminology",
  "translating",
  "validating",
  "rendering",
  "attaching",
  "completed",
];

export interface WorkbenchHistoryEntry {
  libraryID: number;
  libraryName: string;
  record: HistoryRecord;
}

export function effectivePaperJobStage(job: PaperJob): PaperJobStage {
  if (
    ["paused", "failed", "cancelled", "queued"].includes(job.stage) &&
    job.lastActiveStage
  ) {
    return job.lastActiveStage;
  }
  return job.stage;
}

export function paperJobProgressPercent(job: PaperJob): number {
  if (job.stage === "completed") return 100;
  const stage = effectivePaperJobStage(job);
  const index = PAPER_PIPELINE_STAGES.indexOf(stage);
  if (index < 0) return 0;
  const localProgress =
    job.progress.total > 0
      ? Math.min(1, Math.max(0, job.progress.completed / job.progress.total))
      : 0;
  return Math.min(
    99,
    ((index + localProgress) / PAPER_PIPELINE_STAGES.length) * 100,
  );
}

export function filterWorkbenchHistory(
  entries: WorkbenchHistoryEntry[],
  query: string,
): WorkbenchHistoryEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;
  return entries.filter(({ libraryName, record }) =>
    [
      libraryName,
      record.selected,
      record.result,
      record.context,
      record.itemId,
      record.dictionary?.phonetic,
      record.dictionary?.pos,
      record.dictionary?.translation,
    ]
      .join("\n")
      .toLowerCase()
      .includes(normalized),
  );
}
