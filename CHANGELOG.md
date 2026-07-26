# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.3.5] - 2026-07-26

### Added

- Add conservative cross-page sentence repair for adjacent paragraphs and
  sentences interrupted by floated tables or figures
- Add a “修复结构并补译” workbench action for completed jobs; it retranslates
  only repaired or defective blocks and updates the existing Zotero attachment

### Changed

- Keep narrative citation protection anchored at the author name so sentence
  connectors such as `Though`, `Although`, `While`, and `Whereas` remain visible
  to the translation model
- Move the script-free language controls into a dedicated desktop side rail;
  narrow reader windows fall back to a non-sticky top row

### Fixed

- Merge MinerU page-boundary fragments before translation, including a sentence
  split around a floated table, without moving the table out of document order
- Detect untranslated English narrative connectors during translation and
  validation so affected blocks enter the existing per-block retry path
- Persist the raw MinerU Markdown beside each job checkpoint for diagnostics

### Tests

- Cover both observed split-boundary patterns, historical checkpoint repair,
  citation-token scope, residual connector validation, CSS side-rail structure,
  and the Zotero 9 repair API

## [0.3.4] - 2026-07-26

### Changed

- Use DeepSeek/OpenAI-compatible structured JSON output for whole-paper
  translation, with a marker-free text protocol as the compatibility fallback
- Replace JavaScript language buttons in all three bilingual HTML templates
  with Zotero Snapshot Reader-compatible radio controls and CSS selectors

### Fixed

- Stop `[TYPE=title]`, `[TYPE=paragraph]`, and related internal block metadata
  from leaking into new translations
- Clean legacy protocol markers from saved document checkpoints when users
  regenerate an existing HTML attachment, without calling MinerU or the LLM
- Reject residual protocol markers during validation and retry affected blocks
- Sanitize legacy markers once more at the HTML rendering boundary

### Tests

- Pass 67 tests in the Zotero 9 runtime, including structured and fallback
  protocols, legacy checkpoint repair, validation, rendering, and all three
  script-free CSS templates

## [0.3.3] - 2026-07-26

### Fixed

- Make lookup and translation popups draggable in Zotero 9 Reader documents
  using Pointer Events and pointer capture
- Use Reader-local client coordinates instead of unreliable screen coordinates
- Keep dragged popups inside the visible Reader viewport and exclude interactive
  header buttons from the drag handle

### Tests

- Verify in the Zotero 9 runtime that dragging the popup header updates its
  position and releases the drag state correctly

## [0.3.2] - 2026-07-26

### Fixed

- Make the library-toolbar workbench icon inherit Zotero 9's native
  `--fill-secondary` foreground color through `currentColor`
- Remove the unsupported context opacity fallback that caused the SVG to render
  black against Zotero's dark toolbar
- Preserve Zotero's native light/dark theme colors, hover background, and active
  background instead of hard-coding separate color values

### Tests

- Verify in the Zotero 9 runtime that the toolbar icon's computed fill equals
  its current theme color and is not black in dark mode

## [0.3.1] - 2026-07-26

### Fixed

- Replace automatic word-count routing in manual mode with two permanent,
  side-by-side “Lookup” and “Translate” selection actions
- Make the chosen action authoritative: Lookup requests contextual explanation,
  while Translate always requests translation, including for a single word
- Separate lookup and translation cache entries so the same selected text can
  use both actions without returning the other action's cached response
- Add both Lookup and Translate to the Zotero 9 Reader context menu
- Make the library-toolbar workbench button visible through Zotero's native
  `image` attribute and a theme-aware filled SVG
- Keep the workbench button at the end of the toolbar's left action group when
  later-loading add-ons insert their own controls

### Changed

- Default new and upgraded installations once to explicit selection buttons;
  users can still re-enable automatic translation in settings afterward

### Tests

- Pass 59 tests in the Zotero 9 integration runtime, including visible toolbar
  dimensions, late add-on ordering, dual selection controls, dual context-menu
  entries, and action-specific caches

## [0.3.0] - 2026-07-26

### Added

- Add a permanent Context Translate workbench button to the Zotero 9 library
  toolbar, immediately before the library search area
- Persist dictionary phonetics, part of speech, local definitions, contextual
  explanations, and lookup mode in reading history
- Search dictionary details from the unified workbench and show local
  dictionary results separately from LLM contextual explanations
- Add a dictionary-only lookup mode that never calls the configured LLM API

### Changed

- Route only a single English term to dictionary lookup; multi-word selections
  are now explicitly handled and recorded as phrase translations
- Replace emoji-based selection and popup actions with consistent vector icons;
  Zotero 9 Reader context-menu entries use plain text because its public API
  does not expose a safe custom-icon slot
- Move the one settings save action below all setting groups and rename it
  “Save All Settings”

### Fixed

- Make retry invalidate its cached result before starting a new request
- Keep workbench history usable when the original Zotero item has been deleted

### Tests

- Pass 57 tests in an isolated Zotero 9.0.6-compatible runtime, including the
  toolbar entry, dictionary-history rendering, preferences, and Reader controls

## [0.2.2] - 2026-07-26

### Fixed

- Restore PDF text-selection translation in Zotero 9 by using the view context
  menu event for raw selections instead of the annotation-only menu event
