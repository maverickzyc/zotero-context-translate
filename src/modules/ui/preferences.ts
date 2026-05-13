import { loadGlossary, saveGlossary, glossaryFromCSV, glossaryToCSV } from "../translate/glossary";
import { getPresets, setActiveIndex, LLMPreset } from "../translate/llm-service";
import { getDictStatus, downloadDictionary } from "../context/dictionary";

const prefix = "extensions.zotero.contextTranslate";

let editingIndex = -1;

export async function onPrefsLoad(win: Window): Promise<void> {
  await updateGlossaryCount(win);
  await updateDictStatus(win);
  renderPresetList(win);
}

// ─── Presets ──────────────────────────────────────────────────────────────────

function renderPresetList(win: Window): void {
  const container = win.document.getElementById("context-translate-presets-list");
  if (!container) return;
  container.innerHTML = "";

  const presets = getPresets();
  const activeIndex = (Zotero.Prefs.get(`${prefix}.llm.activeIndex`, true) as number) ?? 0;

  if (presets.length === 0) {
    const empty = win.document.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement;
    empty.textContent = "暂无预设，请添加";
    empty.style.cssText = "color: #888; padding: 4px 0;";
    container.appendChild(empty);
    return;
  }

  for (let i = 0; i < presets.length; i++) {
    const p = presets[i];
    const row = win.document.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement;
    row.style.cssText = "display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer;";
    if (i === activeIndex) row.style.fontWeight = "bold";

    const star = win.document.createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLElement;
    star.textContent = i === activeIndex ? "★" : "☆";
    star.style.cursor = "pointer";
    star.addEventListener("click", () => {
      setActiveIndex(i);
      renderPresetList(win);
    });

    const name = win.document.createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLElement;
    name.textContent = `${p.name} (${p.model})`;
    name.style.flex = "1";
    name.addEventListener("click", () => {
      editingIndex = i;
      fillPresetForm(win, p);
    });

    row.append(star, name);
    container.appendChild(row);
  }
}

function fillPresetForm(win: Window, preset: LLMPreset): void {
  const setVal = (id: string, val: string) => {
    const el = win.document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = val;
  };
  setVal("context-translate-preset-name", preset.name);
  setVal("context-translate-preset-baseUrl", preset.baseUrl);
  setVal("context-translate-preset-apiKey", preset.apiKey);
  setVal("context-translate-preset-model", preset.model);
  setVal("context-translate-preset-temperature", preset.temperature);
}

export function onAddPreset(win: Window): void {
  editingIndex = -1;
  fillPresetForm(win, { name: "", baseUrl: "https://api.openai.com/v1", apiKey: "", model: "", temperature: "0.3" });
}

export function onSavePreset(win: Window): void {
  const getVal = (id: string) => (win.document.getElementById(id) as HTMLInputElement)?.value || "";
  const preset: LLMPreset = {
    name: getVal("context-translate-preset-name") || "Unnamed",
    baseUrl: getVal("context-translate-preset-baseUrl"),
    apiKey: getVal("context-translate-preset-apiKey"),
    model: getVal("context-translate-preset-model"),
    temperature: getVal("context-translate-preset-temperature"),
  };

  const presets = getPresets();
  if (editingIndex >= 0 && editingIndex < presets.length) {
    presets[editingIndex] = preset;
  } else {
    presets.push(preset);
    editingIndex = presets.length - 1;
  }

  Zotero.Prefs.set(`${prefix}.llm.presets`, JSON.stringify(presets), true);
  if (presets.length === 1) setActiveIndex(0);
  renderPresetList(win);
}

export function onDeletePreset(win: Window): void {
  if (editingIndex < 0) return;
  const presets = getPresets();
  if (editingIndex >= presets.length) return;
  presets.splice(editingIndex, 1);
  Zotero.Prefs.set(`${prefix}.llm.presets`, JSON.stringify(presets), true);
  const activeIndex = (Zotero.Prefs.get(`${prefix}.llm.activeIndex`, true) as number) ?? 0;
  if (activeIndex >= presets.length) setActiveIndex(Math.max(0, presets.length - 1));
  editingIndex = -1;
  fillPresetForm(win, { name: "", baseUrl: "", apiKey: "", model: "", temperature: "0.3" });
  renderPresetList(win);
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
