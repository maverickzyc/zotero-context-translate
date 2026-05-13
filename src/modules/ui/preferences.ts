import { loadGlossary, saveGlossary, glossaryFromCSV, glossaryToCSV } from "../translate/glossary";
import { getPresets, setActiveIndex, BUILTIN_PROVIDERS, LLMPreset } from "../translate/llm-service";
import { getDictStatus, downloadDictionary } from "../context/dictionary";

const prefix = "extensions.zotero.contextTranslate";

export async function onPrefsLoad(win: Window): Promise<void> {
  await updateGlossaryCount(win);
  await updateDictStatus(win);
  populateProviderDropdown(win);
  loadCurrentConfig(win);
}

// ─── Provider dropdown + config ───────────────────────────────────────────────

function populateProviderDropdown(win: Window): void {
  const popup = win.document.getElementById("context-translate-provider-popup");
  if (!popup) return;

  // Clear existing items
  while (popup.firstChild) popup.removeChild(popup.firstChild);

  // Add built-in providers
  for (const provider of BUILTIN_PROVIDERS) {
    const item = win.document.createXULElement("menuitem");
    item.setAttribute("label", provider.name);
    item.setAttribute("value", provider.name);
    popup.appendChild(item);
  }

  // Set current selection based on saved config
  const presets = getPresets();
  const activeIndex = (Zotero.Prefs.get(`${prefix}.llm.activeIndex`, true) as number) ?? 0;
  const menulist = win.document.getElementById("context-translate-provider") as any;
  if (menulist && presets.length > 0 && presets[activeIndex]) {
    menulist.value = presets[activeIndex].name;
  } else {
    menulist.value = "DeepSeek";
  }
}

function loadCurrentConfig(win: Window): void {
  const presets = getPresets();
  const activeIndex = (Zotero.Prefs.get(`${prefix}.llm.activeIndex`, true) as number) ?? 0;

  if (presets.length > 0 && presets[activeIndex]) {
    const p = presets[activeIndex];
    setField(win, "context-translate-baseUrl", p.baseUrl);
    setField(win, "context-translate-apiKey", p.apiKey);
    setField(win, "context-translate-model", p.model);
    setField(win, "context-translate-temperature", p.temperature);
  } else {
    // Load from default provider
    const defaultProvider = BUILTIN_PROVIDERS[0];
    setField(win, "context-translate-baseUrl", defaultProvider.baseUrl);
    setField(win, "context-translate-apiKey", "");
    setField(win, "context-translate-model", defaultProvider.model);
    setField(win, "context-translate-temperature", defaultProvider.temperature);
  }
}

export function onProviderChange(win: Window, providerName: string): void {
  const provider = BUILTIN_PROVIDERS.find(p => p.name === providerName);
  if (!provider) return;

  // Fill form with provider defaults (keep existing API key)
  if (provider.baseUrl) setField(win, "context-translate-baseUrl", provider.baseUrl);
  if (provider.model) setField(win, "context-translate-model", provider.model);
  setField(win, "context-translate-temperature", provider.temperature);
}

export function onSaveConfig(win: Window): void {
  const providerMenu = win.document.getElementById("context-translate-provider") as any;
  const providerName = providerMenu?.value || "自定义";

  const preset: LLMPreset = {
    name: providerName,
    baseUrl: getField(win, "context-translate-baseUrl"),
    apiKey: getField(win, "context-translate-apiKey"),
    model: getField(win, "context-translate-model"),
    temperature: getField(win, "context-translate-temperature") || "0.3",
  };

  // Save as the single active preset (replace all presets for simplicity)
  Zotero.Prefs.set(`${prefix}.llm.presets`, JSON.stringify([preset]), true);
  setActiveIndex(0);

  // Show success feedback
  const status = win.document.getElementById("context-translate-save-status");
  if (status) {
    status.setAttribute("value", "✓ 已保存");
    win.setTimeout(() => status.setAttribute("value", ""), 2000);
  }
}

function setField(win: Window, id: string, value: string): void {
  const el = win.document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = value;
}

function getField(win: Window, id: string): string {
  return (win.document.getElementById(id) as HTMLInputElement)?.value || "";
}

// ─── Dictionary ───────────────────────────────────────────────────────────────

async function updateDictStatus(win: Window): Promise<void> {
  const status = getDictStatus();
  const label = win.document.getElementById("context-translate-dict-status");
  if (!label) return;
  if (!status.installed) {
    label.setAttribute("value", "词典未安装");
  } else {
    const typeLabel = status.type === "full" ? "完整版" : "轻量版";
    label.setAttribute("value", `已安装: ${typeLabel} (${status.entryCount.toLocaleString()} 词)`);
  }
}

export async function onDownloadDict(win: Window, type: "light" | "full"): Promise<void> {
  const progress = win.document.getElementById("context-translate-dict-progress");
  try {
    if (progress) progress.setAttribute("value", "下载中... 0%");
    await downloadDictionary(type, (pct) => {
      if (progress) progress.setAttribute("value", `下载中... ${pct}%`);
    });
    if (progress) progress.setAttribute("value", "下载完成！");
    await updateDictStatus(win);
  } catch (err: any) {
    if (progress) progress.setAttribute("value", `下载失败: ${err?.message}`);
  }
}

// ─── Glossary ─────────────────────────────────────────────────────────────────

async function updateGlossaryCount(win: Window): Promise<void> {
  const label = win.document.getElementById("context-translate-glossary-count");
  if (!label) return;
  const profileDir = (Zotero as any).Profile.dir;
  const libraryId = Zotero.Libraries.userLibraryID;
  const data = await loadGlossary(profileDir, libraryId);
  label.setAttribute("value", `术语数: ${data.entries.length} 条`);
}

export async function onImportGlossary(win: Window): Promise<void> {
  const fp = new (win as any).FilePicker();
  fp.init(win, "Import Glossary CSV", fp.modeOpen);
  fp.appendFilter("CSV", "*.csv");
  const result = await fp.show();
  if (result !== fp.returnOK) return;
  const raw = await Zotero.File.getContentsAsync(fp.file);
  const entries = glossaryFromCSV(raw as string);
  const profileDir = (Zotero as any).Profile.dir;
  const libraryId = Zotero.Libraries.userLibraryID;
  const existing = await loadGlossary(profileDir, libraryId);
  const merged = { entries: [...existing.entries, ...entries] };
  await saveGlossary(profileDir, libraryId, merged);
  await updateGlossaryCount(win);
}

export async function onExportGlossary(win: Window): Promise<void> {
  const fp = new (win as any).FilePicker();
  fp.init(win, "Export Glossary CSV", fp.modeSave);
  fp.appendFilter("CSV", "*.csv");
  fp.defaultString = "glossary.csv";
  const result = await fp.show();
  if (result !== fp.returnOK && result !== fp.returnReplace) return;
  const profileDir = (Zotero as any).Profile.dir;
  const libraryId = Zotero.Libraries.userLibraryID;
  const data = await loadGlossary(profileDir, libraryId);
  const csv = glossaryToCSV(data.entries);
  await Zotero.File.putContentsAsync(fp.file, csv);
}
