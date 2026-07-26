import { config } from "../../../package.json";
import { PaperParserKind, PaperTemplate, PaperTranslateOptions } from "./types";

const prefix = config.prefsPrefix;

function stringPref(key: string, fallback: string): string {
  return (
    (Zotero.Prefs.get(`${prefix}.${key}`, true) as string | undefined) ||
    fallback
  );
}

function numberPref(key: string, fallback: number): number {
  const value = Number(Zotero.Prefs.get(`${prefix}.${key}`, true));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function booleanPref(key: string, fallback: boolean): boolean {
  const value = Zotero.Prefs.get(`${prefix}.${key}`, true);
  return typeof value === "boolean" ? value : fallback;
}

export function getMinerUToken(): string {
  return stringPref("paper.mineruToken", "");
}

export function getMinerUBaseURL(): string {
  return stringPref("paper.mineruBaseURL", "https://mineru.net/api/v4");
}

export function getPaperTranslateOptions(): PaperTranslateOptions {
  return {
    parser: stringPref("paper.parser", "auto") as PaperParserKind,
    template: stringPref("paper.template", "classic") as PaperTemplate,
    sourceLanguage: stringPref("translate.sourceLanguage", "en"),
    targetLanguage: stringPref("translate.targetLanguage", "zh-CN"),
    concurrency: Math.min(4, Math.max(1, numberPref("paper.concurrency", 2))),
    maxBatchCharacters: Math.max(
      4000,
      numberPref("paper.maxBatchCharacters", 24000),
    ),
    maxOutputTokens: Math.max(2048, numberPref("paper.maxOutputTokens", 8192)),
    mineruModel: stringPref("paper.mineruModel", "vlm") as "vlm" | "pipeline",
    mineruOCR: booleanPref("paper.mineruOCR", true),
  };
}

export function resolveParserKind(
  requested: PaperParserKind,
): Exclude<PaperParserKind, "auto"> {
  if (requested !== "auto") return requested;
  return getMinerUToken().trim() ? "mineru" : "zotero-fulltext";
}
