# Context Translate 0.3.1

This patch corrects the selection interaction and the Zotero 9 toolbar entry.

## Fixed

- Always show side-by-side “查词” and “翻译” buttons in manual selection mode
- Let the clicked button choose the operation instead of selected-word count
- Keep lookup and translation caches separate for the same text
- Add both actions to the Zotero Reader context menu
- Use Zotero's native toolbar image mechanism and a theme-aware filled SVG
- Keep the workbench button immediately before the flexible toolbar spacer,
  including when other add-ons load their buttons later
- Migrate existing installations once to the explicit-button mode; automatic
  translation remains available as an optional setting

## Verification

- Zotero 9 integration suite: 59 tests passed
- Pure focused tests: 19 passed
- Production build, TypeScript validation, and changed-file ESLint passed
