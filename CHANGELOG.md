# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Project initialized
- MVP design spec completed (`docs/specs/2026-05-12-context-translate-design.md`)
- CLAUDE.md project guide for cross-session collaboration
- Four-layer architecture designed: Plugin Entry → Context Engine → Translation Layer → UI Layer
- Context auto-grading strategy: word→sentence, sentence→paragraph, paragraph→surrounding paragraphs
- LLM-only translation via OpenAI-compatible API with SSE streaming
- Glossary system with token-budget injection (~800 tokens)
- Translation history storage design
- Zotero 8/9 compatibility requirements documented
