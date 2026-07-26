# Context Translate 0.2.2

This patch restores PDF text-selection translation on Zotero 9.

## Fixed

- Use Zotero 9's PDF view context-menu event for raw text selections
- Add a native “📖 翻译” action to the text-selection popup in manual mode
- Keep automatic translation available through the “选中自动翻译” setting
- Explicitly persist trigger mode and target language in Zotero preferences
- Render the translation panel inside the active Reader document so positioning
  works in both reader tabs and standalone PDF windows
- Clean up stale popup dismissal listeners between selections

## Verification

- Zotero 9 integration suite: 53 tests passed
- Production XPI build and TypeScript validation passed
