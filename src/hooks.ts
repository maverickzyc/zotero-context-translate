import { config } from "../package.json";
import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";

import {
  getCurrentPageNumber,
  getPageTextWithNeighbors,
} from "./modules/context/text-extractor";
import { resolveContext } from "./modules/context/context-resolver";
import { clearAllCache } from "./modules/context/page-cache";
import {
  matchGlossaryTerms,
  loadGlossary,
  addGlossaryEntry,
  saveGlossary,
} from "./modules/translate/glossary";
import { buildPrompt } from "./modules/translate/prompt-builder";
import { streamTranslation } from "./modules/translate/llm-service";
import {
  createPopup,
  removePopup,
  dismissIfNotPinned,
  isPinned,
  positionPopup,
  appendStreamingCursor,
  appendChunk,
  removeCursor,
  addAction,
} from "./modules/ui/popup";
import { addHistoryRecord, loadHistory } from "./modules/ui/history";
import {
  onPrefsLoad,
  onImportGlossary,
  onExportGlossary,
} from "./modules/ui/preferences";
import { ContextLevel, GlossaryEntry } from "./types";

// ─── Lifecycle hooks ──────────────────────────────────────────────────────────

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // Register preferences pane
  Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: "Context Translate",
    image: rootURI + "content/icons/favicon.png",
  });

  // Register Reader text-selection event listener
  Zotero.Reader.registerEventListener(
    "renderTextSelectionPopup",
    onTextSelectionPopup,
    config.addonID,
  );

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${config.addonRef}-mainWindow.ftl`,
  );
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();

  // Clear all page caches
  clearAllCache();

  // Unregister Reader event listener
  Zotero.Reader.unregisterEventListener(
    "renderTextSelectionPopup",
    onTextSelectionPopup,
  );

  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[config.addonInstance];
}

// ─── Preferences dispatcher ──────────────────────────────────────────────────

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      await onPrefsLoad(data.window);
      break;
    case "importGlossary":
      await onImportGlossary(data.window);
      break;
    case "exportGlossary":
      await onExportGlossary(data.window);
      break;
    default:
      return;
  }
}

// ─── Reader text selection handler ───────────────────────────────────────────

const onTextSelectionPopup: _ZoteroTypes.Reader.EventHandler<"renderTextSelectionPopup"> =
  (event) => {
    const { reader, doc, params, append } = event;

    // Get selected text from event params (most reliable in Zotero 9)
    const p = params as any;
    const selectionText = (typeof p?.annotation?.text === "string" && p.annotation.text.trim())
      ? p.annotation.text.trim()
      : doc.getSelection()?.toString()?.trim() || null;

    if (!selectionText) return;

    // Get screen coordinates for the popup position
    const anchor = doc.createElement("span");
    append(anchor);

    doc.defaultView?.setTimeout(() => {
      const rect = anchor.getBoundingClientRect();
      const iframeWin = doc.defaultView;
      const screenX = (iframeWin?.mozInnerScreenX ?? 0) + rect.left;
      const screenY = (iframeWin?.mozInnerScreenY ?? 0) + rect.bottom + 5;

      handleTranslation(reader, screenX, screenY, selectionText);
    }, 50);

    // Auto-dismiss: click anywhere outside the popup closes it (unless pinned)
    const mainWin = Zotero.getMainWindow();
    const onClickOutside = (ev: Event) => {
      if (isPinned()) return;
      const popup = mainWin.document.getElementById("ctx-translate-popup");
      if (!popup) {
        mainWin.removeEventListener("mousedown", onClickOutside, true);
        return;
      }
      if (!popup.contains(ev.target as Node)) {
        dismissIfNotPinned();
        mainWin.removeEventListener("mousedown", onClickOutside, true);
      }
    };
    // Delay to avoid triggering on the initial selection click
    mainWin.setTimeout(() => {
      mainWin.addEventListener("mousedown", onClickOutside, true);
    }, 500);
  };

async function handleTranslation(
  reader: _ZoteroTypes.ReaderInstance,
  screenX: number,
  screenY: number,
  fallbackText?: string | null,
) {
  try {
  // ── 1. Gather selected text ────────────────────────────────────────────
  const selectedText = fallbackText?.trim();
  if (!selectedText) return;

  const pageNumber = getCurrentPageNumber(reader) || 1;

  let itemID: number | undefined;
  try {
    // @ts-expect-error - Zotero_Tabs is a global in the main window
    itemID = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID)?.itemID;
  } catch {
    // Fallback: try to get from reader directly
    itemID = (reader as any).itemID || (reader as any)._itemID;
  }
  if (!itemID) {
    Zotero.log("[ContextTranslate] Cannot determine item ID", "warning");
    itemID = 0;
  }

  // ── 2. Extract page text with neighboring paragraphs ───────────────────
  let pageData;
  try {
    pageData = await getPageTextWithNeighbors(reader, itemID, pageNumber);
  } catch {
    pageData = {
      paragraphs: [selectedText],
      rawText: selectedText,
      timestamp: Date.now(),
    };
  }

  // ── 3. Resolve context level and surrounding text ──────────────────────
  const contextResult = resolveContext(selectedText, pageData.paragraphs);

  // ── 4. Load glossary and match terms ───────────────────────────────────
  // @ts-expect-error - Zotero.Profile.dir is a runtime API
  const profileDir: string = Zotero.Profile.dir;
  const libraryId: number = Zotero.Libraries.userLibraryID;
  let glossaryEntries: GlossaryEntry[] = [];
  try {
    const glossaryData = await loadGlossary(profileDir, libraryId);
    glossaryEntries = matchGlossaryTerms(
      glossaryData.entries,
      contextResult.selected,
      contextResult.context,
    );
  } catch {
    glossaryEntries = [];
  }

  // ── 5. Build the prompt ────────────────────────────────────────────────
  const targetLanguage =
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.translate.targetLanguage`,
      true,
    ) as string) || "中文";

  const messages = buildPrompt({
    level: contextResult.level,
    selected: contextResult.selected,
    context: contextResult.context,
    glossaryEntries,
    targetLanguage,
  });

  // ── 6. Create popup in main window and position it ─────────────────────
  const { container, contentArea, actionsArea } = createPopup(contextResult.level);
  positionPopup(container, screenX, screenY);

  const cursor = appendStreamingCursor(contentArea);

  // ── 8. Stream translation ──────────────────────────────────────────────
  let fullText = "";

  await streamTranslation(messages, {
    onChunk(text: string) {
      fullText += text;
      appendChunk(contentArea, cursor, text);
    },

    async onDone(result: string) {
      fullText = result || fullText;
      removeCursor(cursor);

      // Copy button
      addAction(actionsArea, "\u{1F4CB} 复制", () => {
        try {
          const clipHelper = (Components.classes as any)[
            "@mozilla.org/widget/clipboardhelper;1"
          ].getService(Components.interfaces.nsIClipboardHelper);
          clipHelper.copyString(fullText);
        } catch {
          // Fallback: use navigator.clipboard if available
          navigator.clipboard?.writeText(fullText);
        }
      });

      // Add to glossary button (only for word-level selections)
      if (contextResult.level === ContextLevel.Word) {
        addAction(
          actionsArea,
          "\u{1F4DA} 加入术语表",
          async () => {
            try {
              const glossaryData = await loadGlossary(profileDir, libraryId);
              const updated = addGlossaryEntry(glossaryData, {
                term: contextResult.selected,
                translation: fullText.trim(),
              });
              await saveGlossary(profileDir, libraryId, updated);
            } catch (err) {
              ztoolkit.log("Failed to add glossary entry", err);
            }
          },
        );
      }

      // Retry button
      addAction(actionsArea, "\u{1F504} 重试", () => {
        removePopup();
        handleTranslation(reader, screenX, screenY, selectedText);
      });

      // History button — show recent translations in the popup
      addAction(actionsArea, "\u{1F4DC} 历史", async () => {
        try {
          const history = await loadHistory(profileDir, libraryId);
          const recent = history.records.slice(0, 10);
          if (recent.length === 0) {
            contentArea.textContent = "暂无翻译记录";
            return;
          }
          contentArea.innerHTML = "";
          const doc = contentArea.ownerDocument!;
          for (const rec of recent) {
            const item = doc.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement;
            Object.assign(item.style, {
              padding: "6px 0",
              borderBottom: "1px solid #313244",
              cursor: "pointer",
              fontSize: "13px",
            });
            const word = doc.createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLElement;
            word.style.color = "#818cf8";
            word.style.fontWeight = "600";
            word.textContent = rec.selected.substring(0, 30);
            const result = doc.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement;
            result.style.color = "#a6adc8";
            result.style.fontSize = "12px";
            result.style.marginTop = "2px";
            result.textContent = rec.result.substring(0, 80) + (rec.result.length > 80 ? "..." : "");
            item.append(word, result);
            item.addEventListener("click", () => {
              contentArea.innerHTML = "";
              contentArea.style.whiteSpace = "pre-wrap";
              contentArea.textContent = rec.result;
            });
            contentArea.appendChild(item);
          }
        } catch {
          contentArea.textContent = "读取历史记录失败";
        }
      });

      // Save to history
      try {
        await addHistoryRecord(profileDir, libraryId, {
          selected: contextResult.selected,
          context: contextResult.context,
          level: contextResult.level,
          result: fullText,
          itemId: String(itemID),
          page: pageNumber,
        });
      } catch (err) {
        ztoolkit.log("Failed to save history record", err);
      }
    },

    onError(error: Error) {
      removeCursor(cursor);
      const msg = error?.message || String(error) || "Unknown error";
      contentArea.textContent = `❌ 翻译出错: ${msg}`;
      contentArea.style.color = "#f38ba8";

      // Retry button on error
      addAction(actionsArea, "\u{1F504} 重试", () => {
        removePopup();
        handleTranslation(reader, screenX, screenY, selectedText);
      });
    },
  });

  } catch (err: any) {
    const msg = err?.message || String(err) || "Unknown error";
    Zotero.log(`[ContextTranslate] Error: ${msg}`, "error");
    // Show error in a popup so user knows something went wrong
    removePopup();
    removePopup();
    const errPopup = createPopup(ContextLevel.Word);
    positionPopup(errPopup.container, screenX, screenY);
    errPopup.contentArea.textContent = `❌ 错误: ${msg}`;
    errPopup.contentArea.style.color = "#f38ba8";
    addAction(errPopup.actionsArea, "关闭", () => removePopup());
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