- Add a native “Translate” button to Zotero's text-selection popup in manual
  mode while keeping selection-triggered translation in automatic mode
- Explicitly load and save target-language and trigger-mode preferences because
  legacy XUL preference binding is not available in Zotero 9
- Render and position the translation panel in the active Reader document so it
  works in both reader tabs and standalone PDF windows
- Clean up stale outside-click listeners when selections or popups are replaced

### Tests

- Add Zotero 9 integration coverage for preference persistence and both manual
  text-selection entry points

## [0.2.1] - 2026-07-25

### Fixed

- Create `AbortController`, `fetch`, and `TextDecoder` from a Zotero DOM
  window so whole-paper jobs run inside the Zotero 9 bootstrap sandbox
- Keep every background execution in a tracked promise and persist startup
  failures instead of leaving jobs in a silent “restoring” state
- Prevent UI listener exceptions and pause/resume races from terminating a
  paper job without a visible result
- Persist long-running parser progress and heartbeat timestamps
- Re-render bilingual headings on separate lines and render simple LaTeX
  superscript/subscript markers in author metadata
- Update an existing bilingual HTML attachment in place instead of silently
  returning its stale file

### Added

- Per-job attempt numbers, recent activity timestamps, redacted diagnostic
  events, and error stacks in the workbench
- A “Regenerate HTML” action that rebuilds the existing Zotero attachment from
  the saved translation checkpoint without calling MinerU or the LLM again
- A small programmatic paper-job API for Zotero runtime diagnostics
- Zotero 9 coverage for DOM-window abort primitives and the paper-job API

## [0.2.0] - 2026-07-25

### Added

- Unified Context Translate workbench available from the Zotero Tools menu
- Searchable word, sentence, and paragraph translation history across Zotero
  libraries, with full context, copy, locate-item, and delete actions
- Whole-paper task dashboard with filters, stage pipeline, overall and
  block-level progress, usage, errors, timestamps, and output/source actions
- Live task updates while the workbench is open
- Zotero 9 integration coverage for opening and closing the workbench

### Fixed

- Resuming a paper job now immediately transitions to a visible restoring state
- Resume failures are persisted and displayed instead of becoming silent
  rejected promises
- Paused, failed, and restart-interrupted jobs retain or infer their last active
  pipeline stage
- Opening the task list no longer replaces live in-memory jobs with stale
  checkpoint copies
- New reading history is stored in the source item's actual Zotero library

## [0.1.1] - 2026-07-25

### Fixed

- Use the Fluent `.label` attribute required by Zotero 9 XUL menu items, fixing
  the blank “Generate Bilingual HTML” and “Paper Translation Jobs” entries
- Add a Zotero-process integration test that verifies the translated paper menu
  label is loaded and non-empty

### Changed

- Validate and package against the installed Zotero 9.0.6 runtime
- Narrow the declared maximum compatibility to the tested Zotero 9.0.x series

## [0.1.0] - 2026-07-25

### Added

- Whole-paper bilingual HTML translation from Zotero library items and PDF reader tabs
- High-fidelity MinerU parsing with OCR, figures, tables, and formulas
- Zotero full-text fallback mode that does not upload the PDF
- Resumable paper translation jobs with concurrent batches, retries, cancellation, and persistent checkpoints
- Paper-specific glossary generation using the original skill's 483-term
  built-in glossary, with each Zotero library's glossary taking precedence
- Deterministic block-ID translation protocol with citation, URL, DOI, code, and formula protection
- Classic, minimal, and magazine self-contained bilingual HTML templates
- Automatic import of the generated HTML as a child attachment of the source Zotero item
- Paper job progress panel and task history available from the Tools menu
- 12 whole-paper pipeline tests, bringing the local pure unit-test total to 44

### Changed

- Updated the built-in DeepSeek preset to `deepseek-v4-flash`
- Added non-streaming chat completion support for reliable document batch translation
- Paper translation explicitly disables DeepSeek thinking mode for bulk translation

## [0.0.1] - 2026-05-14

### Added

- **Context Engine**: PDF text layer extraction with paragraph detection, multi-column support, sentence boundary detection (handles academic abbreviations like "et al.", "Fig.", "e.g.")
- **Auto-grading context**: word (≤3 words) → sentence context, sentence → paragraph context, paragraph → surrounding paragraphs
- **LLM translation**: OpenAI-compatible API with SSE streaming, supports OpenAI, DeepSeek, Ollama, any compatible endpoint
- **Prompt system**: Level-specific Chinese prompts for academic translation (word explanation, sentence translation, paragraph translation)
- **Glossary system**: Term matching with token budget (~800 tokens), CSV import/export, per-library storage
- **Translation popup**: Dark-themed floating panel with streaming rendering, drag support, copy/retry/add-to-glossary actions
- **Translation history**: JSON persistence per library, filter by item, sort by time, max 1000 records
- **Preferences panel**: LLM config (API URL, key, model, temperature), language settings, glossary management
- **Zotero 8/9 compatibility**: ESM modules, Firefox 140 ESR target, Fluent i18n, manifest strict_min_version "8.0"
- **32 unit tests** across 5 test suites (paragraph detection, context resolver, stream parser, glossary, prompt builder)
- Design spec and implementation plan documentation
