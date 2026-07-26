# Context Translate 0.3.3

This patch restores draggable lookup and translation popups in Zotero 9.

## Fixed

- Drag the popup by holding its top title bar
- Keep pointer tracking reliable inside Zotero's embedded PDF Reader
- Prevent the popup from being dragged outside the visible Reader area
- Keep the pin and close buttons clickable without starting a drag

## Verification

- Zotero 9 integration suite: 60 tests passed
- Production build, TypeScript validation, and changed-file ESLint passed
