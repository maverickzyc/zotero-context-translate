# Zotero Context Translate v0.2.1

This Zotero 9 compatibility hotfix repairs whole-paper jobs that remained at
“restoring” and returned to “interrupted” after refresh.

## Fixes

- Uses DOM-window `AbortController`, `fetch`, and `TextDecoder` in the Zotero 9
  bootstrap sandbox.
- Tracks the complete background execution promise and records every startup
  failure in the job checkpoint.
- Prevents pause/resume races and workbench listener errors from silently
  stopping a task.
- Persists parser heartbeats and exposes attempt number, recent activity,
  diagnostic events, and redacted error stacks in the workbench.
- Updates an existing HTML attachment in place and adds a checkpoint-only
  “Regenerate HTML” action.
- Separates bilingual headings and renders simple author superscripts and
  subscripts correctly.

## Validation

- DeepSeek model listing and a minimal chat completion were verified with the
  configured provider.
- MinerU authentication and upload-URL creation were verified.
- A user-authorized 11-page MinerU + DeepSeek end-to-end translation completed
  successfully: 106/106 translatable blocks, 40 glossary entries, two embedded
  assets, and one Zotero HTML attachment.
- The final output and checkpoint copies are byte-identical, and the attachment
  was visually inspected in English, Chinese, and bilingual rendering modes.
- 51 tests pass inside Zotero 9.0.6.
