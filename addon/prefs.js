// LLM settings
pref("llm.baseUrl", "https://api.openai.com/v1");
pref("llm.apiKey", "");
pref("llm.model", "gpt-4o-mini");
pref("llm.temperature", "0.3");
pref("llm.maxTokens", 1024);
pref("llm.presets", "[]");
pref("llm.activeIndex", 0);

// Translation settings
pref("translate.sourceLanguage", "auto");
pref("translate.targetLanguage", "zh-CN");
pref("translate.triggerMode", "contextmenu");
pref("translate.explicitActionsMigrated", false);
pref("translate.wordLookupMode", "dictionary-context");
pref("translate.autoMode", false);

// Whole-paper bilingual HTML translation
pref("paper.parser", "auto");
pref("paper.template", "classic");
pref("paper.mineruToken", "");
pref("paper.mineruBaseURL", "https://mineru.net/api/v4");
pref("paper.mineruModel", "vlm");
pref("paper.mineruOCR", true);
pref("paper.concurrency", 2);
pref("paper.maxBatchCharacters", 24000);
pref("paper.maxOutputTokens", 8192);
pref("paper.privacyAccepted", false);

// Feature toggles
pref("enable", true);
