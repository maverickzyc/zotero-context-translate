import { ChatMessage, ContextLevel, GlossaryEntry } from "../../types";
import { formatGlossaryForPrompt, matchGlossaryTerms } from "./glossary";

export interface BuildPromptInput {
  level: ContextLevel;
  selected: string;
  context: string;
  glossaryEntries: GlossaryEntry[];
  targetLanguage: string;
}

const SYSTEM_WORD = `你是一位专业的学术翻译助手，专注于单词和短语的精确翻译。
请将用户提供的词汇翻译成目标语言，结合上下文给出最准确的翻译。
对于学术词汇，请给出在该学术语境下最合适的词汇翻译。
只输出翻译结果，不要添加解释或其他内容。`;

const SYSTEM_SENTENCE = `你是一位专业的学术翻译助手，专注于句子的精确翻译。
请将用户提供的句子翻译成目标语言，确保语义准确、表达流畅。
结合提供的段落上下文，保持翻译与全文风格一致。
只输出翻译结果，不要添加解释或其他内容。`;

const SYSTEM_PARAGRAPH = `你是一位专业的学术翻译助手，专注于段落的精确翻译。
请将用户提供的段落翻译成目标语言，确保语义准确、逻辑连贯、学术表达规范。
结合前后段落的上下文，保持翻译风格与全文一致。
只输出翻译结果，不要添加解释或其他内容。`;

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
