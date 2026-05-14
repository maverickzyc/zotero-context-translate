# Zotero Context Translate — Project Instructions

## Project Overview

A Zotero 8/9 translation plugin with **context-aware translation**: automatically extracts surrounding text (sentence/paragraph) when translating, then sends context to LLM for more accurate academic translation. Two-stage rendering: offline dictionary provides instant results, followed by streaming LLM contextual analysis.

- **Plugin type**: Independent Zotero plugin (bootstrapped extension, XPI)
- **Target users**: Chinese researchers reading English academic papers
- **Key differentiator**: Context extraction + two-stage rendering (dict + LLM) vs. zotero-pdf-translate which only translates selected text
- **Current version**: 0.0.1
- **Compatibility**: Zotero 8.0 ~ 9.* (Firefox 140 ESR)

## Tech Stack

- **Language**: TypeScript
- **Bundler**: esbuild → single JS file
- **Build tool**: zotero-plugin-scaffold (0.8.2+)
- **Libraries**: zotero-plugin-toolkit (v5.1+), zotero-types
- **i18n**: Fluent (.ftl)
- **Package manager**: npm
- **Test**: mocha + chai + tsx

## Commands

```bash
npm run build    # Build plugin → .scaffold/build/zotero-context-translate.xpi
npm run start    # Dev mode: build + install to Zotero + hot reload (requires .env)
npm run test     # Run tests inside Zotero
npx mocha --require tsx test/*.test.ts   # Run unit tests locally
```

`.env` must contain:
```
ZOTERO_PLUGIN_ZOTERO_BIN_PATH = /Applications/Zotero.app/Contents/MacOS/zotero
ZOTERO_PLUGIN_PROFILE_PATH = /Users/yongchen/Documents/Zotero-Dev
```

## Project Structure

```
├── addon/                          # Plugin resources (packaged into XPI)
│   ├── manifest.json               # WebExtension manifest (strict_min: 8.0, max: 9.*)
│   ├── bootstrap.js                # Zotero bootstrap entry
│   ├── prefs.js                    # Default preferences
│   ├── dict/ecdict-subset.json     # Bundled lightweight dictionary (50K entries, 3.8MB)
│   ├── content/
│   │   ├── preferences.xhtml       # Settings panel UI
│   │   └── icons/
│   └── locale/{en-US,zh-CN}/       # Fluent locale files
│
├── src/                            # TypeScript source
│   ├── index.ts                    # Entry: creates Addon instance
│   ├── addon.ts                    # Addon class (state, hooks, api)
│   ├── hooks.ts                    # Bootstrap lifecycle + orchestration (LARGEST FILE ~550 lines)
│   ├── types.ts                    # Shared interfaces (ContextLevel, PageTextData, etc.)
│   ├── modules/
│   │   ├── context/                # ② Context Engine
│   │   │   ├── text-extractor.ts   #   PDF text extraction via iframe eval (cross-compartment)
│   │   │   ├── context-resolver.ts #   Auto-grading: word→sentence, sentence→paragraph
│   │   │   ├── paragraph-detect.ts #   Reconstruct paragraphs from pdf.js TextItems
│   │   │   ├── page-cache.ts       #   Per-page text cache (Map, cleared on doc close)
│   │   │   ├── translate-cache.ts  #   Translation result cache (avoids repeat API calls)
│   │   │   └── dictionary.ts       #   Offline ECDICT dictionary (load/lookup/download)
│   │   ├── translate/              # ③ Translation Layer
│   │   │   ├── llm-service.ts      #   OpenAI-compatible API + SSE streaming + multi-preset
│   │   │   ├── prompt-builder.ts   #   Level-based prompts with --- separator for two-zone
│   │   │   ├── stream-parser.ts    #   SSE text/event-stream parser
│   │   │   └── glossary.ts         #   Glossary CRUD + matching + CSV import/export
│   │   └── ui/                     # ④ UI Layer
│   │       ├── popup.ts            #   Main window div popup (drag, pin, close, streaming)
│   │       ├── history.ts          #   JSON file persistence per library
│   │       └── preferences.ts      #   Settings panel logic (presets, dict, glossary)
│   └── utils/
│       ├── prefs.ts                #   Preference helpers (from template)
│       ├── locale.ts               #   i18n helpers
│       ├── ztoolkit.ts             #   Toolkit factory
│       └── window.ts               #   Window helpers
│
├── test/                           # Unit tests (mocha + chai)
│   ├── paragraph-detect.test.ts    #   9 tests
│   ├── context-resolver.test.ts    #   7 tests
│   ├── stream-parser.test.ts       #   7 tests
│   ├── glossary.test.ts            #   4 tests
│   └── prompt-builder.test.ts      #   5 tests
│
├── docs/
│   ├── specs/                      # Design specifications
│   │   ├── 2026-05-12-context-translate-design.md   # Original MVP design
│   │   └── 2026-05-13-settings-enhancement-design.md
│   └── plans/
│       └── 2026-05-13-mvp-implementation.md
│
├── releases/                       # Packaged releases
│   └── v0.0.1/
│       ├── zotero-context-translate-0.0.1.xpi
│       └── RELEASE_NOTE.md
│
├── CHANGELOG.md
└── CLAUDE.md                       # This file
```

