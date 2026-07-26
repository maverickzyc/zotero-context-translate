# Context Translate 0.3.4

This patch makes bilingual HTML controls work in Zotero's static Snapshot
Reader and prevents internal translation markers from appearing in the paper.

## Changed

- English, 中文, and 双语 now switch through HTML radio controls and CSS only;
  the generated attachment contains no JavaScript
- Whole-paper translation now requests a structured JSON response first and
  automatically falls back to a marker-free text protocol when necessary

## Fixed

- New translation results strip and reject leaked `[TYPE=…]` protocol markers
- “重新生成 HTML” cleans markers already stored in historical task checkpoints
  before updating the Zotero attachment, without using MinerU or LLM tokens
- HTML rendering includes a final compatibility cleanup for older documents

## Verification

- Zotero 9 integration suite: 67 tests passed
- Production build, TypeScript validation, Prettier, and changed-file ESLint
  passed
