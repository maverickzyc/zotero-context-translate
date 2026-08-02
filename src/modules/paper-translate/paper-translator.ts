import { ChatMessage, GlossaryEntry } from "../../types";
import {
  ChatCompletionResult,
  completeChat,
  getLLMConfig,
} from "../translate/llm-service";
import { planTranslationBatches } from "./batch-planner";
import {
  isTranslatableBlock,
  PaperBlock,
  PaperDocument,
  PaperUsage,
  TranslationBatch,
} from "./types";
import { createAbortError } from "./runtime";
import {
  containsPaperProtocolLeak,
  containsUntranslatedNarrativeConnector,
  sanitizePaperTranslation,
} from "./translation-protocol";

interface ProtectedText {
  text: string;
  values: Map<string, string>;
}

interface PaperTranslatorCallbacks {
  onProgress: (completed: number, total: number, message: string) => void;
  onCheckpoint: (document: PaperDocument, usage: PaperUsage) => Promise<void>;
}

interface GlossaryResult {
  terms: GlossaryEntry[];
  usage: PaperUsage;
}

function makeUsage(): PaperUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requests: 0,
  };
}

function addUsage(usage: PaperUsage, result: ChatCompletionResult): void {
  usage.promptTokens += result.usage.promptTokens;
  usage.completionTokens += result.usage.completionTokens;
  usage.totalTokens += result.usage.totalTokens;
  usage.requests += 1;
}

const NARRATIVE_AUTHOR = String.raw`(?:[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+|(?:van|von|de|del|da)\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+)`;
const NARRATIVE_CITATION = new RegExp(
  String.raw`\b${NARRATIVE_AUTHOR}(?:\s+et al\.|\s+(?:and|&)\s+${NARRATIVE_AUTHOR}|(?:,\s+${NARRATIVE_AUTHOR}){1,3}(?:,?\s+(?:and|&)\s+${NARRATIVE_AUTHOR})?)?\s*\((?:18|19|20)\d{2}[a-z]?(?:,\s*(?:pp?\.\s*)?[\d–—-]+)?\)`,
  "g",
);

