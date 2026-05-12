# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-05-13

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
