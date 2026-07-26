# Context Translate 0.3.2

This patch fixes the workbench toolbar icon color in Zotero 9.

## Fixed

- Inherit Zotero's native `--fill-secondary` foreground color in both themes
- Render the SVG through `currentColor` instead of falling back to black
- Keep Zotero's native hover and pressed-state backgrounds

## Expected colors

- Light mode: approximately `#707070` on the `#f9f9f9` toolbar
- Dark mode: approximately `#9e9e9e` on the `#272727` toolbar
- Exact values remain controlled by Zotero theme variables

## Verification

- Zotero 9 integration suite: 59 tests passed
- Production build, TypeScript validation, and changed-file ESLint passed
