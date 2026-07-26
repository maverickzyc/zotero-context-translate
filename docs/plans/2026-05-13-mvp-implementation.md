# Zotero Context Translate MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Zotero 8/9 translation plugin that extracts surrounding context when text is selected in the PDF reader and sends it to an LLM for context-aware translation.

**Architecture:** Four-layer plugin (Plugin Entry → Context Engine → Translation Layer → UI Layer). The Context Engine extracts text from pdf.js text layers and auto-grades context level (word→sentence, sentence→paragraph, paragraph→surrounding paragraphs). The Translation Layer builds structured prompts with glossary terms and streams LLM responses via SSE. The UI Layer renders results in a popup panel injected into Zotero's Reader selection popup.

**Tech Stack:** TypeScript, esbuild, zotero-plugin-scaffold, zotero-plugin-toolkit (v5.1+), zotero-types, Fluent (.ftl) i18n

**Design Spec:** `docs/specs/2026-05-12-context-translate-design.md`

---

## File Map

### Files to Create (from scratch, after template scaffolding)

| File                                      | Responsibility                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/modules/context/paragraph-detect.ts` | Reconstruct paragraphs from pdf.js TextItem[], detect boundaries, handle multi-column |
| `src/modules/context/context-resolver.ts` | Determine context level from selection, extract surrounding context                   |
| `src/modules/context/page-cache.ts`       | Per-page text cache with document lifecycle management                                |
| `src/modules/context/text-extractor.ts`   | Bridge to pdf.js internal APIs inside Zotero Reader iframe                            |
| `src/modules/translate/stream-parser.ts`  | Parse SSE text/event-stream from LLM API                                              |
| `src/modules/translate/prompt-builder.ts` | Build chat messages array based on context level + glossary                           |
| `src/modules/translate/glossary.ts`       | Glossary CRUD, term matching with token budget, CSV import/export                     |
| `src/modules/translate/llm-service.ts`    | HTTP POST to OpenAI-compatible endpoint, orchestrate streaming                        |
| `src/modules/ui/popup.ts`                 | Translation popup panel with streaming rendering                                      |
| `src/modules/ui/history.ts`               | Translation history JSON persistence + query                                          |
| `src/modules/ui/preferences.ts`           | Preferences panel logic (onLoad, event handlers)                                      |
| `src/types.ts`                            | Shared TypeScript interfaces for all modules                                          |
| `test/paragraph-detect.test.ts`           | Unit tests for paragraph detection                                                    |
| `test/context-resolver.test.ts`           | Unit tests for context resolver                                                       |
| `test/stream-parser.test.ts`              | Unit tests for SSE stream parser                                                      |
| `test/prompt-builder.test.ts`             | Unit tests for prompt builder                                                         |
| `test/glossary.test.ts`                   | Unit tests for glossary matching                                                      |

### Files to Modify (from template)

| File                                 | Changes                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `package.json`                       | Update `config` block (addonName, addonID, addonRef, prefsPrefix), add uuid dep |
| `addon/manifest.json`                | Set `strict_min_version: "8.0"`, `strict_max_version: "9.*"`                    |
| `addon/prefs.js`                     | Define all plugin preference keys and defaults                                  |
| `addon/locale/en-US/addon.ftl`       | English locale strings                                                          |
| `addon/locale/zh-CN/addon.ftl`       | Chinese locale strings                                                          |
| `addon/locale/en-US/preferences.ftl` | Preferences panel English strings                                               |
| `addon/locale/zh-CN/preferences.ftl` | Preferences panel Chinese strings                                               |
| `addon/content/preferences.xhtml`    | Full settings panel UI                                                          |
| `src/hooks.ts`                       | Register Reader event listeners, menus, wire all modules                        |
| `src/addon.ts`                       | Add module state fields to Addon data                                           |
| `src/index.ts`                       | Minor: ensure correct addonInstance name                                        |
| `typings/global.d.ts`                | Add module-specific globals if needed                                           |
| `zotero-plugin.config.ts`            | Update esbuild target to `firefox140`                                           |

### Files to Delete (template examples)

| File                      | Reason                            |
| ------------------------- | --------------------------------- |
| `src/modules/examples.ts` | Template example code, not needed |

---

## Task 1: Project Scaffolding

**Files:**

- Clone: `zotero-plugin-template` → project root
- Modify: `package.json`, `addon/manifest.json`, `zotero-plugin.config.ts`, `.env`
- Delete: `src/modules/examples.ts`

- [ ] **Step 1: Clone the template**

```bash
cd /path/to/Zotero-Context-Translate
# We already have a git repo with docs, so we download template files into it
npx degit windingwind/zotero-plugin-template --force .
```

If `degit` fails or overwrites our docs, restore them from git:

```bash
git checkout -- docs/ CLAUDE.md CHANGELOG.md
```

- [ ] **Step 2: Configure package.json**

Update the `config` block in `package.json`:

```json
{
  "config": {
    "addonName": "Zotero Context Translate",
    "addonID": "zotero-context-translate@maverickzyc.github.io",
    "addonRef": "context-translate",
    "addonInstance": "ContextTranslate",
    "prefsPrefix": "extensions.zotero.contextTranslate"
  }
}
```

Also add the `uuid` dependency:

```bash
npm install uuid
npm install -D @types/uuid
```

- [ ] **Step 3: Update manifest.json for Zotero 8/9**

In `addon/manifest.json`, change the `applications.zotero` block:

```json
{
  "applications": {
    "zotero": {
      "id": "__addonID__",
      "update_url": "https://raw.githubusercontent.com/yongchen/zotero-context-translate/main/update.json",
      "strict_min_version": "8.0",
      "strict_max_version": "9.*"
    }
  }
}
```

- [ ] **Step 4: Update esbuild target in zotero-plugin.config.ts**

Change the esbuild target from `firefox115` to `firefox140`:

```ts
// In zotero-plugin.config.ts, find esbuildOptions and set:
esbuildOptions: [
  {
    entryPoints: ["src/index.ts"],
    define: { __env__: `"${process.env.NODE_ENV}"` },
    bundle: true,
    target: "firefox140",
    // ... rest stays the same
  },
],
```

- [ ] **Step 5: Delete template example code**

```bash
rm src/modules/examples.ts
```

Remove the import of examples from `src/hooks.ts` (we'll rewrite hooks.ts in Task 12).

- [ ] **Step 6: Create .env for local development**

```bash
cp .env.example .env
```

Edit `.env`:

```
ZOTERO_PLUGIN_ZOTERO_BIN_PATH = /Applications/Zotero.app/Contents/MacOS/zotero
ZOTERO_PLUGIN_PROFILE_PATH = /path/to/zotero-dev-profile
```

(Adjust paths to actual Zotero install and a dev profile. Create dev profile with `zotero -P` if needed.)

- [ ] **Step 7: Install dependencies and verify build**

```bash
npm install
npm run build
```

Expected: Build succeeds, `.scaffold/build/` directory created with bundled XPI.

- [ ] **Step 8: Create module directory structure**

```bash
mkdir -p src/modules/context src/modules/translate src/modules/ui
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold project from zotero-plugin-template

- Configure for Zotero 8/9 (Firefox 140 ESR)
- Set addonID, addonRef, prefsPrefix
- Update esbuild target to firefox140
- Remove template example code"
```

---

## Task 2: Shared Types & Preferences

**Files:**

- Create: `src/types.ts`
- Modify: `addon/prefs.js`

- [ ] **Step 1: Create shared types**

Create `src/types.ts`:

```ts
export enum ContextLevel {
  Word = 1,
  Sentence = 2,
  Paragraph = 3,
}

export interface PageTextData {
  paragraphs: string[];
  rawText: string;
  timestamp: number;
}

export interface ContextResult {
  level: ContextLevel;
  selected: string;
  context: string;
  sentenceIndex?: number;
  paragraphIndex?: number;
}

export interface GlossaryEntry {
  term: string;
  translation: string;
  field?: string;
  note?: string;
}

export interface GlossaryData {
  entries: GlossaryEntry[];
}

export interface HistoryRecord {
  id: string;
  selected: string;
  context: string;
  level: ContextLevel;
  result: string;
  itemId: string;
  page: number;
  timestamp: number;
}

export interface HistoryData {
  libraryId: number;
  records: HistoryRecord[];
}

