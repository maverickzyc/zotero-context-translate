import { ChatMessage, ContextLevel, GlossaryEntry } from "../../types";
import { formatGlossaryForPrompt, matchGlossaryTerms } from "./glossary";

export interface BuildPromptInput {
  level: ContextLevel;
  selected: string;
  context: string;
  glossaryEntries: GlossaryEntry[];
  targetLanguage: string;
  hasDictResult?: boolean;
}

const SYSTEM_WORD_WITH_DICT = `你是学术论文阅读助手。用户选中了一个词，词典已提供基础释义。
请结合该词所在句子的语境，用一两句话简明解释这个词在此处的具体含义和作用。不要重复词典的基础翻译。直接给出解读，无需编号。`;

const SYSTEM_WORD_NO_DICT = `你是学术论文阅读助手。用户选中了一个词/短语。
请根据该词在句子中的具体语境，提供：
1. 中文翻译（在此语境下最准确的译法）
2. 在这个句子中的具体含义（一句话）
回复简洁，不用重复原文。`;

const SYSTEM_SENTENCE = `你是学术论文翻译助手。用户选中了一个句子，并提供了所在段落作为上下文。
请严格按以下格式回复，翻译和解读之间用 --- 分隔：

[翻译内容]
---
[一句话说明这句话在段落中的逻辑角色：引出论点/提供证据/总结/转折等]`;

const SYSTEM_PARAGRAPH = `你是学术论文翻译助手。用户选中了一段文字，并提供了前后段落作为上下文。
请严格按以下格式回复，翻译和解读之间用 --- 分隔：

[完整段落翻译]
---
[与前文的衔接关系（一句话）。本段的核心论点（一句话）]`;

function systemPromptFor(level: ContextLevel, hasDictResult = false): string {
  switch (level) {
    case ContextLevel.Word:
      return hasDictResult ? SYSTEM_WORD_WITH_DICT : SYSTEM_WORD_NO_DICT;
    case ContextLevel.Sentence:
      return SYSTEM_SENTENCE;
    case ContextLevel.Paragraph:
      return SYSTEM_PARAGRAPH;
    default:
      return SYSTEM_SENTENCE;
  }
}

function levelLabel(level: ContextLevel): string {
  switch (level) {
    case ContextLevel.Word:
      return "词";
    case ContextLevel.Sentence:
      return "句子";
    case ContextLevel.Paragraph:
      return "段落";
    default:
      return "内容";
  }
}

function contextLabel(level: ContextLevel): string {
  switch (level) {
    case ContextLevel.Word:
      return "所在句子";
    case ContextLevel.Sentence:
      return "所在段落";
    case ContextLevel.Paragraph:
      return "上下文";
    default:
      return "上下文";
  }
}

/**
 * Build a two-message prompt (system + user) for translation.
 * Glossary terms are matched against the selected text and context,
 * then injected into the user message when present.
 */
export function buildPrompt(input: BuildPromptInput): ChatMessage[] {
  const { level, selected, context, glossaryEntries, targetLanguage, hasDictResult } = input;

  const systemContent = systemPromptFor(level, hasDictResult);

  // Match relevant glossary entries
  const matched = matchGlossaryTerms(glossaryEntries, selected, context);

  const glossarySection =
    matched.length > 0
      ? `\n\n【术语参考】\n${formatGlossaryForPrompt(matched)}`
      : "";

  const userContent =
    `请将以下${levelLabel(level)}翻译成 ${targetLanguage}。\n\n` +
    `【待翻译${levelLabel(level)}】\n${selected}\n\n` +
    `【${contextLabel(level)}】\n${context}` +
    glossarySection;

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
}