const PROTECTED_PATTERNS: Array<{
  kind: string;
  pattern: RegExp;
}> = [
  { kind: "CODE", pattern: /```[\s\S]*?```|`[^`\n]+`/g },
  { kind: "CODE", pattern: /<\/?[A-Za-z][^>]*>/g },
  { kind: "MATH", pattern: /\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]/g },
  { kind: "URL", pattern: /https?:\/\/[^\s)>\]]+/g },
  { kind: "DOI", pattern: /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi },
  {
    kind: "CIT",
    pattern: NARRATIVE_CITATION,
  },
  {
    kind: "CIT",
    pattern: /\([^()\n]{0,160}\b(?:18|19|20)\d{2}[a-z]?(?:[^()\n]{0,160})\)/gi,
  },
];

export function protectTranslationText(source: string): ProtectedText {
  let text = source;
  const values = new Map<string, string>();
  let index = 0;
  for (const { kind, pattern } of PROTECTED_PATTERNS) {
    text = text.replace(pattern, (value) => {
      const token = `⟦${kind}_${index++}⟧`;
      values.set(token, value);
      return token;
    });
  }
  return { text, values };
}

export function restoreTranslationText(
  translated: string,
  protectedText: ProtectedText,
): string {
  let result = translated;
  for (const [token, value] of protectedText.values) {
    if (!result.includes(token)) {
      throw new Error(`Translation lost protected token ${token}`);
    }
    result = result.replaceAll(token, value);
  }
  return result.trim();
}

export function parseIDTranslations(output: string): Map<string, string> {
  const result = new Map<string, string>();
  let currentID: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (currentID && buffer.join("\n").trim()) {
      result.set(currentID, buffer.join("\n").trim());
    }
    buffer = [];
  };

  for (const line of output.replace(/\r\n?/g, "\n").split("\n")) {
    const marker = line.trim().match(/^@@([A-Za-z0-9_-]+)$/);
    if (marker) {
      flush();
      currentID = marker[1];
    } else if (currentID) {
      buffer.push(line);
    }
  }
  flush();
  return result;
}

export function parseJSONTranslations(output: string): Map<string, string> {
  const normalized = output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(normalized) as { translations?: unknown };
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.translations ||
    typeof parsed.translations !== "object" ||
    Array.isArray(parsed.translations)
  ) {
    throw new Error("Translation JSON does not contain a translations object");
  }
  const result = new Map<string, string>();
  for (const [id, translation] of Object.entries(
    parsed.translations as Record<string, unknown>,
  )) {
    if (typeof translation === "string" && translation.trim()) {
      result.set(id, translation.trim());
    }
  }
  return result;
}

function glossaryPrompt(terms: GlossaryEntry[]): string {
  if (!terms.length) return "（无）";
  return terms
    .slice(0, 40)
    .map(
      (entry) =>
        `${entry.term} → ${entry.translation}${
          entry.note ? `（${entry.note}）` : ""
        }`,
    )
    .join("\n");
}

function languageName(language: string): string {
  const names: Record<string, string> = {
    "zh-CN": "简体中文",
    "zh-TW": "繁體中文",
    en: "English",
    ja: "日本語",
  };
  return names[language] || language;
}

function batchSystemPrompt(
  glossary: GlossaryEntry[],
  targetLanguage: string,
  responseRule: string,
): string {
  return `你是严谨的学术论文翻译器。把输入块翻译成${languageName(
    targetLanguage,
  )}。

必须遵守：
1. ${responseRule}
2. 每个译文值只能包含译文本身，不得复制 id、type、source 等输入字段，不得输出 [TYPE=...]、@@ID、解释、前言或 Markdown 代码围栏。
3. ⟦CIT_n⟧、⟦URL_n⟧、⟦DOI_n⟧、⟦MATH_n⟧、⟦CODE_n⟧ 是受保护内容，必须逐字原样保留。
4. 保留论证逻辑、语气、段落层次和 Markdown 表格结构，不增删事实。
5. 使用准确、平实、通顺的学术语言；中文引号使用「」。
6. 术语表优先级高于一般译法。

术语表：
${glossaryPrompt(glossary)}`;
}

function buildJSONBatchMessages(
  blocks: PaperBlock[],
  protectedByID: Map<string, ProtectedText>,
  glossary: GlossaryEntry[],
  targetLanguage: string,
): ChatMessage[] {
  const payload = {
    blocks: blocks.map((block) => ({
      id: block.id,
      type: block.type,
      source: protectedByID.get(block.id)?.text || block.source,
    })),
  };
  return [
    {
      role: "system",
      content: batchSystemPrompt(
        glossary,
        targetLanguage,
        '只输出一个合法 JSON 对象，结构严格为 {"translations":{"原ID":"译文"}}；必须包含输入中的原 ID，不得创建新 ID。',
      ),
    },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

function buildTextBatchMessages(
  blocks: PaperBlock[],
  protectedByID: Map<string, ProtectedText>,
  glossary: GlossaryEntry[],
  targetLanguage: string,
): ChatMessage[] {
  const payload = blocks
    .map((block) => {
      const protectedText = protectedByID.get(block.id);
      return `@@${block.id}\n${protectedText?.text || block.source}`;
    })
    .join("\n\n");
  return [
    {
      role: "system",
      content: batchSystemPrompt(
        glossary,
        targetLanguage,
        "只输出翻译结果：每块先单独一行输出 @@原ID，下一行开始输出译文，块之间空一行；必须保留输入中的原 ID，不得创建新 ID。",
      ),
    },
    { role: "user", content: payload },
  ];
}

function retryable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return (
    status === undefined ||
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500
  );
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(createAbortError());
      },
      { once: true },
    );
  });
}

async function requestWithRetry(
  messages: ChatMessage[],
  maxOutputTokens: number,
  signal: AbortSignal,
  usage: PaperUsage,
  responseFormat: "text" | "json_object" = "text",
  attempts = 3,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await completeChat(messages, {
        signal,
        maxTokens: maxOutputTokens,
        temperature: 0.2,
        disableThinking: true,
        responseFormat,
      });
      addUsage(usage, response);
      if (response.finishReason === "length") {
        throw new Error("Translation response was truncated");
      }
      return response.content;
    } catch (error) {
      lastError = error;
      if (signal.aborted || attempt === attempts - 1 || !retryable(error)) {
        throw error;
      }
      await sleep(1000 * 2 ** attempt, signal);
    }
  }
  throw lastError;
}

async function translateBatch(
  batch: TranslationBatch,
  document: PaperDocument,
  glossary: GlossaryEntry[],
  maxOutputTokens: number,
  signal: AbortSignal,
  usage: PaperUsage,
): Promise<void> {
  const blocks = batch.blockIDs.map((id) => {
    const block = document.blocks.find((candidate) => candidate.id === id);
    if (!block) throw new Error(`Unknown paper block ${id}`);
    return block;
  });
  const protectedByID = new Map<string, ProtectedText>();
  for (const block of blocks) {
    protectedByID.set(block.id, protectTranslationText(block.source));
  }
  let translations: Map<string, string>;
  try {
    const output = await requestWithRetry(
      buildJSONBatchMessages(
        blocks,
        protectedByID,
        glossary,
        document.metadata.targetLanguage,
      ),
      maxOutputTokens,
      signal,
      usage,
      "json_object",
    );
    translations = parseJSONTranslations(output);
  } catch (error) {
    if (signal.aborted) throw error;
    Zotero.log(
      `[ContextTranslate] Structured paper translation failed; retrying with text protocol: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "warning",
    );
    const output = await requestWithRetry(
      buildTextBatchMessages(
        blocks,
        protectedByID,
        glossary,
        document.metadata.targetLanguage,
      ),
      maxOutputTokens,
      signal,
      usage,
    );
    translations = parseIDTranslations(output);
  }

  for (const block of blocks) {
    const translation = translations.get(block.id);
    if (!translation) {
      block.status = "failed";
      block.error = "Model response did not contain this block id";
      continue;
    }
    try {
      const cleaned = sanitizePaperTranslation(translation);
      if (!cleaned || containsPaperProtocolLeak(cleaned)) {
        throw new Error(
          "Model response contains a translation protocol marker",
        );
      }
      block.translation = restoreTranslationText(
        cleaned,
        protectedByID.get(block.id)!,
      );
      if (containsPaperProtocolLeak(block.translation)) {
        throw new Error(
          "Model response contains a translation protocol marker",
        );
      }
      if (
        containsUntranslatedNarrativeConnector(
          block.translation,
          document.metadata.targetLanguage,
        )
      ) {
        throw new Error("译文仍包含未翻译的叙述式连接词");
      }
      block.status = "translated";
      delete block.error;
    } catch (error) {
      delete block.translation;
      block.status = "failed";
      block.error = error instanceof Error ? error.message : String(error);
    }
  }
  document.updatedAt = Date.now();
}

