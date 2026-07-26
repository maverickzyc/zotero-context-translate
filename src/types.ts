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

export interface HistoryDictionaryResult {
  phonetic: string;
  translation: string;
  pos: string;
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
  operation?: "lookup" | "phrase-translation" | "translation";
  dictionary?: HistoryDictionaryResult;
  dictionaryOnly?: boolean;
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