export interface TranslationCallbacks {
  onChunk: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
```

- [ ] **Step 2: Define preference keys**

Replace `addon/prefs.js` contents with:

```js
// LLM settings
pref("llm.baseUrl", "https://api.openai.com/v1");
pref("llm.apiKey", "");
pref("llm.model", "gpt-4o-mini");
pref("llm.temperature", "0.3");
pref("llm.maxTokens", 1024);

// Translation settings
pref("translate.sourceLanguage", "auto");
pref("translate.targetLanguage", "zh-CN");
pref("translate.autoMode", false);

// Feature toggles
pref("enable", true);
```

Note: The scaffold auto-prefixes each key with `extensions.zotero.contextTranslate.` at build time.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts addon/prefs.js
git commit -m "feat: define shared types and preference keys

- ContextLevel enum, PageTextData, ContextResult, GlossaryEntry,
  HistoryRecord, TranslationCallbacks, ChatMessage interfaces
- Preference keys for LLM, translation, and feature settings"
```

---

## Task 3: Paragraph Detection (TDD)

**Files:**

- Create: `src/modules/context/paragraph-detect.ts`
- Test: `test/paragraph-detect.test.ts`

This module is pure logic with no Zotero dependencies — it takes raw TextItem-like data and reconstructs structured paragraphs.

- [ ] **Step 1: Write failing tests**

Create `test/paragraph-detect.test.ts`:

```ts
import { expect } from "chai";
import {
  reconstructParagraphs,
  detectColumns,
  splitSentences,
} from "../src/modules/context/paragraph-detect";

describe("paragraph-detect", () => {
  describe("reconstructParagraphs", () => {
    it("groups text items into lines by Y coordinate", () => {
      const items = [
        { str: "Hello ", x: 0, y: 100, width: 30, height: 12 },
        { str: "world.", x: 30, y: 100, width: 30, height: 12 },
        { str: "Next line.", x: 0, y: 86, width: 50, height: 12 },
      ];
      const result = reconstructParagraphs(items);
      expect(result.paragraphs).to.have.length(1);
      expect(result.paragraphs[0]).to.include("Hello world.");
      expect(result.paragraphs[0]).to.include("Next line.");
    });

    it("detects paragraph breaks from large vertical gaps", () => {
      const items = [
        { str: "First paragraph.", x: 0, y: 200, width: 80, height: 12 },
        { str: "Second paragraph.", x: 0, y: 170, width: 80, height: 12 },
      ];
      const result = reconstructParagraphs(items);
      expect(result.paragraphs).to.have.length(2);
      expect(result.paragraphs[0]).to.equal("First paragraph.");
      expect(result.paragraphs[1]).to.equal("Second paragraph.");
    });

    it("returns rawText as joined paragraphs", () => {
      const items = [
        { str: "Para one.", x: 0, y: 200, width: 40, height: 12 },
        { str: "Para two.", x: 0, y: 170, width: 40, height: 12 },
      ];
      const result = reconstructParagraphs(items);
      expect(result.rawText).to.equal("Para one.\nPara two.");
    });
  });

  describe("detectColumns", () => {
    it("returns 1 for single-column layout", () => {
      const items = [
        { str: "Line 1", x: 50, y: 100, width: 200, height: 12 },
        { str: "Line 2", x: 50, y: 88, width: 200, height: 12 },
      ];
      expect(detectColumns(items)).to.equal(1);
    });

    it("returns 2 for two-column layout", () => {
      const items = [
        { str: "Left col", x: 50, y: 100, width: 200, height: 12 },
        { str: "Right col", x: 320, y: 100, width: 200, height: 12 },
        { str: "Left 2", x: 50, y: 88, width: 200, height: 12 },
        { str: "Right 2", x: 320, y: 88, width: 200, height: 12 },
      ];
      expect(detectColumns(items)).to.equal(2);
    });
  });

  describe("splitSentences", () => {
    it("splits on sentence-ending punctuation", () => {
      const text = "First sentence. Second sentence? Third!";
      const sentences = splitSentences(text);
      expect(sentences).to.deep.equal([
        "First sentence.",
        "Second sentence?",
        "Third!",
      ]);
    });

    it("does not split on common abbreviations", () => {
      const text =
        "Smith et al. found that e.g. in Fig. 3 the results were significant.";
      const sentences = splitSentences(text);
      expect(sentences).to.have.length(1);
    });

    it("does not split on decimal numbers", () => {
      const text = "The p-value was 0.05 and the effect size was 3.14 units.";
      const sentences = splitSentences(text);
      expect(sentences).to.have.length(1);
    });

    it("handles multiple sentences with abbreviations", () => {
      const text =
        "See Fig. 1 for details. The results (p < 0.05) were significant.";
      const sentences = splitSentences(text);
      expect(sentences).to.have.length(2);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx mocha --require ts-node/register test/paragraph-detect.test.ts
```

Expected: FAIL — modules not found.

(If `ts-node` is not in dev deps, install it: `npm install -D ts-node`)

- [ ] **Step 3: Implement paragraph-detect.ts**

Create `src/modules/context/paragraph-detect.ts`:

```ts
export interface TextItemLike {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParagraphResult {
  paragraphs: string[];
  rawText: string;
}

interface TextLine {
  y: number;
  items: TextItemLike[];
}

const ABBREVIATIONS = new Set([
  "et al",
  "fig",
  "figs",
  "eq",
  "eqs",
  "vol",
  "no",
  "e.g",
  "i.e",
  "vs",
  "dr",
  "prof",
  "mr",
  "mrs",
  "ms",
  "inc",
  "ltd",
  "jr",
  "sr",
  "dept",
  "approx",
  "est",
  "ref",
  "refs",
  "sect",
  "ch",
  "pp",
]);

export function detectColumns(items: TextItemLike[]): number {
  if (items.length < 4) return 1;

  const xStarts = items.map((it) => Math.round(it.x));
  const xCounts = new Map<number, number>();

  for (const x of xStarts) {
    const bucket = Math.round(x / 20) * 20;
    xCounts.set(bucket, (xCounts.get(bucket) || 0) + 1);
  }

  const significantClusters = [...xCounts.entries()]
    .filter(([_, count]) => count >= items.length * 0.15)
    .map(([x]) => x)
    .sort((a, b) => a - b);

  if (significantClusters.length >= 2) {
    const gap = significantClusters[1] - significantClusters[0];
    if (gap > 100) return 2;
  }

  return 1;
}

export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = "";

  const tokens = text.split(/(\s+)/);
  for (let i = 0; i < tokens.length; i++) {
    current += tokens[i];

    if (/[.?!]\s*$/.test(tokens[i])) {
      const word = tokens[i].replace(/[.?!]\s*$/, "").toLowerCase();

      if (
        ABBREVIATIONS.has(word) ||
        ABBREVIATIONS.has(word.replace(/\.$/, ""))
      ) {
        continue;
      }

      if (
        /^\d+\.\d*$/.test(tokens[i].replace(/[?!]\s*$/, "")) ||
        /\d+\.\d+/.test(tokens[i])
      ) {
        continue;
      }

      sentences.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences;
}

function groupIntoLines(items: TextItemLike[]): TextLine[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextLine[] = [];
  let currentLine: TextLine = { y: sorted[0].y, items: [sorted[0]] };

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentLine.y) < item.height * 0.5) {
      currentLine.items.push(item);
    } else {
      currentLine.items.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
      currentLine = { y: item.y, items: [item] };
    }
  }
  currentLine.items.sort((a, b) => a.x - b.x);
  lines.push(currentLine);

  return lines;
}

function lineToText(line: TextLine): string {
  return line.items
    .map((it) => it.str)
    .join("")
    .trim();
}

export function reconstructParagraphs(items: TextItemLike[]): ParagraphResult {
  if (items.length === 0) return { paragraphs: [], rawText: "" };

  const columnCount = detectColumns(items);

  let columnGroups: TextItemLike[][];
  if (columnCount === 2) {
    const xValues = items.map((it) => it.x).sort((a, b) => a - b);
    const midpoint = (xValues[0] + xValues[xValues.length - 1]) / 2;
    columnGroups = [
      items.filter((it) => it.x < midpoint),
      items.filter((it) => it.x >= midpoint),
    ];
  } else {
    columnGroups = [items];
  }

  const allParagraphs: string[] = [];

  for (const colItems of columnGroups) {
    const lines = groupIntoLines(colItems);
    if (lines.length === 0) continue;

    const lineHeights = lines.map((l) =>
      l.items.reduce((max, it) => Math.max(max, it.height), 0),
    );
    const avgLineHeight =
      lineHeights.reduce((sum, h) => sum + h, 0) / lineHeights.length;

    const paragraphs: string[] = [];
    let currentPara = lineToText(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      const gap = lines[i - 1].y - lines[i].y;
      if (gap > avgLineHeight * 1.5) {
        paragraphs.push(currentPara);
        currentPara = lineToText(lines[i]);
      } else {
        const lineText = lineToText(lines[i]);
        if (lineText) {
          currentPara += " " + lineText;
        }
      }
    }
    if (currentPara) {
      paragraphs.push(currentPara);
    }

    allParagraphs.push(...paragraphs);
  }

  return {
    paragraphs: allParagraphs,
    rawText: allParagraphs.join("\n"),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx mocha --require ts-node/register test/paragraph-detect.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/context/paragraph-detect.ts test/paragraph-detect.test.ts
git commit -m "feat: implement paragraph detection with multi-column support

- reconstructParagraphs: groups TextItems into lines, detects paragraph
  breaks via vertical gap analysis
- detectColumns: identifies 2-column layout from X-coordinate clustering
- splitSentences: splits text on sentence punctuation, excludes
  abbreviations (et al., Fig., e.g.) and decimal numbers"
```

---

## Task 4: Context Resolver (TDD)

**Files:**

- Create: `src/modules/context/context-resolver.ts`
- Test: `test/context-resolver.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/context-resolver.test.ts`:

```ts
import { expect } from "chai";
import {
  determineLevel,
  resolveContext,
} from "../src/modules/context/context-resolver";
import { ContextLevel } from "../src/types";

describe("context-resolver", () => {
  describe("determineLevel", () => {
    it("returns Word for 1-3 word selections", () => {
      expect(determineLevel("epistemological")).to.equal(ContextLevel.Word);
      expect(determineLevel("mixed methods")).to.equal(ContextLevel.Word);
      expect(determineLevel("et al findings")).to.equal(ContextLevel.Word);
    });

    it("returns Sentence for 4+ words with ≤1 period", () => {
      expect(
        determineLevel("This approach challenges traditional assumptions."),
      ).to.equal(ContextLevel.Sentence);
      expect(
        determineLevel("the results were statistically significant"),
      ).to.equal(ContextLevel.Sentence);
    });

    it("returns Paragraph for text with 2+ sentence-ending punctuation", () => {
      expect(
        determineLevel("First sentence. Second sentence. Third sentence."),
      ).to.equal(ContextLevel.Paragraph);
    });
  });

  describe("resolveContext", () => {
    const paragraphs = [
      "This is the introduction paragraph with some context about the study.",
      "The methodology section describes the mixed-methods approach. It combines qualitative and quantitative data. The epistemological foundations challenge positivism.",
      "Results showed significant findings in the primary analysis.",
    ];

    it("returns sentence context for word-level selection", () => {
      const result = resolveContext("epistemological", paragraphs);
      expect(result.level).to.equal(ContextLevel.Word);
      expect(result.context).to.include("epistemological");
      expect(result.context.length).to.be.greaterThan("epistemological".length);
    });

    it("returns paragraph context for sentence-level selection", () => {
      const selected = "It combines qualitative and quantitative data.";
      const result = resolveContext(selected, paragraphs);
      expect(result.level).to.equal(ContextLevel.Sentence);
      expect(result.context).to.include("methodology");
      expect(result.context).to.include("epistemological");
    });

    it("returns surrounding paragraphs for paragraph-level selection", () => {
      const selected =
        "The methodology section describes the mixed-methods approach. It combines qualitative and quantitative data. The epistemological foundations challenge positivism.";
      const result = resolveContext(selected, paragraphs);
      expect(result.level).to.equal(ContextLevel.Paragraph);
      expect(result.context).to.include("introduction");
      expect(result.context).to.include("Results");
    });

    it("handles selection not found in paragraphs gracefully", () => {
      const result = resolveContext("nonexistent text", paragraphs);
      expect(result.level).to.equal(ContextLevel.Word);
      expect(result.context).to.equal("");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx mocha --require ts-node/register test/context-resolver.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement context-resolver.ts**

Create `src/modules/context/context-resolver.ts`:

```ts
import { ContextLevel, ContextResult } from "../../types";
import { splitSentences } from "./paragraph-detect";

export function determineLevel(selected: string): ContextLevel {
  const trimmed = selected.trim();
  const words = trimmed.split(/\s+/);
  const sentenceEndings = trimmed.match(/[.?!]\s/g) || [];
  const trailingEnd = /[.?!]$/.test(trimmed) ? 1 : 0;
  const totalEndings = sentenceEndings.length + trailingEnd;

  if (words.length <= 3) return ContextLevel.Word;
  if (totalEndings >= 2) return ContextLevel.Paragraph;
  return ContextLevel.Sentence;
}

function findParagraphIndex(selected: string, paragraphs: string[]): number {
  const normalized = selected.trim().toLowerCase();
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].toLowerCase().includes(normalized)) {
      return i;
    }
  }
  return -1;
}

