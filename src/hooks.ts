import { config } from "../package.json";
import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";

import {
  getSelectedText,
  getCurrentPageNumber,
  getPageTextWithNeighbors,
  debugReaderStructure,
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
  positionPopup,
  appendStreamingCursor,
  appendChunk,
  removeCursor,
  addAction,
} from "./modules/ui/popup";
import { addHistoryRecord } from "./modules/ui/history";
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

    // DEBUG: dump params structure to understand the API
    let paramsDebug = "";
    try {
      paramsDebug = JSON.stringify(params, (key, val) => {
        if (typeof val === "object" && val !== null && key !== "") {
          return `[${typeof val}: ${Object.keys(val).join(",")}]`;
        }
        return val;
      }, 2);
    } catch { paramsDebug = String(params); }
    Zotero.log(`[ContextTranslate] params dump: ${paramsDebug}`, "warning");

    // Try multiple ways to get selected text
    const p = params as any;
    const candidates = [
      p?.annotation?.text,
      p?.text,
      p?.selectedText,
      p?.annotation?.comment,
      doc.getSelection()?.toString(),
      getSelectedText(reader),
    ];

    // Find first candidate that is a real string (not "[object Object]")
    let selectionText: string | null = null;
    for (const c of candidates) {
      if (typeof c === "string" && c.trim() && c !== "[object Object]") {
        selectionText = c.trim();
        break;
      }
    }

    Zotero.log(`[ContextTranslate] candidates: ${candidates.map(c => `${typeof c}:"${String(c).substring(0, 30)}"`).join(" | ")}`, "warning");
    Zotero.log(`[ContextTranslate] final: "${selectionText?.substring(0, 50)}"`, "warning");

    if (!selectionText) {
      Zotero.log("[ContextTranslate] DEBUG: No text found from any method!", "warning");
      return;
    }

    Zotero.log(`[ContextTranslate] DEBUG final selectionText: "${selectionText.substring(0, 100)}"`, "warning");

    // Auto-trigger translation
    const anchor = doc.createElement("span");
    append(anchor);

    doc.defaultView?.setTimeout(() => {
      const rect = anchor.getBoundingClientRect();
      handleTranslation(
        reader,
        doc,
        rect.left || 200,
        rect.bottom || 200,
        selectionText,
      );
    }, 50);

    // Auto-dismiss: when selection changes or clears, remove popup
    const onSelectionChange = () => {
      const currentSelection = doc.getSelection()?.toString()?.trim();
      if (!currentSelection) {
        removePopup(doc);
        doc.removeEventListener("selectionchange", onSelectionChange);
      }
    };
    doc.addEventListener("selectionchange", onSelectionChange);
  };

async function handleTranslation(
  reader: _ZoteroTypes.ReaderInstance,
  doc: Document,
  anchorX: number,
  anchorY: number,
  fallbackText?: string | null,
) {
  try {
  // ── 1. Gather selected text ────────────────────────────────────────────
  // fallbackText (from event params) is most reliable; getSelectedText uses unstable internal API
  const internalText = getSelectedText(reader);
  const validInternal = typeof internalText === "string"
    && internalText.trim()
    && !internalText.includes("[object")
    ? internalText.trim()
    : null;
  const selectedText = fallbackText || validInternal;
  if (!selectedText) {
    Zotero.log("[ContextTranslate] No selected text found", "warning");
    return;
  }
  Zotero.log(`[ContextTranslate] Selected: "${selectedText.substring(0, 50)}"`, "warning");

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
  // DEBUG: explore reader structure first
  debugReaderStructure(reader);

  let pageData;
  try {
    pageData = await getPageTextWithNeighbors(reader, itemID, pageNumber);
    Zotero.log(`[ContextTranslate] Page text extracted: ${pageData.paragraphs.length} paragraphs, ${pageData.rawText.length} chars`, "warning");
  } catch (extractErr: any) {
    Zotero.log(`[ContextTranslate] Page extraction FAILED: ${extractErr?.message || extractErr}`, "warning");
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

  // ── 6. Create popup and position it ────────────────────────────────────
  const { container, contentArea, actionsArea } = createPopup(
    doc,
    contextResult.level,
  );
  (doc.body ?? doc.documentElement)!.appendChild(container);
  positionPopup(container, anchorX, anchorY);

  // DEBUG: show what we're sending to the LLM
  const debugInfo = doc.createElement("div");
  debugInfo.style.cssText = "font-size:10px; color:#6c7086; margin-bottom:8px; border-bottom:1px solid #313244; padding-bottom:6px;";
  debugInfo.textContent = `[DEBUG] selected="${selectedText.substring(0, 50)}" | context="${contextResult.context.substring(0, 80)}..." | level=${contextResult.level}`;
  contentArea.appendChild(debugInfo);

  const cursor = appendStreamingCursor(doc, contentArea);

  // ── 7. Dismiss handlers ────────────────────────────────────────────────
  function onClickOutside(ev: MouseEvent) {
    if (!container.contains(ev.target as Node)) {
      removePopup(doc);
      doc.removeEventListener("mousedown", onClickOutside);
      doc.removeEventListener("keydown", onEscKey);
    }
  }

  function onEscKey(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      removePopup(doc);
      doc.removeEventListener("mousedown", onClickOutside);
      doc.removeEventListener("keydown", onEscKey);
    }
  }

  doc.addEventListener("mousedown", onClickOutside);
  doc.addEventListener("keydown", onEscKey);

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
      addAction(doc, actionsArea, "\u{1F4CB} 复制", () => {
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
          doc,
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
      addAction(doc, actionsArea, "\u{1F504} 重试", () => {
        removePopup(doc);
        handleTranslation(reader, doc, anchorX, anchorY);
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
      addAction(doc, actionsArea, "\u{1F504} 重试", () => {
        removePopup(doc);
        handleTranslation(reader, doc, anchorX, anchorY);
      });
    },
  });

  } catch (err: any) {
    const msg = err?.message || String(err) || "Unknown error";
    Zotero.log(`[ContextTranslate] Error: ${msg}`, "error");
    // Show error in a popup so user knows something went wrong
    removePopup(doc);
    const errPopup = createPopup(doc, ContextLevel.Word);
    (doc.body ?? doc.documentElement)!.appendChild(errPopup.container);
    positionPopup(errPopup.container, anchorX, anchorY);
    errPopup.contentArea.textContent = `❌ 错误: ${msg}`;
    errPopup.contentArea.style.color = "#f38ba8";
    addAction(doc, errPopup.actionsArea, "关闭", () => removePopup(doc));
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