async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const count = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await worker(item);
      }
    }),
  );
}

function matchingGlossary(
  entries: GlossaryEntry[],
  document: PaperDocument,
): GlossaryEntry[] {
  const haystack = document.blocks
    .filter(isTranslatableBlock)
    .map((block) => block.source)
    .join("\n");
  return entries
    .filter((entry) => {
      const escaped = entry.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(
        `(?:^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`,
        "i",
      ).test(haystack);
    })
    .slice(0, 40);
}

function parseGlossaryJSON(content: string): GlossaryEntry[] {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(normalized) as {
    terms?: Array<{ en?: unknown; zh?: unknown; note?: unknown }>;
  };
  return (parsed.terms || [])
    .filter(
      (term) =>
        typeof term.en === "string" &&
        term.en.trim() &&
        typeof term.zh === "string" &&
        term.zh.trim(),
    )
    .slice(0, 30)
    .map((term) => ({
      term: String(term.en).trim(),
      translation: String(term.zh).trim(),
      note: typeof term.note === "string" ? term.note.trim() : undefined,
    }));
}

export async function buildPaperGlossary(
  document: PaperDocument,
  libraryGlossary: GlossaryEntry[],
  maxOutputTokens: number,
  signal: AbortSignal,
): Promise<GlossaryResult> {
  const usage = makeUsage();
  const matched = matchingGlossary(libraryGlossary, document);
  const sample = document.blocks
    .filter(isTranslatableBlock)
    .slice(0, 30)
    .map((block) => block.source)
    .join("\n\n")
    .slice(0, 12000);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        '你是学术术语编辑。根据论文标题与样本文本，输出 JSON：{"terms":[{"en":"英文术语","zh":"简体中文译法","note":"可选说明"}]}。只选本篇真正高频、定义性强或容易误译的 10–20 个术语；不要收入普通词。',
    },
    {
      role: "user",
      content: `标题：${document.metadata.title}\n\n样本文本：\n${sample}`,
    },
  ];

  let generated: GlossaryEntry[] = [];
  try {
    const response = await completeChat(messages, {
      signal,
      maxTokens: Math.min(maxOutputTokens, 4096),
      temperature: 0.1,
      responseFormat: "json_object",
      disableThinking: true,
    });
    addUsage(usage, response);
    generated = parseGlossaryJSON(response.content);
  } catch (error) {
    if (signal.aborted) throw error;
    Zotero.log(
      `[ContextTranslate] Paper glossary generation failed; using library glossary: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "warning",
    );
  }

  const merged = new Map<string, GlossaryEntry>();
  for (const entry of matched) merged.set(entry.term.toLowerCase(), entry);
  for (const entry of generated) {
    if (!merged.has(entry.term.toLowerCase())) {
      merged.set(entry.term.toLowerCase(), entry);
    }
  }
  return { terms: [...merged.values()].slice(0, 40), usage };
}

export async function translatePaperDocument(
  document: PaperDocument,
  options: {
    concurrency: number;
    maxBatchCharacters: number;
    maxOutputTokens: number;
    glossary: GlossaryEntry[];
  },
  callbacks: PaperTranslatorCallbacks,
  signal: AbortSignal,
  initialUsage?: PaperUsage,
): Promise<PaperUsage> {
  const config = getLLMConfig();
  if (!config.apiKey) {
    throw new Error("请先在 Context Translate 设置中配置 LLM API Key");
  }
  const usage = initialUsage || makeUsage();
  const batches = planTranslationBatches(
    document.blocks,
    options.maxBatchCharacters,
  );
  const totalBlocks = batches.reduce(
    (sum, batch) => sum + batch.blockIDs.length,
    0,
  );
  let completed = document.blocks.filter(
    (block) => isTranslatableBlock(block) && block.translation,
  ).length;
  const overallTotal = completed + totalBlocks;

  await runConcurrent(batches, options.concurrency, async (batch) => {
    if (signal.aborted) throw createAbortError();
    try {
      await translateBatch(
        batch,
        document,
        options.glossary,
        options.maxOutputTokens,
        signal,
        usage,
      );
    } catch (error) {
      for (const id of batch.blockIDs) {
        const block = document.blocks.find((candidate) => candidate.id === id);
        if (block && !block.translation) {
          block.status = "failed";
          block.error = error instanceof Error ? error.message : String(error);
        }
      }
    }
    completed = document.blocks.filter(
      (block) => isTranslatableBlock(block) && block.translation,
    ).length;
    callbacks.onProgress(
      completed,
      overallTotal,
      `已翻译 ${completed}/${overallTotal} 个内容块`,
    );
    await callbacks.onCheckpoint(document, usage);
  });

  const failedBlocks = document.blocks.filter(
    (block) => isTranslatableBlock(block) && !block.translation,
  );
  if (failedBlocks.length) {
    callbacks.onProgress(
      completed,
      overallTotal,
      `正在逐块补译 ${failedBlocks.length} 个失败内容块`,
    );
    const retryBatches = failedBlocks.map((block, index): TranslationBatch => ({
      id: `repair-${index + 1}`,
      blockIDs: [block.id],
      characterCount: block.source.length,
    }));
    await runConcurrent(
      retryBatches,
      Math.min(options.concurrency, 2),
      async (batch) => {
        await translateBatch(
          batch,
          document,
          options.glossary,
          options.maxOutputTokens,
          signal,
          usage,
        );
        completed = document.blocks.filter(
          (block) => isTranslatableBlock(block) && block.translation,
        ).length;
        callbacks.onProgress(
          completed,
          overallTotal,
          `已翻译 ${completed}/${overallTotal} 个内容块`,
        );
        await callbacks.onCheckpoint(document, usage);
      },
    );
  }

  const missing = document.blocks.filter(
    (block) => isTranslatableBlock(block) && !block.translation,
  );
  if (missing.length) {
    throw new Error(
      `仍有 ${missing.length} 个内容块翻译失败：${missing
        .slice(0, 12)
        .map((block) => block.id)
        .join(", ")}`,
    );
  }
  return usage;
}

export const paperTranslatorInternals = {
  buildJSONBatchMessages,
  buildTextBatchMessages,
  parseGlossaryJSON,
  matchingGlossary,
};