## Architecture

### Four-layer design

1. **Plugin Entry** (`bootstrap.js` → `hooks.ts`) — Registers Reader event listeners, manages lifecycle
2. **Context Engine** — Extracts text from PDF via `iframeWin.eval()` (cross-compartment sandbox workaround), detects paragraphs, auto-grades context level, caches per page
3. **Translation Layer** — Builds level-specific prompts with `---` separator for two-zone streaming, calls LLM via SSE, manages glossary with token budget
4. **UI Layer** — Fixed-position div in main Zotero window (not reader iframe) for reliable drag/dismiss

### Key data flow

```
User selects text → renderTextSelectionPopup event
  → params.annotation.text (selected text from Zotero 9 API)
  → Check translate cache → if hit, show instantly with "缓存" badge
  → if miss:
    → iframeWin.eval() extracts page text from pdf.js
    → reconstructParagraphs() → resolveContext() → auto-grade level
    → lookupPhrase() → instant dict result in dictArea
    → buildPrompt() with --- separator + glossary terms
    → streamTranslation() → SSE chunks split at --- into contentArea/analysisArea
    → Save to cache + history
```

### Critical technical decisions

| Decision | Rationale |
|---|---|
| `iframeWin.eval()` for PDF text | Cross-compartment sandbox blocks direct pdf.js API access ("Permission denied") |
| `params.annotation.text` for selection | `getSelectedText(reader)` returns `[object Object]` in Zotero 9 |
| Popup in main window document | Reader iframe mouse events don't propagate to div overlays |
| `---` separator in prompts | Single LLM call splits into translation + analysis zones via stream detection |
| `screenX/screenY` via `mozInnerScreenX` | Convert reader iframe coords to main window fixed positioning |

## Coding Standards

- Code and comments: English
- Documentation: Chinese for user-facing, English for technical
- Commit convention: `feat:` | `fix:` | `refactor:` | `test:` | `docs:` | `chore:` | `release:`
- All Zotero internal API calls must be isolated in `text-extractor.ts`
- All DOM elements created via `createElementNS("http://www.w3.org/1999/xhtml", tag)` in main window context

## Known Issues & Gotchas

1. **`text-extractor.ts` uses undocumented Zotero APIs** — `reader._iframeWindow.wrappedJSObject._reader._primaryView._iframeWindow.eval()`. May break on Zotero updates. Issue zotero/zotero#3373 tracks official API.

2. **Cross-compartment sandbox** — pdf.js runs in content compartment; plugin in privileged. `page.getTextContent()` works but result can't cross boundary. Solution: eval extraction code inside the iframe and return JSON string.

3. **Popup drag** — Previous attempts with XUL `<panel backdrag>` and reader-doc overlays failed. Current solution: fixed-position div in main Zotero window with `screenX/screenY` coordinate conversion.

4. **SSE double-call** — `SSEParser.finish()` could call `onDone` twice if `[DONE]` was already received. Fixed with `finished` flag.

5. **Dictionary download** — ECDICT source is a 65MB CSV on GitHub. Plugin downloads CSV and converts to JSON locally. jsDelivr `fastly.` subdomain used as China CDN fallback.

6. **Preferences XHTML** — Must use `<vbox>` root (not `<html>`), labels via `value=""` attribute (not `data-l10n-id` which caused "not well-formed XML" errors).

## Current Status (v0.0.1)

- [x] Core: context-aware translation (word/sentence/paragraph levels)
- [x] Two-stage rendering: offline dictionary + LLM streaming
- [x] Two-zone streaming: translation above --- analysis below (sentence/paragraph)
- [x] Multi-model presets (DeepSeek/OpenAI/OpenRouter/Ollama/Claude/自定义)
- [x] Trigger modes: auto-translate / right-click context menu
- [x] Translation cache (same doc + page + text → instant result)
- [x] Translation history (📜 button, last 10 records)
- [x] Popup UX: drag, pin (📌), close (✕), click-outside dismiss
- [x] Glossary system with token-budget injection + CSV import/export
- [x] Dictionary management (bundled 50K + downloadable 770K)
- [x] Settings panel: LLM config, trigger mode, dictionary, glossary
- [x] 32 unit tests passing
- [x] XPI packaged (1.4MB)

## Next Steps (potential v0.1.0)

- [ ] Keyboard shortcut to trigger translation
- [ ] Side panel for translation history (instead of popup inline)
- [ ] Auto-detect and suggest glossary terms from translation results
- [ ] Support EPUB reader (not just PDF)
- [ ] Zotero note integration (save translations to notes)
- [ ] Publish to GitHub with CI/CD release pipeline
- [ ] Write user-facing README with screenshots
