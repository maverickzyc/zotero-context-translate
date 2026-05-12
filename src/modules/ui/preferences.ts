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
  const fp = new (win as any).FilePicker();
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
  const fp = new (win as any).FilePicker();
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
