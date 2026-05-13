import { ChatMessage, ContextLevel, GlossaryEntry } from "../../types";
import { formatGlossaryForPrompt, matchGlossaryTerms } from "./glossary";

export interface BuildPromptInput {
  level: ContextLevel;
  selected: string;
  context: string;
  glossaryEntries: GlossaryEntry[];
  targetLanguage: string;
}

const SYSTEM_WORD = `你是学术论文阅读助手。用户正在阅读英文学术论文，选中了一个词/短语。
请根据该词在句子中的具体语境，提供：
1. 中文翻译（在此语境下最准确的译法）
2. 词性和学术含义（一句话）
3. 在这个句子中为什么这样翻译（一句话）
回复格式简洁，不用重复原文。`;

const SYSTEM_SENTENCE = `你是学术论文翻译助手。用户选中了一个句子，并提供了所在段落作为上下文。
请提供：
1. 准确的中文翻译
2. 这句话在段落中的逻辑角色（引出论点/提供证据/总结/转折等，一句话）
回复格式简洁。`;

const SYSTEM_PARAGRAPH = `你是学术论文翻译助手。用户选中了一段文字，并提供了前后段落作为上下文。
请提供：
1. 完整的段落中文翻译
2. 与前文的衔接关系（一句话）
3. 本段的核心论点（一句话）
回复格式简洁。`;

function systemPromptFor(level: ContextLevel): string {
  switch (level) {
    case ContextLevel.Word:
      return SYSTEM_WORD;
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
  const { level, selected, context, glossaryEntries, targetLanguage } = input;

  const systemContent = systemPromptFor(level);

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