function findSentenceContext(selected: string, paragraphs: string[]): string {
  const paraIdx = findParagraphIndex(selected, paragraphs);
  if (paraIdx === -1) return "";

  const sentences = splitSentences(paragraphs[paraIdx]);
  const normalized = selected.trim().toLowerCase();

  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(normalized)) {
      return sentence;
    }
  }

  return paragraphs[paraIdx];
}

function getParagraphContext(selected: string, paragraphs: string[]): string {
  const paraIdx = findParagraphIndex(selected, paragraphs);
  if (paraIdx === -1) return "";
  return paragraphs[paraIdx];
}

function getSurroundingParagraphs(
  selected: string,
  paragraphs: string[],
): string {
  const paraIdx = findParagraphIndex(selected, paragraphs);
  if (paraIdx === -1) return "";

  const parts: string[] = [];
  if (paraIdx > 0) parts.push("[前一段] " + paragraphs[paraIdx - 1]);
  parts.push("[选中段] " + paragraphs[paraIdx]);
  if (paraIdx < paragraphs.length - 1)
    parts.push("[后一段] " + paragraphs[paraIdx + 1]);

  return parts.join("\n\n");
}

export function resolveContext(
  selected: string,
  paragraphs: string[],
): ContextResult {
  const level = determineLevel(selected);
  let context: string;
  let paragraphIndex: number | undefined;

  switch (level) {
    case ContextLevel.Word:
      context = findSentenceContext(selected, paragraphs);
      break;
    case ContextLevel.Sentence:
      context = getParagraphContext(selected, paragraphs);
      paragraphIndex = findParagraphIndex(selected, paragraphs);
      break;
    case ContextLevel.Paragraph:
      context = getSurroundingParagraphs(selected, paragraphs);
      paragraphIndex = findParagraphIndex(selected, paragraphs);
      break;
  }

  return {
    level,
    selected: selected.trim(),
    context,
    paragraphIndex: paragraphIndex !== undefined ? paragraphIndex : undefined,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx mocha --require ts-node/register test/context-resolver.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/context/context-resolver.ts test/context-resolver.test.ts
git commit -m "feat: implement context resolver with auto-grading

- determineLevel: word (≤3 words), sentence (4+ words, ≤1 period),
  paragraph (2+ sentence endings)
- resolveContext: extracts sentence/paragraph/surrounding paragraphs
  based on level"
```

---

## Task 5: Page Cache + Text Extractor

**Files:**

- Create: `src/modules/context/page-cache.ts`, `src/modules/context/text-extractor.ts`

These modules depend on Zotero APIs and are tested via integration (dev mode).

- [ ] **Step 1: Implement page-cache.ts**

Create `src/modules/context/page-cache.ts`:

```ts
import { PageTextData } from "../../types";

const cache = new Map<string, Map<number, PageTextData>>();

function docKey(itemId: number): string {
  return String(itemId);
}

export function getCachedPage(
  itemId: number,
  pageNumber: number,
): PageTextData | undefined {
  return cache.get(docKey(itemId))?.get(pageNumber);
}

export function setCachedPage(
  itemId: number,
  pageNumber: number,
  data: PageTextData,
): void {
  const key = docKey(itemId);
  if (!cache.has(key)) {
    cache.set(key, new Map());
  }
  cache.get(key)!.set(pageNumber, data);
}

export function clearDocumentCache(itemId: number): void {
  cache.delete(docKey(itemId));
}

export function clearAllCache(): void {
  cache.clear();
}
```

- [ ] **Step 2: Implement text-extractor.ts**

Create `src/modules/context/text-extractor.ts`:

```ts
import { PageTextData } from "../../types";
import { reconstructParagraphs, TextItemLike } from "./paragraph-detect";
import { getCachedPage, setCachedPage } from "./page-cache";

function getReaderIframeWindow(reader: any): any {
  try {
    return reader._iframeWindow?.wrappedJSObject;
  } catch {
    return null;
  }
}

function getInternalReader(iframeWindow: any): any {
  try {
    return iframeWindow?._reader;
  } catch {
    return null;
  }
}

export function getSelectedText(reader: any): string | null {
  try {
    const iframeWindow = getReaderIframeWindow(reader);
    const internalReader = getInternalReader(iframeWindow);
    const selectionRanges = internalReader?._primaryView?._selectionRanges;
    if (!selectionRanges || selectionRanges.length === 0) return null;

    return (
      selectionRanges
        .map((range: any) => range.toString?.() || "")
        .join(" ")
        .trim() || null
    );
  } catch {
    return null;
  }
}

export function getCurrentPageNumber(reader: any): number | null {
  try {
    const iframeWindow = getReaderIframeWindow(reader);
    const internalReader = getInternalReader(iframeWindow);
    const pageIndex =
      internalReader?._primaryView?._iframeWindow?.PDFViewerApplication
        ?.pdfViewer?.currentPageNumber;
    return typeof pageIndex === "number" ? pageIndex : null;
  } catch {
    return null;
  }
}

async function extractPageTextItems(
  reader: any,
  pageNumber: number,
): Promise<TextItemLike[]> {
  const iframeWindow = getReaderIframeWindow(reader);
  const pdfDocument =
    iframeWindow?._reader?._primaryView?._iframeWindow?.PDFViewerApplication
      ?.pdfDocument;

  if (!pdfDocument) throw new Error("Cannot access PDF document");

  const page = await pdfDocument.getPage(pageNumber);
  const textContent = await page.getTextContent();

  return textContent.items
    .filter((item: any) => item.str && item.str.trim())
    .map((item: any) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      height: item.height,
    }));
}

export async function getPageText(
  reader: any,
  itemId: number,
  pageNumber: number,
): Promise<PageTextData> {
  const cached = getCachedPage(itemId, pageNumber);
  if (cached) return cached;

  const textItems = await extractPageTextItems(reader, pageNumber);
  const { paragraphs, rawText } = reconstructParagraphs(textItems);

  const data: PageTextData = {
    paragraphs,
    rawText,
    timestamp: Date.now(),
  };

  setCachedPage(itemId, pageNumber, data);
  return data;
}

