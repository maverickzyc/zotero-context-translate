<div align="center">

<img src="addon/content/icons/icon.svg" width="88" alt="">

# Zotero Context Translate

**Context-aware translation for reading English papers in Zotero.**

Most translation plugins send your selection to an engine and hand back the
result. This one first rebuilds the sentence and paragraph the selection sits
in, then asks an LLM to translate and explain it in that context.

[![Release](https://img.shields.io/github/v/release/maverickzyc/zotero-context-translate?style=flat-square&color=CC2936)](https://github.com/maverickzyc/zotero-context-translate/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/maverickzyc/zotero-context-translate/total?style=flat-square)](https://github.com/maverickzyc/zotero-context-translate/releases)
[![Zotero](https://img.shields.io/badge/Zotero-8.0%20–%209.0-CC2936?style=flat-square)](https://www.zotero.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/maverickzyc/zotero-context-translate/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/maverickzyc/zotero-context-translate/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)](LICENSE)

[简体中文](README.md) · English

</div>

<!--
Screenshot placeholder: record a 6-10s GIF (select -> instant dictionary hit ->
streaming LLM result), save it as docs/images/demo-selection.gif, then delete
this comment block and keep the line below. Shot list: docs/images/README.md

![Context translation demo](docs/images/demo-selection.gif)
-->

> **Note on language.** The plugin targets English → Chinese academic reading,
> and its interface and prompts are tuned for that direction. The target
> language is configurable, but other directions are untested.

## What it does

Two things set it apart from a plain selection translator:

1. **Context before translation.** The plugin reconstructs the sentence and
   paragraph around your selection from the PDF (paragraph level also pulls in
   the neighbouring paragraphs) and sends that, plus your glossary, to the model.
2. **No blank waiting.** A bundled offline dictionary answers instantly while
   the model's contextual explanation streams into the same popup.

On top of that, it can turn a **whole paper** into a single self-contained HTML
file that switches between English / Chinese / bilingual, and file it back onto
the original Zotero item as a child attachment.

## Which plugin should you use?

If you just want to understand a selected passage quickly,
[zotero-pdf-translate](https://github.com/windingwind/zotero-pdf-translate) is
more mature and supports far more engines (Google, DeepL, and others). Start
there.

This plugin makes a different trade:

|                    | Zotero Context Translate                                         | Typical selection translator |
| ------------------ | ---------------------------------------------------------------- | ---------------------------- |
| Sent to the engine | selection **+ its sentence/paragraph + neighbours**              | the selection itself         |
| Presentation       | instant dictionary hit → streaming LLM result                    | wait for the engine          |
| Terminology        | per-library glossary, injected on body matches                   | usually none                 |
| Whole paper        | self-contained bilingual HTML, saved to the item                 | usually none                 |
| Engines            | OpenAI-compatible APIs (DeepSeek, OpenRouter, Ollama, Claude, …) | many more engines            |

In short: **better translations and long-form reading, at the cost of bringing
your own LLM API key.**

## Install

1. Download `zotero-context-translate.xpi` from
   [Releases](https://github.com/maverickzyc/zotero-context-translate/releases/latest).
2. In Zotero, open **Tools → Add-ons**, click the gear icon →
   **Install Plugin From File…**, pick the XPI, and restart Zotero.
3. Open **Settings → Context Translate** and fill in the API base URL, key and
   model for DeepSeek or any other OpenAI-compatible service.

Updates are then picked up automatically from GitHub Releases.

> **Compatibility**: declared for Zotero 8.0 – 9.0.\*, developed and verified
> against Zotero 9.0.6. PDF reader only — EPUB is not supported yet.

### Cost

The plugin is free and open source. Your LLM API is what costs money:

- **Free path**: set word lookup to dictionary-only — no network calls at all.
- **Selection translation**: hundreds to a few thousand tokens per call.
- **Whole-paper translation**: tens of thousands to low hundreds of thousands of
  tokens for a 20-page paper. MinerU parsing has its own quota rules.

## Features

### Context-aware selection translation

The selection popup always offers **Look up** and **Translate** side by side —
selecting a single word does not silently switch you to dictionary mode.

- **Look up** shows the local dictionary entry (phonetics, part of speech,
  definitions) first, then adds the model's contextual explanation. Can be set
  to dictionary-only to skip the API entirely.
- **Translate** always uses context. A sentence pulls in its paragraph; a
  paragraph pulls in the neighbours and additionally reports discourse
  relations and the core claim.

Streaming output, a translation cache (same document, same page, same text),
history, and a per-library glossary. Zotero 9's reader context menu carries the
same two entries.

### Whole-paper bilingual HTML

Right-click an item or PDF attachment in the library and choose to generate
bilingual HTML; the reader tab's context menu has the same entry.

The output is a **single self-contained file**. Language switching is pure CSS
with no JavaScript, so it works inside Zotero's own snapshot reader. On wide
windows the controls live in a side rail; narrow windows fall back to a static
top row that does not cover Zotero's annotation popups.

The pipeline: parse the PDF → structure it into blocks with stable IDs →
build a paper-specific glossary → translate concurrently → validate → render
HTML → import as a `text/html` child attachment.

**Parsing modes:**

| Mode              | Behaviour                                               | Uploads the PDF? |
| ----------------- | ------------------------------------------------------- | ---------------- |
| Auto              | MinerU when a token is configured, otherwise plain text | Depends          |
| MinerU            | Complex layouts, scanned OCR, images, tables, formulas  | **Yes**          |
| Zotero plain text | Uses Zotero's existing full-text index only             | No               |

Three templates: `classic`, `minimal`, `magazine`.

### Workbench

Open it from the button left of the library search box, or **Tools → Context
Translate Workbench**.

- **Lookup and translation history**, split by word / phrase / sentence /
  paragraph. Word records keep phonetics, part of speech, dictionary
  definitions and the model's explanation as separate searchable fields.
- **Whole-paper jobs**, showing every stage (parse, structure, glossary,
  translate, validate, render, save attachment) with per-block progress,
  overall progress, errors and token usage.

Jobs **checkpoint per block**, so a failure, a pause, or a Zotero restart
resumes from the interrupted stage without re-translating finished content.
Each job has a diagnostics log with stage events and redacted error stacks.

Finished jobs can **re-render the HTML** from the saved checkpoint without
calling MinerU or the LLM again, or **repair structure and fill gaps** to
re-translate only blocks affected by cross-page sentence splits or untranslated
connectives.

### Glossary and offline dictionary

- 483 bundled domain terms, overridable per Zotero library.
- CSV import/export; terms are injected on body matches within a token budget.
- A 50K-entry trimmed ECDICT ships with the plugin; a 770K-entry full version
  can be downloaded from the settings panel.

### Supported model services

Any OpenAI-compatible `/chat/completions` endpoint. Presets for DeepSeek,
OpenAI, OpenRouter, Ollama, Claude and custom. Whole-paper translation defaults
to `deepseek-v4-flash` with thinking mode off and 2 concurrent batches.

## Privacy

- Selection translation sends **the selected text and its context** to the LLM
  provider you configured; whole-paper translation sends **the paper's text**.
- The PDF file itself is uploaded only when you choose MinerU parsing. Zotero
  plain-text parsing never uploads the PDF.
- A confirmation prompt is shown before the first whole-paper run.
- API keys live in Zotero's local preferences and are never bundled into the
  plugin, written to history, or committed to the repository.
- Third-party API usage remains subject to that provider's privacy policy.

## Contributing

- Issues and ideas → [GitHub Issues](https://github.com/maverickzyc/zotero-context-translate/issues)
- Dev setup, architecture, testing → [docs/development.md](docs/development.md)
- Contribution guide → [CONTRIBUTING.md](CONTRIBUTING.md)
- Security → [SECURITY.md](SECURITY.md)
- Third-party components and data licences → [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- Changes → [CHANGELOG.md](CHANGELOG.md)

## License

[AGPL-3.0-or-later](LICENSE)
