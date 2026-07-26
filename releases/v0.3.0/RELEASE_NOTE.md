# Context Translate 0.3.0

This feature release completes the Zotero 9 lookup and workbench experience.

## Added

- A permanent workbench button in the Zotero library toolbar
- Searchable dictionary phonetics, part of speech, definitions, and contextual
  explanations in reading history
- A local-dictionary-only mode that does not call DeepSeek or another LLM
- Explicit single-word lookup versus multi-word phrase translation routing

## Improved

- Selection and popup actions now use consistent vector icons instead of Emoji
- Zotero 9 Reader context-menu actions use clear plain-text labels
- One “保存全部设置” button now appears below all configuration groups
- Retry correctly bypasses the cached response
- History remains readable after its source Zotero item is deleted

## Verification

- Zotero 9 integration suite: 57 tests passed
- Production XPI build, TypeScript validation, and changed-file ESLint checks
  passed