export async function getPageTextWithNeighbors(
  reader: any,
  itemId: number,
  pageNumber: number,
): Promise<PageTextData> {
  const current = await getPageText(reader, itemId, pageNumber);

  const paragraphs = [...current.paragraphs];
  let modified = false;

  if (paragraphs.length > 0) {
    const lastPara = paragraphs[paragraphs.length - 1];
    if (!/[.?!]$/.test(lastPara.trim())) {
      try {
        const next = await getPageText(reader, itemId, pageNumber + 1);
        if (next.paragraphs.length > 0) {
          paragraphs[paragraphs.length - 1] += " " + next.paragraphs[0];
          modified = true;
        }
      } catch {
        // next page doesn't exist, ignore
      }
    }

    const firstPara = paragraphs[0];
    if (firstPara && !/^[A-Z]/.test(firstPara.trim()) && pageNumber > 1) {
      try {
        const prev = await getPageText(reader, itemId, pageNumber - 1);
        if (prev.paragraphs.length > 0) {
          paragraphs[0] =
            prev.paragraphs[prev.paragraphs.length - 1] + " " + firstPara;
          modified = true;
        }
      } catch {
        // prev page doesn't exist, ignore
      }
    }
  }

  if (modified) {
    return {
      paragraphs,
      rawText: paragraphs.join("\n"),
      timestamp: Date.now(),
    };
  }

  return current;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/context/page-cache.ts src/modules/context/text-extractor.ts
git commit -m "feat: implement page cache and text extractor

- page-cache: in-memory Map keyed by itemId+pageNumber, cleared per document
- text-extractor: bridge to pdf.js via Reader internal API, extracts
  TextItems, reconstructs paragraphs, supports cross-page stitching"
```

---

## Task 6: SSE Stream Parser (TDD)

**Files:**

- Create: `src/modules/translate/stream-parser.ts`
- Test: `test/stream-parser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/stream-parser.test.ts`:

```ts
import { expect } from "chai";
import {
  parseSSEChunk,
  SSEParser,
} from "../src/modules/translate/stream-parser";

describe("stream-parser", () => {
  describe("parseSSEChunk", () => {
    it("extracts delta content from a data line", () => {
      const line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
      expect(parseSSEChunk(line)).to.equal("Hello");
    });

    it("returns null for [DONE] signal", () => {
      expect(parseSSEChunk("data: [DONE]")).to.be.null;
    });

    it("returns empty string for empty delta", () => {
      const line = 'data: {"choices":[{"delta":{}}]}';
      expect(parseSSEChunk(line)).to.equal("");
    });

    it("returns empty string for non-data lines", () => {
      expect(parseSSEChunk("")).to.equal("");
      expect(parseSSEChunk(": comment")).to.equal("");
      expect(parseSSEChunk("event: ping")).to.equal("");
    });
  });

  describe("SSEParser", () => {
    it("accumulates chunks and calls onChunk for each content piece", () => {
      const chunks: string[] = [];
      const parser = new SSEParser({
        onChunk: (text) => chunks.push(text),
        onDone: () => {},
        onError: () => {},
      });

      parser.feed('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
      parser.feed('data: {"choices":[{"delta":{"content":" world"}}]}\n\n');

      expect(chunks).to.deep.equal(["Hello", " world"]);
    });

    it("calls onDone with full text when [DONE] received", () => {
      let doneText = "";
      const parser = new SSEParser({
        onChunk: () => {},
        onDone: (text) => {
          doneText = text;
        },
        onError: () => {},
      });

      parser.feed('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n');
      parser.feed("data: [DONE]\n\n");

      expect(doneText).to.equal("Hi");
    });

    it("handles chunks split across feed boundaries", () => {
      const chunks: string[] = [];
      const parser = new SSEParser({
        onChunk: (text) => chunks.push(text),
        onDone: () => {},
        onError: () => {},
      });

      parser.feed('data: {"choices":[{"del');
      parser.feed('ta":{"content":"split"}}]}\n\n');

      expect(chunks).to.deep.equal(["split"]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx mocha --require ts-node/register test/stream-parser.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement stream-parser.ts**

Create `src/modules/translate/stream-parser.ts`:

```ts
import { TranslationCallbacks } from "../../types";

export function parseSSEChunk(line: string): string | null {
  if (!line.startsWith("data: ")) return "";

  const data = line.slice(6).trim();
  if (data === "[DONE]") return null;

  try {
    const parsed = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}

export class SSEParser {
  private callbacks: TranslationCallbacks;
  private buffer = "";
  private accumulated = "";

  constructor(callbacks: TranslationCallbacks) {
    this.callbacks = callbacks;
  }

  feed(chunk: string): void {
    this.buffer += chunk;

    const parts = this.buffer.split("\n");
    this.buffer = parts.pop() || "";

    for (const part of parts) {
      const line = part.trim();
      if (!line) continue;

      const content = parseSSEChunk(line);

      if (content === null) {
        this.callbacks.onDone(this.accumulated);
        return;
      }

      if (content) {
        this.accumulated += content;
        this.callbacks.onChunk(content);
      }
    }
  }

  finish(): void {
    if (this.buffer.trim()) {
      const content = parseSSEChunk(this.buffer.trim());
      if (content === null) {
        this.callbacks.onDone(this.accumulated);
      } else if (content) {
        this.accumulated += content;
        this.callbacks.onChunk(content);
      }
    }
    this.callbacks.onDone(this.accumulated);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx mocha --require ts-node/register test/stream-parser.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/translate/stream-parser.ts test/stream-parser.test.ts
git commit -m "feat: implement SSE stream parser for OpenAI-compatible API

- parseSSEChunk: extracts delta.content from SSE data lines
- SSEParser: stateful parser handling split chunks, accumulates full
  text, fires onChunk/onDone/onError callbacks"
```

---

## Task 7: Prompt Builder + Glossary (TDD)

**Files:**

- Create: `src/modules/translate/prompt-builder.ts`, `src/modules/translate/glossary.ts`
- Test: `test/prompt-builder.test.ts`, `test/glossary.test.ts`

- [ ] **Step 1: Write failing tests for glossary matching**

Create `test/glossary.test.ts`:

```ts
import { expect } from "chai";
import { matchGlossaryTerms } from "../src/modules/translate/glossary";
import { GlossaryEntry } from "../src/types";

describe("glossary", () => {
  const entries: GlossaryEntry[] = [
    { term: "epistemological", translation: "认识论的", field: "philosophy" },
    { term: "triangulation", translation: "三角验证", field: "methods" },
    { term: "mixed-methods", translation: "混合方法" },
    { term: "positivism", translation: "实证主义" },
    { term: "ontological", translation: "本体论的" },
  ];

  describe("matchGlossaryTerms", () => {
    it("matches terms found in text (case-insensitive)", () => {
      const text = "The Epistemological foundations challenge positivism.";
      const matched = matchGlossaryTerms(entries, text, text);
      expect(matched.map((m) => m.term)).to.include("epistemological");
      expect(matched.map((m) => m.term)).to.include("positivism");
    });

    it("does not return unmatched terms", () => {
      const text = "A simple sentence with no jargon.";
      const matched = matchGlossaryTerms(entries, text, text);
      expect(matched).to.have.length(0);
    });

    it("prioritizes terms in selected text over context-only terms", () => {
      const selected = "epistemological";
      const context =
        "The epistemological foundations of triangulation and mixed-methods and positivism and ontological approaches.";
      const matched = matchGlossaryTerms(entries, selected, context, 3);
      expect(matched[0].term).to.equal("epistemological");
      expect(matched.length).to.be.at.most(3);
    });

    it("respects maxTerms limit", () => {
      const text =
        "epistemological triangulation mixed-methods positivism ontological";
      const matched = matchGlossaryTerms(entries, text, text, 2);
      expect(matched).to.have.length(2);
    });
  });
});
```

- [ ] **Step 2: Write failing tests for prompt builder**

Create `test/prompt-builder.test.ts`:

```ts
import { expect } from "chai";
import { buildPrompt } from "../src/modules/translate/prompt-builder";
import { ContextLevel, GlossaryEntry } from "../src/types";

describe("prompt-builder", () => {
  const glossaryEntries: GlossaryEntry[] = [
    { term: "epistemological", translation: "认识论的" },
  ];

  describe("buildPrompt", () => {
    it("builds word-level prompt with sentence context", () => {
      const messages = buildPrompt({
        level: ContextLevel.Word,
        selected: "epistemological",
        context: "The epistemological foundations challenge positivism.",
        glossaryEntries,
        targetLanguage: "zh-CN",
      });

      expect(messages).to.have.length(2);
      expect(messages[0].role).to.equal("system");
      expect(messages[0].content).to.include("词");
      expect(messages[1].role).to.equal("user");
      expect(messages[1].content).to.include("epistemological");
      expect(messages[1].content).to.include("epistemological → 认识论的");
    });

    it("builds sentence-level prompt with paragraph context", () => {
      const messages = buildPrompt({
        level: ContextLevel.Sentence,
        selected: "This approach challenges assumptions.",
        context: "Full paragraph text here with multiple sentences.",
        glossaryEntries: [],
        targetLanguage: "zh-CN",
      });

      expect(messages).to.have.length(2);
      expect(messages[0].content).to.include("句子");
      expect(messages[1].content).to.include("This approach");
    });

    it("builds paragraph-level prompt with surrounding context", () => {
      const messages = buildPrompt({
        level: ContextLevel.Paragraph,
        selected: "The methodology paragraph.",
        context:
          "[前一段] Introduction.\n\n[选中段] The methodology paragraph.\n\n[后一段] Results.",
        glossaryEntries: [],
        targetLanguage: "zh-CN",
      });

      expect(messages).to.have.length(2);
      expect(messages[0].content).to.include("段");
    });

    it("includes glossary section when entries match", () => {
      const messages = buildPrompt({
        level: ContextLevel.Word,
        selected: "epistemological",
        context: "Some context.",
        glossaryEntries,
        targetLanguage: "zh-CN",
      });

      const userMsg = messages[1].content;
      expect(userMsg).to.include("epistemological → 认识论的");
    });

    it("omits glossary section when no entries", () => {
      const messages = buildPrompt({
        level: ContextLevel.Word,
        selected: "hello",
        context: "Some context.",
        glossaryEntries: [],
        targetLanguage: "zh-CN",
      });

      const userMsg = messages[1].content;
      expect(userMsg).to.not.include("术语参考");
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx mocha --require ts-node/register test/glossary.test.ts test/prompt-builder.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Implement glossary.ts**

Create `src/modules/translate/glossary.ts`:

```ts
import { GlossaryEntry, GlossaryData } from "../../types";

const APPROX_TOKENS_PER_ENTRY = 15;
const DEFAULT_TOKEN_BUDGET = 800;

export function matchGlossaryTerms(
  entries: GlossaryEntry[],
  selected: string,
  context: string,
  maxTerms?: number,
): GlossaryEntry[] {
  const selectedLower = selected.toLowerCase();
  const contextLower = context.toLowerCase();
  const limit =
    maxTerms ?? Math.floor(DEFAULT_TOKEN_BUDGET / APPROX_TOKENS_PER_ENTRY);

  const inSelected: GlossaryEntry[] = [];
  const inContextOnly: GlossaryEntry[] = [];

  for (const entry of entries) {
    const termLower = entry.term.toLowerCase();
    if (selectedLower.includes(termLower)) {
      inSelected.push(entry);
    } else if (contextLower.includes(termLower)) {
      inContextOnly.push(entry);
    }
  }

  const result = [...inSelected, ...inContextOnly];
  return result.slice(0, limit);
}

export function formatGlossaryForPrompt(entries: GlossaryEntry[]): string {
  return entries
    .map((e) => {
      let line = `${e.term} → ${e.translation}`;
      if (e.field) line += ` (${e.field})`;
      return line;
    })
    .join("\n");
}

export async function loadGlossary(
  profileDir: string,
  libraryId: number,
): Promise<GlossaryData> {
  const path = PathUtils.join(
    profileDir,
    `context-translate-glossary-${libraryId}.json`,
  );
  try {
    const raw = await Zotero.File.getContentsAsync(path);
    return JSON.parse(raw as string) as GlossaryData;
  } catch {
    return { entries: [] };
  }
}

export async function saveGlossary(
  profileDir: string,
  libraryId: number,
  data: GlossaryData,
): Promise<void> {
  const path = PathUtils.join(
    profileDir,
    `context-translate-glossary-${libraryId}.json`,
  );
  await Zotero.File.putContentsAsync(path, JSON.stringify(data, null, 2));
}

export function addGlossaryEntry(
  data: GlossaryData,
  entry: GlossaryEntry,
): GlossaryData {
  const exists = data.entries.some(
    (e) => e.term.toLowerCase() === entry.term.toLowerCase(),
  );
  if (exists) {
    return {
      entries: data.entries.map((e) =>
        e.term.toLowerCase() === entry.term.toLowerCase() ? entry : e,
      ),
    };
  }
  return { entries: [...data.entries, entry] };
}

export function removeGlossaryEntry(
  data: GlossaryData,
  term: string,
): GlossaryData {
  return {
    entries: data.entries.filter(
      (e) => e.term.toLowerCase() !== term.toLowerCase(),
    ),
  };
}

export function glossaryFromCSV(csv: string): GlossaryEntry[] {
  const lines = csv.trim().split("\n");
  const entries: GlossaryEntry[] = [];

  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length >= 2 && parts[0] && parts[1]) {
      entries.push({
        term: parts[0],
        translation: parts[1],
        field: parts[2] || undefined,
        note: parts[3] || undefined,
      });
    }
  }

  return entries;
}

export function glossaryToCSV(entries: GlossaryEntry[]): string {
  return entries
    .map((e) =>
      [e.term, e.translation, e.field || "", e.note || ""]
        .map((v) => `"${v}"`)
        .join(","),
    )
    .join("\n");
}
```

- [ ] **Step 5: Implement prompt-builder.ts**

Create `src/modules/translate/prompt-builder.ts`:

```ts
import { ContextLevel, ChatMessage, GlossaryEntry } from "../../types";
import { formatGlossaryForPrompt } from "./glossary";

interface PromptInput {
  level: ContextLevel;
  selected: string;
  context: string;
  glossaryEntries: GlossaryEntry[];
  targetLanguage: string;
}

const SYSTEM_PROMPTS: Record<ContextLevel, string> = {
  [ContextLevel.Word]: `你是学术论文阅读助手。用户正在阅读英文学术论文，选中了一个词/短语。
请根据该词在句子中的具体语境，提供：
1. 中文翻译（在此语境下最准确的译法）
2. 词性和学术含义（一句话）
3. 在这个句子中为什么这样翻译（一句话）`,

  [ContextLevel.Sentence]: `你是学术论文翻译助手。用户选中了一个句子，并提供了所在段落作为上下文。
请提供：
1. 准确的中文翻译
2. 这句话在段落中的逻辑角色（引出论点/提供证据/总结/转折等，一句话）`,

  [ContextLevel.Paragraph]: `你是学术论文翻译助手。用户选中了一段文字，并提供了前后段落作为上下文。
请提供：
1. 完整的段落中文翻译
2. 与前文的衔接关系（一句话）
3. 本段的核心论点（一句话）`,
};

const USER_TEMPLATES: Record<ContextLevel, (input: PromptInput) => string> = {
  [ContextLevel.Word]: (input) => {
    let msg = `选中词: "${input.selected}"\n所在句子: "${input.context}"`;
    if (input.glossaryEntries.length > 0) {
      msg += `\n\n术语参考:\n${formatGlossaryForPrompt(input.glossaryEntries)}`;
    }
    return msg;
  },

  [ContextLevel.Sentence]: (input) => {
    let msg = `选中句子: "${input.selected}"\n所在段落: "${input.context}"`;
    if (input.glossaryEntries.length > 0) {
      msg += `\n\n术语参考:\n${formatGlossaryForPrompt(input.glossaryEntries)}`;
    }
    return msg;
  },

  [ContextLevel.Paragraph]: (input) => {
    let msg = input.context;
    if (input.glossaryEntries.length > 0) {
      msg += `\n\n术语参考:\n${formatGlossaryForPrompt(input.glossaryEntries)}`;
    }
    return msg;
  },
};

export function buildPrompt(input: PromptInput): ChatMessage[] {
  const systemContent = SYSTEM_PROMPTS[input.level];
  const userContent = USER_TEMPLATES[input.level](input);

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx mocha --require ts-node/register test/glossary.test.ts test/prompt-builder.test.ts
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/translate/glossary.ts src/modules/translate/prompt-builder.ts test/glossary.test.ts test/prompt-builder.test.ts
git commit -m "feat: implement glossary manager and prompt builder

- glossary: term matching with token budget (~800 tokens), prioritizes
  terms in selected text, CSV import/export, CRUD operations
- prompt-builder: level-based system/user message construction,
  injects matched glossary terms into user message"
```

---

## Task 8: LLM Service

**Files:**

- Create: `src/modules/translate/llm-service.ts`

- [ ] **Step 1: Implement llm-service.ts**

Create `src/modules/translate/llm-service.ts`:

```ts
import { ChatMessage, TranslationCallbacks } from "../../types";
import { SSEParser } from "./stream-parser";

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export function getLLMConfig(): LLMConfig {
  const prefix = "extensions.zotero.contextTranslate";
  return {
    baseUrl:
      (Zotero.Prefs.get(`${prefix}.llm.baseUrl`, true) as string) ||
      "https://api.openai.com/v1",
    apiKey: (Zotero.Prefs.get(`${prefix}.llm.apiKey`, true) as string) || "",
    model:
      (Zotero.Prefs.get(`${prefix}.llm.model`, true) as string) ||
      "gpt-4o-mini",
    temperature: parseFloat(
      (Zotero.Prefs.get(`${prefix}.llm.temperature`, true) as string) || "0.3",
    ),
    maxTokens:
      (Zotero.Prefs.get(`${prefix}.llm.maxTokens`, true) as number) || 1024,
  };
}

export async function streamTranslation(
  messages: ChatMessage[],
  callbacks: TranslationCallbacks,
  config?: LLMConfig,
): Promise<void> {
  const cfg = config || getLLMConfig();

  if (!cfg.apiKey) {
    callbacks.onError(
      new Error(
        "API Key not configured. Go to Settings → Context Translate to set it.",
      ),
    );
    return;
  }

  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const body = JSON.stringify({
    model: cfg.model,
    messages,
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
    stream: true,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      callbacks.onError(
        new Error(`LLM API error ${response.status}: ${errorText}`),
      );
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError(new Error("Response body is not readable"));
      return;
    }

    const decoder = new TextDecoder();
    const parser = new SSEParser(callbacks);

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        parser.finish();
        break;
      }
      parser.feed(decoder.decode(value, { stream: true }));
    }
  } catch (error) {
    callbacks.onError(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/translate/llm-service.ts
git commit -m "feat: implement LLM service with SSE streaming

- OpenAI-compatible /v1/chat/completions endpoint
- Reads config from Zotero preferences
- fetch + ReadableStream + SSEParser for streaming
- Supports any OpenAI-compatible endpoint (OpenAI, DeepSeek, Ollama)"
```

---

## Task 9: Translation History Store

**Files:**

- Create: `src/modules/ui/history.ts`

- [ ] **Step 1: Implement history.ts**

Create `src/modules/ui/history.ts`:

```ts
import { v4 as uuidv4 } from "uuid";
import { ContextLevel, HistoryRecord, HistoryData } from "../../types";

const MAX_RECORDS = 1000;

function historyFilePath(profileDir: string, libraryId: number): string {
  return PathUtils.join(
    profileDir,
    `context-translate-history-${libraryId}.json`,
  );
}

export async function loadHistory(
  profileDir: string,
  libraryId: number,
): Promise<HistoryData> {
  const path = historyFilePath(profileDir, libraryId);
  try {
    const raw = await Zotero.File.getContentsAsync(path);
    return JSON.parse(raw as string) as HistoryData;
  } catch {
    return { libraryId, records: [] };
  }
}

async function saveHistory(
  profileDir: string,
  data: HistoryData,
): Promise<void> {
  const path = historyFilePath(profileDir, data.libraryId);
  await Zotero.File.putContentsAsync(path, JSON.stringify(data, null, 2));
}

export async function addHistoryRecord(
  profileDir: string,
  libraryId: number,
  record: Omit<HistoryRecord, "id" | "timestamp">,
): Promise<HistoryRecord> {
  const data = await loadHistory(profileDir, libraryId);

  const newRecord: HistoryRecord = {
    ...record,
    id: uuidv4(),
    timestamp: Date.now(),
  };

  data.records.unshift(newRecord);

  if (data.records.length > MAX_RECORDS) {
    data.records = data.records.slice(0, MAX_RECORDS);
  }

  await saveHistory(profileDir, data);
  return newRecord;
}

export async function deleteHistoryRecord(
  profileDir: string,
  libraryId: number,
  recordId: string,
): Promise<void> {
  const data = await loadHistory(profileDir, libraryId);
  data.records = data.records.filter((r) => r.id !== recordId);
  await saveHistory(profileDir, data);
}

export function filterByItem(
  records: HistoryRecord[],
  itemId: string,
): HistoryRecord[] {
  return records.filter((r) => r.itemId === itemId);
}

export function sortByTime(
  records: HistoryRecord[],
  ascending = false,
): HistoryRecord[] {
  return [...records].sort((a, b) =>
    ascending ? a.timestamp - b.timestamp : b.timestamp - a.timestamp,
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/ui/history.ts
git commit -m "feat: implement translation history store

- JSON file persistence per Zotero library
- Add/delete records, filter by item, sort by time
- Auto-caps at 1000 records per library"
```

---

## Task 10: Popup UI

**Files:**

- Create: `src/modules/ui/popup.ts`

- [ ] **Step 1: Implement popup.ts**

Create `src/modules/ui/popup.ts`:

```ts
import { ContextLevel } from "../../types";

const LEVEL_LABELS: Record<ContextLevel, { text: string; color: string }> = {
  [ContextLevel.Word]: { text: "词汇", color: "#818cf8" },
  [ContextLevel.Sentence]: { text: "句子", color: "#4ade80" },
  [ContextLevel.Paragraph]: { text: "段落", color: "#fb923c" },
};

let currentPopup: HTMLElement | null = null;

export function removePopup(doc: Document): void {
  if (currentPopup && currentPopup.parentNode) {
    currentPopup.parentNode.removeChild(currentPopup);
  }
  currentPopup = null;
}

export function createPopup(
  doc: Document,
  level: ContextLevel,
): {
  container: HTMLElement;
  contentArea: HTMLElement;
  actionsArea: HTMLElement;
} {
  removePopup(doc);

  const container = doc.createElement("div");
  container.id = "context-translate-popup";
  container.style.cssText = `
    position: fixed; z-index: 99999; max-width: 420px; min-width: 280px;
    background: #1e1e2e; border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    color: #e0e0e0; font-size: 13px; line-height: 1.6;
    overflow: hidden; cursor: move;
  `;

  const labelInfo = LEVEL_LABELS[level];
  const header = doc.createElement("div");
  header.style.cssText = `
    padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; gap: 8px;
  `;
  const badge = doc.createElement("span");
  badge.style.cssText = `
    background: ${labelInfo.color}; color: ${level === ContextLevel.Sentence ? "#1a1a2e" : "white"};
    font-size: 10px; padding: 2px 8px; border-radius: 10px;
  `;
  badge.textContent = labelInfo.text;
  header.appendChild(badge);
  container.appendChild(header);

  const contentArea = doc.createElement("div");
  contentArea.style.cssText = `
    padding: 12px 14px; max-height: 300px; overflow-y: auto;
  `;
  container.appendChild(contentArea);

  const actionsArea = doc.createElement("div");
  actionsArea.style.cssText = `
    padding: 6px 14px 10px; border-top: 1px solid rgba(255,255,255,0.05);
    display: flex; gap: 12px;
  `;
  container.appendChild(actionsArea);

  enableDrag(container, header);

  currentPopup = container;
  return { container, contentArea, actionsArea };
}

export function appendStreamingCursor(
  doc: Document,
  contentArea: HTMLElement,
): HTMLElement {
  const cursor = doc.createElement("span");
  cursor.className = "context-translate-cursor";
  cursor.style.cssText = `
    display: inline-block; width: 2px; height: 14px;
    background: #818cf8; margin-left: 2px; vertical-align: middle;
    animation: ctx-blink 1s infinite;
  `;
  contentArea.appendChild(cursor);

  const style = doc.createElement("style");
  style.textContent = `
    @keyframes ctx-blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
  `;
  doc.head.appendChild(style);

  return cursor;
}

export function removeCursor(cursor: HTMLElement): void {
  cursor.parentNode?.removeChild(cursor);
}

export function appendChunk(
  contentArea: HTMLElement,
  cursor: HTMLElement,
  text: string,
): void {
  const textNode = contentArea.ownerDocument.createTextNode(text);
  contentArea.insertBefore(textNode, cursor);
}

export function addAction(
  doc: Document,
  actionsArea: HTMLElement,
  label: string,
  onClick: () => void,
): void {
  const btn = doc.createElement("span");
  btn.style.cssText = `
    color: #888; font-size: 11px; cursor: pointer;
  `;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  actionsArea.appendChild(btn);
}

export function positionPopup(
  container: HTMLElement,
  anchorX: number,
  anchorY: number,
): void {
  const doc = container.ownerDocument;
  const viewWidth = doc.documentElement.clientWidth;
  const viewHeight = doc.documentElement.clientHeight;

  let left = anchorX + 10;
  let top = anchorY + 10;

  container.style.left = `${left}px`;
  container.style.top = `${top}px`;

  requestAnimationFrame(() => {
    const rect = container.getBoundingClientRect();
    if (rect.right > viewWidth) left = anchorX - rect.width - 10;
    if (rect.bottom > viewHeight) top = anchorY - rect.height - 10;
    if (left < 0) left = 10;
    if (top < 0) top = 10;
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
  });
}

function enableDrag(container: HTMLElement, handle: HTMLElement): void {
  let startX = 0,
    startY = 0,
    startLeft = 0,
    startTop = 0;

  function onMouseDown(e: MouseEvent) {
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(container.style.left || "0");
    startTop = parseInt(container.style.top || "0");
    const doc = container.ownerDocument;
    doc.addEventListener("mousemove", onMouseMove);
    doc.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent) {
    container.style.left = `${startLeft + e.clientX - startX}px`;
    container.style.top = `${startTop + e.clientY - startY}px`;
  }

  function onMouseUp() {
    const doc = container.ownerDocument;
    doc.removeEventListener("mousemove", onMouseMove);
    doc.removeEventListener("mouseup", onMouseUp);
  }

  handle.addEventListener("mousedown", onMouseDown);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/ui/popup.ts
git commit -m "feat: implement translation popup panel

- createPopup: builds floating panel with level badge, content area,
  actions bar, drag support
- Streaming: appendStreamingCursor/appendChunk/removeCursor for live
  rendering of LLM responses
- positionPopup: viewport-aware positioning near selection
- addAction: attach copy/glossary/retry action buttons"
```

---

## Task 11: Preferences Panel

**Files:**

- Modify: `addon/content/preferences.xhtml`
- Create: `src/modules/ui/preferences.ts`

- [ ] **Step 1: Write preferences.xhtml**

Replace `addon/content/preferences.xhtml` with:

```xml
<?xml version="1.0"?>
<?xml-stylesheet href="chrome://global/skin/" type="text/css"?>
<!DOCTYPE window>
<vbox xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
      xmlns:html="http://www.w3.org/1999/xhtml"
      id="context-translate-preferences"
      onload="Zotero.ContextTranslate.hooks.onPrefsEvent('load', { window })">

  <groupbox>
    <label><html:h2 data-l10n-id="context-translate-prefs-llm-title"/></label>
    <hbox align="center">
      <label data-l10n-id="context-translate-prefs-llm-baseurl" style="width: 120px;"/>
      <html:input type="text" preference="llm.baseUrl" style="flex: 1;"/>
    </hbox>
    <hbox align="center">
      <label data-l10n-id="context-translate-prefs-llm-apikey" style="width: 120px;"/>
      <html:input type="password" preference="llm.apiKey" style="flex: 1;"/>
    </hbox>
    <hbox align="center">
      <label data-l10n-id="context-translate-prefs-llm-model" style="width: 120px;"/>
      <html:input type="text" preference="llm.model" style="flex: 1;"/>
    </hbox>
    <hbox align="center">
      <label data-l10n-id="context-translate-prefs-llm-temperature" style="width: 120px;"/>
      <html:input type="text" preference="llm.temperature" style="width: 60px;"/>
    </hbox>
  </groupbox>

  <groupbox>
    <label><html:h2 data-l10n-id="context-translate-prefs-translate-title"/></label>
    <hbox align="center">
      <label data-l10n-id="context-translate-prefs-target-language" style="width: 120px;"/>
      <menulist preference="translate.targetLanguage">
        <menupopup>
          <menuitem label="中文（简体）" value="zh-CN"/>
          <menuitem label="中文（繁體）" value="zh-TW"/>
          <menuitem label="English" value="en"/>
          <menuitem label="日本語" value="ja"/>
        </menupopup>
      </menulist>
    </hbox>
    <hbox align="center">
      <checkbox preference="translate.autoMode"
                data-l10n-id="context-translate-prefs-auto-mode"/>
    </hbox>
  </groupbox>

  <groupbox>
    <label><html:h2 data-l10n-id="context-translate-prefs-glossary-title"/></label>
    <hbox align="center">
      <label id="context-translate-glossary-count"/>
      <spacer flex="1"/>
      <button id="context-translate-glossary-import"
              data-l10n-id="context-translate-prefs-glossary-import"
              oncommand="Zotero.ContextTranslate.hooks.onPrefsEvent('importGlossary', { window })"/>
      <button id="context-translate-glossary-export"
              data-l10n-id="context-translate-prefs-glossary-export"
              oncommand="Zotero.ContextTranslate.hooks.onPrefsEvent('exportGlossary', { window })"/>
    </hbox>
  </groupbox>

</vbox>
```

- [ ] **Step 2: Implement preferences.ts**

Create `src/modules/ui/preferences.ts`:

```ts
import {
  loadGlossary,
  saveGlossary,
  glossaryFromCSV,
  glossaryToCSV,
} from "../translate/glossary";

export async function onPrefsLoad(win: Window): Promise<void> {
  await updateGlossaryCount(win);
}

async function updateGlossaryCount(win: Window): Promise<void> {
  const label = win.document.getElementById("context-translate-glossary-count");
  if (!label) return;

  const profileDir = Zotero.Profile.dir;
  const libraryId = Zotero.Libraries.userLibraryID;
  const data = await loadGlossary(profileDir, libraryId);
  label.textContent = `术语数: ${data.entries.length} 条`;
}

export async function onImportGlossary(win: Window): Promise<void> {
  const fp = new win.FilePicker();
  fp.init(win, "Import Glossary CSV", fp.modeOpen);
  fp.appendFilter("CSV", "*.csv");

  const result = await fp.show();
  if (result !== fp.returnOK) return;

  const raw = await Zotero.File.getContentsAsync(fp.file);
  const entries = glossaryFromCSV(raw as string);

  const profileDir = Zotero.Profile.dir;
  const libraryId = Zotero.Libraries.userLibraryID;
  const existing = await loadGlossary(profileDir, libraryId);

  const merged = { entries: [...existing.entries, ...entries] };
  await saveGlossary(profileDir, libraryId, merged);
  await updateGlossaryCount(win);
}

export async function onExportGlossary(win: Window): Promise<void> {
  const fp = new win.FilePicker();
  fp.init(win, "Export Glossary CSV", fp.modeSave);
  fp.appendFilter("CSV", "*.csv");
  fp.defaultString = "glossary.csv";

  const result = await fp.show();
  if (result !== fp.returnOK && result !== fp.returnReplace) return;

  const profileDir = Zotero.Profile.dir;
  const libraryId = Zotero.Libraries.userLibraryID;
  const data = await loadGlossary(profileDir, libraryId);
  const csv = glossaryToCSV(data.entries);

  await Zotero.File.putContentsAsync(fp.file, csv);
}
```

- [ ] **Step 3: Commit**

```bash
git add addon/content/preferences.xhtml src/modules/ui/preferences.ts
git commit -m "feat: implement preferences panel

- XHTML settings for LLM config, translation options, glossary management
- Import/export glossary via CSV file picker
- Glossary count display"
```

---

## Task 12: Plugin Wiring (Hooks + Entry + Locale)

**Files:**

- Modify: `src/hooks.ts`, `src/addon.ts`, `src/index.ts`
- Modify: `addon/locale/en-US/addon.ftl`, `addon/locale/zh-CN/addon.ftl`
- Modify: `addon/locale/en-US/preferences.ftl`, `addon/locale/zh-CN/preferences.ftl`

- [ ] **Step 1: Write locale files**

`addon/locale/en-US/addon.ftl`:

```ftl
context-translate-menuitem-translate = Translate with Context
context-translate-menuitem-history = Translation History
```

`addon/locale/zh-CN/addon.ftl`:

```ftl
context-translate-menuitem-translate = 上下文翻译
context-translate-menuitem-history = 翻译历史
```

`addon/locale/en-US/preferences.ftl`:

```ftl
context-translate-prefs-llm-title = LLM Settings
context-translate-prefs-llm-baseurl = API Base URL
context-translate-prefs-llm-apikey = API Key
context-translate-prefs-llm-model = Model
context-translate-prefs-llm-temperature = Temperature
context-translate-prefs-translate-title = Translation Settings
context-translate-prefs-target-language = Target Language
context-translate-prefs-auto-mode = Auto-translate on selection
context-translate-prefs-glossary-title = Glossary
context-translate-prefs-glossary-import = Import CSV
context-translate-prefs-glossary-export = Export CSV
```

`addon/locale/zh-CN/preferences.ftl`:

```ftl
context-translate-prefs-llm-title = LLM 设置
context-translate-prefs-llm-baseurl = API 地址
context-translate-prefs-llm-apikey = API 密钥
context-translate-prefs-llm-model = 模型
context-translate-prefs-llm-temperature = 温度
context-translate-prefs-translate-title = 翻译设置
context-translate-prefs-target-language = 目标语言
context-translate-prefs-auto-mode = 选中文本自动翻译
context-translate-prefs-glossary-title = 术语表
context-translate-prefs-glossary-import = 导入 CSV
context-translate-prefs-glossary-export = 导出 CSV
```

- [ ] **Step 2: Rewrite hooks.ts**

Replace `src/hooks.ts` with:

```ts
import { config } from "../package.json";
import { getString, initLocale } from "./utils/locale";
import {
  getSelectedText,
  getCurrentPageNumber,
  getPageTextWithNeighbors,
} from "./modules/context/text-extractor";
import { resolveContext } from "./modules/context/context-resolver";
import {
  clearDocumentCache,
  clearAllCache,
} from "./modules/context/page-cache";
import { matchGlossaryTerms, loadGlossary } from "./modules/translate/glossary";
import { buildPrompt } from "./modules/translate/prompt-builder";
import { streamTranslation } from "./modules/translate/llm-service";
import {
  createPopup,
  removePopup,
  positionPopup,
  appendStreamingCursor,
  appendChunk,
  removeCursor,
  addAction,
} from "./modules/ui/popup";
import { addHistoryRecord } from "./modules/ui/history";
import {
  onPrefsLoad,
  onImportGlossary,
  onExportGlossary,
} from "./modules/ui/preferences";
import { ContextLevel } from "./types";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: "Context Translate",
    image: rootURI + "content/icons/favicon.png",
  });

  Zotero.Reader.registerEventListener(
    "renderTextSelectionPopup",
    onTextSelectionPopup,
    config.addonID,
  );

  addon.data.initialized = true;
}

async function onTextSelectionPopup(event: {
  reader: any;
  doc: Document;
  params: any;
  append: (element: HTMLElement) => void;
}) {
  const { reader, doc, append } = event;

  const btn = doc.createElement("button");
  btn.textContent = "📖 上下文翻译";
  btn.style.cssText = `
    background: #818cf8; color: white; border: none; padding: 4px 10px;
    border-radius: 4px; font-size: 12px; cursor: pointer; margin: 2px 4px;
  `;

  btn.addEventListener("click", async () => {
    const selectedText = getSelectedText(reader);
    if (!selectedText) return;

    const item = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID)?.itemID;
    const pageNumber = getCurrentPageNumber(reader);

    if (!item || !pageNumber) return;

    try {
      const pageData = await getPageTextWithNeighbors(reader, item, pageNumber);
      const contextResult = resolveContext(selectedText, pageData.paragraphs);

      const profileDir = Zotero.Profile.dir;
      const libraryId = Zotero.Libraries.userLibraryID;
      const glossaryData = await loadGlossary(profileDir, libraryId);
      const matchedTerms = matchGlossaryTerms(
        glossaryData.entries,
        contextResult.selected,
        contextResult.context,
      );

      const targetLang =
        (Zotero.Prefs.get(
          `${config.prefsPrefix}.translate.targetLanguage`,
          true,
        ) as string) || "zh-CN";

      const messages = buildPrompt({
        level: contextResult.level,
        selected: contextResult.selected,
        context: contextResult.context,
        glossaryEntries: matchedTerms,
        targetLanguage: targetLang,
      });

      const { container, contentArea, actionsArea } = createPopup(
        doc,
        contextResult.level,
      );
      doc.body.appendChild(container);
      positionPopup(container, event.params?.x ?? 200, event.params?.y ?? 200);

      const cursor = appendStreamingCursor(doc, contentArea);

      await streamTranslation(messages, {
        onChunk: (text) => appendChunk(contentArea, cursor, text),
        onDone: async (fullText) => {
          removeCursor(cursor);

          addAction(doc, actionsArea, "📋 复制", () => {
            const clipHelper = Components.classes[
              "@mozilla.org/widget/clipboardhelper;1"
            ].getService(Components.interfaces.nsIClipboardHelper);
            clipHelper.copyString(fullText);
          });

          if (contextResult.level === ContextLevel.Word) {
            addAction(doc, actionsArea, "📌 加入术语表", async () => {
              const { addGlossaryEntry, saveGlossary: saveGloss } =
                await import("./modules/translate/glossary");
              const data = await loadGlossary(profileDir, libraryId);
              const updated = addGlossaryEntry(data, {
                term: contextResult.selected,
                translation: fullText.split("\n")[0] || fullText,
              });
              await saveGloss(profileDir, libraryId, updated);
            });
          }

          addAction(doc, actionsArea, "🔄 重试", () => {
            removePopup(doc);
            btn.click();
          });

          await addHistoryRecord(profileDir, libraryId, {
            selected: contextResult.selected,
            context: contextResult.context,
            level: contextResult.level,
            result: fullText,
            itemId: String(item),
            page: pageNumber,
          });
        },
        onError: (error) => {
          removeCursor(cursor);
          contentArea.style.color = "#ef4444";
          contentArea.textContent = `Error: ${error.message}`;
          addAction(doc, actionsArea, "🔄 重试", () => {
            removePopup(doc);
            btn.click();
          });
        },
      });

      const onClickOutside = (e: MouseEvent) => {
        if (!container.contains(e.target as Node) && e.target !== btn) {
          removePopup(doc);
          doc.removeEventListener("click", onClickOutside);
        }
      };
      setTimeout(() => doc.addEventListener("click", onClickOutside), 100);

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          removePopup(doc);
          doc.removeEventListener("keydown", onKeyDown);
        }
      };
      doc.addEventListener("keydown", onKeyDown);
    } catch (error) {
      Zotero.log(`Context Translate error: ${error}`, "error");
    }
  });

  append(btn);
}

function onMainWindowLoad(win: Window) {
  const doc = win.document;
  doc.getElementById("MozXULElement")
    ? (win as any).MozXULElement.insertFTLIfNeeded(
        `${config.addonRef}-addon.ftl`,
      )
    : null;
}

function onMainWindowUnload(_win: Window) {
  // cleanup handled by ztoolkit.unregisterAll() in template
}

function onShutdown() {
  clearAllCache();
  Zotero.Reader.unregisterEventListener(
    "renderTextSelectionPopup",
    onTextSelectionPopup,
  );
  addon.data.alive = false;
}

function onPrefsEvent(type: string, data: { window: Window }) {
  switch (type) {
    case "load":
      onPrefsLoad(data.window);
      break;
    case "importGlossary":
      onImportGlossary(data.window);
      break;
    case "exportGlossary":
      onExportGlossary(data.window);
      break;
  }
}

export default {
  onStartup,
  onMainWindowLoad,
  onMainWindowUnload,
  onShutdown,
  onPrefsEvent,
};
```

- [ ] **Step 3: Update src/addon.ts**

Ensure the Addon class data includes the hooks:

```ts
import hooks from "./hooks";
import { config } from "../package.json";

class Addon {
  public data = {
    alive: true,
    initialized: false,
    config,
  };
  public hooks = hooks;
  public api = {};
}

export default Addon;
```

- [ ] **Step 4: Verify src/index.ts matches template pattern**

Ensure `src/index.ts` creates the addon instance and assigns it:

```ts
import Addon from "./addon";
import { config } from "../package.json";

const addon = new Addon();
(globalThis as any).addon = addon;
(Zotero as any)[config.addonInstance] = addon;

Object.defineProperty(globalThis, "ztoolkit", {
  get() {
    return addon.data.ztoolkit;
  },
});
```

(Adjust based on the actual template content — the key change is ensuring `config.addonInstance` matches `"ContextTranslate"`.)

- [ ] **Step 5: Commit**

```bash
git add src/hooks.ts src/addon.ts src/index.ts addon/locale/
git commit -m "feat: wire plugin lifecycle, reader events, and locale

- hooks.ts: register Reader text selection listener, orchestrate
  context extraction → prompt building → LLM streaming → popup rendering
- Locale files for en-US and zh-CN (addon + preferences)
- Addon class with hooks export"
```

---

## Task 13: Build, Verify & Manual Test

**Files:**

- Modify: `zotero-plugin.config.ts` (if needed)

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit
```

Fix any type errors. Common issues:

- Missing imports
- Zotero API types not matching (may need `as any` casts for internal APIs)
- `PathUtils`, `Components`, `Services` need to come from `zotero-types`

- [ ] **Step 2: Run unit tests**

```bash
npx mocha --require ts-node/register test/*.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Build plugin**

```bash
npm run build
```

Expected: Build succeeds, XPI generated in `.scaffold/build/`.

- [ ] **Step 4: Manual integration test in Zotero**

1. Start dev mode: `npm run start` (requires `.env` configured with Zotero path)
2. Open a PDF in Zotero's reader
3. Select a single word → verify "📖 上下文翻译" button appears in selection popup
4. Click the button → verify popup appears with "词汇" badge
5. If API key is configured, verify streaming translation works
6. If no API key, verify error message appears
7. Select a sentence → verify "句子" badge
8. Check Settings → Context Translate → verify preferences panel loads
9. Test glossary import with a sample CSV

- [ ] **Step 5: Fix any issues found during testing**

Address runtime errors, adjust CSS positioning, fix API path issues.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: build verification and integration fixes

- Fix type errors and runtime issues found during testing
- Verify plugin loads in Zotero 9 dev mode"
```

- [ ] **Step 7: Update CLAUDE.md current status**

Update the "Current Status" section in `CLAUDE.md`:

```markdown
## Current Status

- [x] Design spec completed
- [x] Implementation plan completed
- [x] Project scaffolding
- [x] Context Engine (paragraph-detect, context-resolver, page-cache, text-extractor)
- [x] Translation Layer (stream-parser, prompt-builder, glossary, llm-service)
- [x] UI Layer (popup, preferences, history)
- [x] Plugin wiring (hooks, lifecycle, locale)
- [ ] Extended testing & polish
- [ ] Release packaging
```

- [ ] **Step 8: Commit status update**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "docs: update project status after MVP implementation"
```

---

## Summary

| Task | Focus                       | TDD | Files                                  |
| ---- | --------------------------- | --- | -------------------------------------- |
| 1    | Scaffolding                 | —   | Template config, deps                  |
| 2    | Types & Prefs               | —   | types.ts, prefs.js                     |
| 3    | Paragraph Detection         | ✅  | paragraph-detect.ts + tests            |
| 4    | Context Resolver            | ✅  | context-resolver.ts + tests            |
| 5    | Page Cache + Text Extractor | —   | page-cache.ts, text-extractor.ts       |
| 6    | SSE Stream Parser           | ✅  | stream-parser.ts + tests               |
| 7    | Prompt Builder + Glossary   | ✅  | prompt-builder.ts, glossary.ts + tests |
| 8    | LLM Service                 | —   | llm-service.ts                         |
| 9    | History Store               | —   | history.ts                             |
| 10   | Popup UI                    | —   | popup.ts                               |
| 11   | Preferences Panel           | —   | preferences.xhtml, preferences.ts      |
| 12   | Plugin Wiring               | —   | hooks.ts, addon.ts, locale files       |
| 13   | Build & Test                | —   | Build verification, manual testing     |
