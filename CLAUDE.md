# Zotero Context Translate — Project Instructions

## Project Overview

A Zotero translation plugin with **context-aware translation**: automatically extracts surrounding text (sentence/paragraph) when translating selected words or phrases, then sends context to LLM for more accurate academic translation.

- **Plugin type**: Independent Zotero 7/8/9 plugin (bootstrapped extension)
- **Target users**: Chinese researchers reading English academic papers
- **Key differentiator**: Context extraction + LLM-powered translation (vs. zotero-pdf-translate which only translates selected text)

## Tech Stack

- **Language**: TypeScript
- **Bundler**: esbuild → single JS file
- **Build tool**: zotero-plugin-scaffold
- **Libraries**: zotero-plugin-toolkit (v5.1+), zotero-types
- **i18n**: Fluent (.ftl)
- **Target**: Zotero 8+ (Firefox 140 ESR), manifest strict_max_version: "9.*"

## Project Structure

```
src/
├── index.ts                    # Entry point
├── hooks.ts                    # Bootstrap lifecycle hooks
├── modules/
│   ├── context/                # Context Engine (core differentiator)
│   │   ├── text-extractor.ts   #   PDF text layer extraction
│   │   ├── context-resolver.ts #   Auto-grading context resolution
│   │   ├── paragraph-detect.ts #   Paragraph boundary detection
│   │   └── page-cache.ts       #   Per-page text cache
│   ├── translate/              # Translation Layer
│   │   ├── llm-service.ts      #   OpenAI-compatible API + SSE streaming
│   │   ├── prompt-builder.ts   #   Level-based prompt construction
│   │   ├── stream-parser.ts    #   SSE stream parser
│   │   └── glossary.ts         #   Glossary manager
│   └── ui/                     # UI Layer
│       ├── popup.ts            #   Translation popup panel
│       ├── history.ts          #   Translation history
│       └── preferences.ts      #   Settings panel logic
└── utils/
    ├── prefs.ts
    └── locale.ts
```

## Architecture (4 layers)

1. **Plugin Entry** — bootstrap.js, registers Reader event listeners
2. **Context Engine** — Extracts text from PDF text layer, detects sentence/paragraph boundaries, caches per page
3. **Translation Layer** — Builds context-aware prompts, calls LLM via SSE streaming, injects glossary terms
4. **UI Layer** — Popup panel with streaming rendering, preferences, translation history

## Key Design Decisions

- **Context grading**: word (≤3 words) → sentence context; sentence → paragraph context; paragraph → surrounding paragraphs
- **Cache strategy**: Lazy per-page cache, extract on first selection, clear on document close
- **LLM only**: OpenAI-compatible `/v1/chat/completions` endpoint (covers OpenAI, DeepSeek, Ollama, etc.)
- **Glossary injection**: Token budget (~800 tokens), match all terms, trim by relevance if over budget
- **Zotero 8/9 compat**: ESM modules, native Promises, MenuManager API, Fluent i18n

## Coding Standards

- Code and comments: English
- Documentation: Chinese for user-facing, English for technical
- Commit convention: `feat:` | `fix:` | `refactor:` | `test:` | `docs:` | `chore:`
- All Zotero internal API calls (especially Reader/pdf.js) must be isolated in text-extractor.ts for easy adaptation

## Current Status

- [x] Design spec completed (docs/specs/2026-05-12-context-translate-design.md)
- [ ] Implementation plan
- [ ] Project scaffolding (zotero-plugin-template)
- [ ] Context Engine implementation
- [ ] Translation Layer implementation
- [ ] UI Layer implementation
- [ ] Testing & packaging

## Important Notes

- Reader text selection API is undocumented (issue zotero/zotero#3373), accessed via `reader._iframeWindow`. Wrap all such calls in text-extractor.ts.
- Multi-column PDF layout detection: MVP supports common 2-column format, complex layouts degrade to page-level context.
- Design spec: `docs/specs/2026-05-12-context-translate-design.md`
