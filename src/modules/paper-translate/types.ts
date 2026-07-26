import { GlossaryEntry } from "../../types";

export type PaperBlockType =
  | "title"
  | "author"
  | "heading"
  | "subheading"
  | "paragraph"
  | "quote"
  | "reference"
  | "image"
  | "caption"
  | "formula"
  | "table"
  | "drop";

export type PaperBlockStatus =
  | "pending"
  | "translated"
  | "validated"
  | "failed";

export interface PaperBlock {
  id: string;
  type: PaperBlockType;
  source: string;
  translation?: string;
  assetPath?: string;
  sourceAssetPath?: string;
  status: PaperBlockStatus;
  error?: string;
}

export interface PaperDocument {
  version: 1;
  sourceAttachmentID: number;
  sourceFingerprint: string;
  parser: PaperParserKind;
  metadata: {
    title: string;
    authors?: string;
    sourceLanguage: string;
    targetLanguage: string;
  };
  glossary: GlossaryEntry[];
  blocks: PaperBlock[];
  createdAt: number;
  updatedAt: number;
}

export type PaperParserKind = "auto" | "mineru" | "zotero-fulltext";
export type PaperTemplate = "classic" | "minimal" | "magazine";

export interface PaperTranslateOptions {
  parser: PaperParserKind;
  template: PaperTemplate;
  sourceLanguage: string;
  targetLanguage: string;
  concurrency: number;
  maxBatchCharacters: number;
  maxOutputTokens: number;
  mineruModel: "vlm" | "pipeline";
  mineruOCR: boolean;
}

export interface PaperSource {
  attachmentID: number;
  attachmentKey: string;
  parentItemID?: number;
  libraryID: number;
  title: string;
  authors?: string;
  filePath: string;
  fingerprint: string;
}

export interface ParsedAsset {
  originalPath: string;
  relativePath: string;
  contentType: string;
}

export interface ParsedPaper {
  markdown: string;
  assets: ParsedAsset[];
  parser: Exclude<PaperParserKind, "auto">;
}

export type PaperJobStage =
  | "queued"
  | "extracting"
  | "structuring"
  | "terminology"
  | "translating"
  | "validating"
  | "rendering"
  | "attaching"
  | "completed"
  | "paused"
  | "cancelled"
  | "failed";

export interface PaperJobProgress {
  completed: number;
  total: number;
  message: string;
}

export interface PaperUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
}

export interface PaperJobEvent {
  at: number;
  level: "info" | "warning" | "error";
  stage: PaperJobStage;
  message: string;
  detail?: string;
}

export interface PaperJob {
  version: 1;
  id: string;
  source: PaperSource;
  options: PaperTranslateOptions;
  stage: PaperJobStage;
  lastActiveStage?: PaperJobStage;
  progress: PaperJobProgress;
  usage: PaperUsage;
  outputAttachmentID?: number;
  outputPath?: string;
  error?: string;
  errorStack?: string;
  attempt?: number;
  runID?: string;
  startedAt?: number;
  heartbeatAt?: number;
  events?: PaperJobEvent[];
  createdAt: number;
  updatedAt: number;
}

export interface PaperJobListener {
  (job: PaperJob): void;
}

export interface ParserProgress {
  completed: number;
  total: number;
  message: string;
}

export interface DocumentParser {
  parse(
    source: PaperSource,
    jobDirectory: string,
    onProgress: (progress: ParserProgress) => void,
    signal: AbortSignal,
  ): Promise<ParsedPaper>;
}

export interface TranslationBatch {
  id: string;
  blockIDs: string[];
  characterCount: number;
}

export interface PaperValidationIssue {
  blockID?: string;
  code:
    | "duplicate-id"
    | "missing-source"
    | "missing-translation"
    | "unresolved-placeholder"
    | "protocol-leak"
    | "untranslated-connector"
    | "structure-boundary"
    | "missing-asset";
  message: string;
}

export interface PaperValidationResult {
  valid: boolean;
  issues: PaperValidationIssue[];
}

export const TRANSLATABLE_PAPER_BLOCKS = new Set<PaperBlockType>([
  "title",
  "heading",
  "subheading",
  "paragraph",
  "quote",
  "caption",
  "table",
]);

export function isTranslatableBlock(block: PaperBlock): boolean {
  return TRANSLATABLE_PAPER_BLOCKS.has(block.type);
}

export function emptyPaperUsage(): PaperUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requests: 0,
  };
}
