import { config } from "../package.json";
import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";

import {
  getCurrentPageNumber,
  getPageTextWithNeighbors,
} from "./modules/context/text-extractor";
import {
  isDictionaryLookupCandidate,
  loadDictionary,
  lookupPhrase,
} from "./modules/context/dictionary";
import { resolveContext } from "./modules/context/context-resolver";
import { clearAllCache } from "./modules/context/page-cache";
import {
  getCached,
  setCache,
  clearAllTranslateCache,
  TranslationAction,
} from "./modules/context/translate-cache";
import {
  getPresets,
  setActiveIndex,
  getActivePresetName,
} from "./modules/translate/llm-service";
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
  showDictResult,
  appendStreamingCursor,
  appendChunk,
  removeCursor,
  addAction,
} from "./modules/ui/popup";
import { createUIIcon } from "./modules/ui/icons";
import { addHistoryRecord } from "./modules/ui/history";
import {
  closeTranslateWorkbench,
  showTranslateWorkbench,
} from "./modules/ui/workbench";
import {
  onPrefsLoad,
  onImportGlossary,
  onExportGlossary,
  onProviderChange,
  onSaveConfig,
  onDownloadDict,
} from "./modules/ui/preferences";
import { ContextLevel, GlossaryEntry } from "./types";
import {
  registerPaperTranslateFeature,
  unregisterPaperTranslateFeature,
} from "./modules/paper-translate/register";
import { paperJobManager } from "./modules/paper-translate/job-manager";

// ─── Lifecycle hooks ──────────────────────────────────────────────────────────

const WORKBENCH_TOOLBAR_BUTTON_ID = "context-translate-workbench-button";
const workbenchButtonTimers = new WeakMap<Window, number>();
const workbenchButtonObservers = new WeakMap<Window, MutationObserver>();

function removeWorkbenchToolbarButton(win: Window): void {
  const timer = workbenchButtonTimers.get(win);
  if (timer !== undefined) {
    win.clearTimeout(timer);
    workbenchButtonTimers.delete(win);
  }
  workbenchButtonObservers.get(win)?.disconnect();
  workbenchButtonObservers.delete(win);
  win.document.getElementById(WORKBENCH_TOOLBAR_BUTTON_ID)?.remove();
}

function registerWorkbenchToolbarButton(
  win: _ZoteroTypes.MainWindow,
  attempt = 0,
): void {
  removeWorkbenchToolbarButton(win);
  const document = win.document;
  const toolbar = document.getElementById("zotero-items-toolbar");
  if (!toolbar) {
    if (attempt < 20) {
      const timer = win.setTimeout(
        () => registerWorkbenchToolbarButton(win, attempt + 1),
        250,
      );
      workbenchButtonTimers.set(win, timer);
    } else {
      Zotero.log(
        "[ContextTranslate] Zotero items toolbar was not found; workbench button was not installed",
      );
    }
    return;
  }

  const button = (document as any).createXULElement(
    "toolbarbutton",
  ) as HTMLElement;
  button.id = WORKBENCH_TOOLBAR_BUTTON_ID;
  button.classList.add("zotero-tb-button");
  button.setAttribute("tabindex", "-1");
  button.setAttribute(
    "data-l10n-id",
    "context-translate-workbench-toolbar-button",
  );
  button.setAttribute("tooltiptext", "Context Translate 工作台");
  button.setAttribute("aria-label", "Context Translate 工作台");
  const iconURL = `${rootURI}content/icons/workbench.svg`;
  button.setAttribute("image", iconURL);
  button.style.color = "var(--fill-secondary)";
  button.style.setProperty("fill", "currentColor");
  button.style.listStyleImage = `url("${iconURL}")`;
  button.style.setProperty("-moz-context-properties", "fill, fill-opacity");
  button.addEventListener("command", () => {
    showTranslateWorkbench({ tab: "history" });
  });

  const keepAtEndOfLeftGroup = () => {
    const activeToolbar = document.getElementById("zotero-items-toolbar");
    if (activeToolbar !== toolbar || !button.isConnected) {
      if (workbenchButtonTimers.get(win) === undefined) {
        const timer = win.setTimeout(
          () => registerWorkbenchToolbarButton(win),
          100,
        );
        workbenchButtonTimers.set(win, timer);
      }
      return;
    }
    const flexibleSpacer = toolbar.querySelector("spacer[flex='1']");
    if (button.nextSibling !== flexibleSpacer) {
      toolbar.insertBefore(button, flexibleSpacer || null);
    }
  };

  const flexibleSpacer = toolbar.querySelector("spacer[flex='1']");
  toolbar.insertBefore(button, flexibleSpacer || null);

  // Other add-ons can append their toolbar buttons after our startup hook.
  // Keep this button as the final control in the left group, directly before
  // Zotero's flexible spacer (the position shown in the library toolbar).
  const observer = new win.MutationObserver(keepAtEndOfLeftGroup);
  observer.observe(toolbar, { childList: true });
  if (toolbar.parentElement) {
    observer.observe(toolbar.parentElement, { childList: true });
  }
  workbenchButtonObservers.set(win, observer);
}

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  migrateToExplicitSelectionActions();

  // Load dictionary in background (non-blocking)
  loadDictionary();

  // Register preferences pane
  Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: "Context Translate",
    image: rootURI + "content/icons/favicon.png",
  });

  // Register Reader event listeners
  Zotero.Reader.registerEventListener(
    "renderTextSelectionPopup",
    onTextSelectionPopup,
    config.addonID,
  );

  // Register the PDF view menu used by raw text selections in Zotero 9.
  Zotero.Reader.registerEventListener(
    "createViewContextMenu",
    onViewContextMenu,
    config.addonID,
  );

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  registerPaperTranslateFeature();

  addon.api = {
    paperJobs: {
      list: () => paperJobManager.list(),
      get: (jobID: string) => paperJobManager.get(jobID),
      resume: (jobID: string) => paperJobManager.resume(jobID),
      pause: (jobID: string) => paperJobManager.pause(jobID),
      cancel: (jobID: string) => paperJobManager.cancel(jobID),
      rerender: (jobID: string) => paperJobManager.rerender(jobID),
      repair: (jobID: string) => paperJobManager.repairAndRetranslate(jobID),
    },
  };

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(`${config.addonRef}-mainWindow.ftl`);
  registerWorkbenchToolbarButton(win);
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  removeWorkbenchToolbarButton(_win);
  closeTranslateWorkbench(_win);
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  for (const win of Zotero.getMainWindows()) {
    removeWorkbenchToolbarButton(win);
    closeTranslateWorkbench(win);
  }
  ztoolkit.unregisterAll();

  clearAllCache();
  clearAllTranslateCache();

  // Unregister Reader event listener
  Zotero.Reader.unregisterEventListener(
    "renderTextSelectionPopup",
    onTextSelectionPopup,
  );
  Zotero.Reader.unregisterEventListener(
    "createViewContextMenu",
    onViewContextMenu,
  );
  clearDismissListener?.();
  clearDismissListener = null;
  lastSelection = null;
  unregisterPaperTranslateFeature();

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
    case "providerChange":
      onProviderChange(data.window, data.value);
      break;
    case "saveConfig":
      onSaveConfig(data.window);
      break;
    case "downloadDict":
      await onDownloadDict(data.window, data.type);
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

// Store last selection info for contextmenu trigger mode
let lastSelection: {
  reader: _ZoteroTypes.ReaderInstance;
  doc: Document;
  clientX: number;
  clientY: number;
  text: string;
  capturedAt: number;
} | null = null;

const LAST_SELECTION_TTL = 2 * 60 * 1000;

function migrateToExplicitSelectionActions(): void {
  const migrationPref = `${config.prefsPrefix}.translate.explicitActionsMigrated`;
  if (Zotero.Prefs.get(migrationPref, true)) return;
  Zotero.Prefs.set(
    `${config.prefsPrefix}.translate.triggerMode`,
    "contextmenu",
    true,
  );
  Zotero.Prefs.set(migrationPref, true, true);
}

function getTriggerMode(): string {
  return (
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.translate.triggerMode`,
      true,
    ) as string) || "contextmenu"
  );
}

function getWordLookupMode(): "dictionary-context" | "dictionary-only" {
  return Zotero.Prefs.get(
    `${config.prefsPrefix}.translate.wordLookupMode`,
    true,
  ) === "dictionary-only"
    ? "dictionary-only"
    : "dictionary-context";
}

function copyText(value: string): void {
  try {
    const clipHelper = (Components.classes as any)[
      "@mozilla.org/widget/clipboardhelper;1"
    ].getService(Components.interfaces.nsIClipboardHelper);
    clipHelper.copyString(value);
  } catch {
    void navigator.clipboard?.writeText(value);
  }
}

function formatLookupText(
  selectedText: string,
  dictionaryEntry: ReturnType<typeof lookupPhrase>,
  contextualResult: string,
): string {
  const parts: string[] = [];
  if (dictionaryEntry) {
    const phonetic = dictionaryEntry.phonetic
      ? ` /${dictionaryEntry.phonetic}/`
      : "";
    const partOfSpeech = dictionaryEntry.pos ? `${dictionaryEntry.pos} ` : "";
    parts.push(
      `${selectedText}${phonetic}\n${partOfSpeech}${dictionaryEntry.translation}`,
    );
  }
  if (contextualResult.trim()) parts.push(contextualResult.trim());
  return parts.join("\n\n");
}

export const onTextSelectionPopup: _ZoteroTypes.Reader.EventHandler<
  "renderTextSelectionPopup"
> = (event) => {
  const { reader, doc, params, append } = event;

  const p = params as any;
  const selectionText =
    typeof p?.annotation?.text === "string" && p.annotation.text.trim()
      ? p.annotation.text.trim()
      : doc.getSelection()?.toString()?.trim() || null;

  if (!selectionText) return;

  const triggerMode = getTriggerMode();
  const anchor = doc.createElement("span");
  Object.assign(anchor.style, {
    display: "inline-block",
    width: "1px",
    height: "1px",
    pointerEvents: "none",
  });

  const captureSelection = (positionElement: Element = anchor) => {
    const rect = positionElement.getBoundingClientRect();
    lastSelection = {
      reader,
      doc,
      clientX: rect.left,
      clientY: rect.bottom + 5,
      text: selectionText,
      capturedAt: Date.now(),
    };
    return lastSelection;
  };

  if (triggerMode === "contextmenu") {
    const createSelectionAction = (
      action: TranslationAction,
      label: string,
    ) => {
      const button = doc.createElement("button");
      button.className = "toolbar-button wide-button";
      button.setAttribute("type", "button");
      button.setAttribute("data-tabstop", "1");
      button.setAttribute("data-context-translate-action", action);
      button.setAttribute(
        "title",
        action === "lookup"
          ? "使用 Context Translate 查询所选内容"
          : "使用 Context Translate 翻译所选内容",
      );
      button.append(
        createUIIcon(doc, action === "lookup" ? "lookup" : "translate", 15),
        doc.createTextNode(label),
      );
      Object.assign(button.style, {
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
      });
      button.addEventListener("mousedown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const selection = captureSelection(button);
        void handleTranslation(
          selection.reader,
          selection.clientX,
          selection.clientY,
          selection.text,
          selection.doc,
          action,
        );
      });
      return button;
    };
    append(
      createSelectionAction("lookup", "查词"),
      createSelectionAction("translate", "翻译"),
      anchor,
    );
  } else {
    append(anchor);
  }

  doc.defaultView?.setTimeout(() => {
    const selection = captureSelection();

    // Auto mode: trigger immediately
    if (triggerMode === "auto") {
      void handleTranslation(
        selection.reader,
        selection.clientX,
        selection.clientY,
        selection.text,
        selection.doc,
        "translate",
      );
    }
  }, 50);
};

export const onViewContextMenu: _ZoteroTypes.Reader.EventHandler<
  "createViewContextMenu"
> = (event) => {
  const { reader, append } = event;
  if (
    getTriggerMode() !== "contextmenu" ||
    !lastSelection ||
    lastSelection.reader !== reader ||
    Date.now() - lastSelection.capturedAt > LAST_SELECTION_TTL
  ) {
    return;
  }

  for (const [action, label] of [
    ["lookup", "上下文查词"],
    ["translate", "上下文翻译"],
  ] as const) {
    append({
      label,
      onCommand: () => {
        const selection = lastSelection;
        if (!selection) return;
        void handleTranslation(
          selection.reader,
          selection.clientX,
          selection.clientY,
          selection.text,
          selection.doc,
          action,
        );
      },
    });
  }
};

let clearDismissListener: (() => void) | null = null;

function setupDismissListener(popupDoc: Document) {
  clearDismissListener?.();

  const mainWin = Zotero.getMainWindow();
  const documents = [popupDoc, mainWin.document].filter(
    (doc, index, all) => all.indexOf(doc) === index,
  );
  let listening = false;
  const timerWindow = popupDoc.defaultView || mainWin;
  let listenerTimer: number | null = null;

  const cleanup = () => {
    if (listenerTimer !== null) {
      timerWindow.clearTimeout(listenerTimer);
      listenerTimer = null;
    }
    if (listening) {
      for (const doc of documents) {
        doc.removeEventListener("mousedown", onClickOutside, true);
      }
      listening = false;
    }
    if (clearDismissListener === cleanup) clearDismissListener = null;
  };
  const onClickOutside = (ev: Event) => {
    if (isPinned()) return;
    const popup = popupDoc.getElementById("ctx-translate-popup");
    if (!popup) {
      cleanup();
      return;
    }
    if (!popup.contains(ev.target as Node)) {
      dismissIfNotPinned();
      cleanup();
    }
  };
  clearDismissListener = cleanup;

  listenerTimer = timerWindow.setTimeout(() => {
    listenerTimer = null;
    for (const doc of documents) {
      doc.addEventListener("mousedown", onClickOutside, true);
    }
    listening = true;
  }, 300);
}

async function handleTranslation(
  reader: _ZoteroTypes.ReaderInstance,
  clientX: number,
  clientY: number,
  fallbackText?: string | null,
  ownerDocument?: Document,
  action: TranslationAction = "translate",
) {
  const popupDoc =
    ownerDocument ||
    (reader as any)._iframeWindow?.document ||
    Zotero.getMainWindow().document;
  try {
    // ── 1. Gather selected text ────────────────────────────────────────────
    const selectedText = fallbackText?.trim();
    if (!selectedText) return;
    const dictionaryLookup = action === "lookup";
    const exactDictionaryTerm = isDictionaryLookupCandidate(selectedText);

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
      itemID = 0;
    }

    // ── 1b. Check translation cache ───────────────────────────────────────
    const cached = getCached(itemID, pageNumber, selectedText, action);
    if (cached) {
      // Show cached result instantly
      const { container, dictArea, contentArea, analysisArea, actionsArea } =
        createPopup(cached.level, popupDoc, action);
      positionPopup(container, clientX, clientY);
      setupDismissListener(popupDoc);

      // Show dict result if cached
      if (cached.dictResult) {
        showDictResult(
          dictArea,
          selectedText,
          cached.dictResult.phonetic,
          cached.dictResult.pos,
          cached.dictResult.translation,
        );
      }

      // Show cached LLM result, split by --- for sentence/paragraph. A
      // dictionary-only hit already has everything it needs in dictArea.
      if (cached.dictionaryOnly && cached.dictResult && !cached.llmResult) {
        contentArea.style.display = "none";
      } else if (
        cached.level !== ContextLevel.Word &&
        cached.llmResult.includes("---")
      ) {
        const [translation, analysis] = cached.llmResult
          .split("---")
          .map((s) => s.trim());
        contentArea.textContent = translation;
        if (analysis) {
          analysisArea.style.display = "block";
          analysisArea.textContent = analysis;
        }
      } else {
        contentArea.textContent = cached.llmResult;
      }

      // Show "缓存" badge in header
      const badge = container.querySelector("span");
      if (badge) {
        const cacheBadge = badge.ownerDocument!.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "span",
        ) as HTMLElement;
        Object.assign(cacheBadge.style, {
          fontSize: "10px",
          color: "#6c7086",
          marginLeft: "8px",
        });
        cacheBadge.textContent = "缓存";
        badge.parentElement?.insertBefore(
          cacheBadge,
          badge.nextSibling?.nextSibling || null,
        );
      }

      addAction(
        actionsArea,
        "复制",
        () =>
          copyText(
            formatLookupText(selectedText, cached.dictResult, cached.llmResult),
          ),
        "copy",
      );

      addAction(
        actionsArea,
        dictionaryLookup ? "重新查询" : "重新翻译",
        () => {
          removePopup();
          // Force bypass cache by clearing this entry
          setCache(itemID!, pageNumber, selectedText, action, {
            ...cached,
            timestamp: 0,
          });
          void handleTranslation(
            reader,
            clientX,
            clientY,
            selectedText,
            popupDoc,
            action,
          );
        },
        "refresh",
      );

      addAction(
        actionsArea,
        "工作台",
        () => {
          removePopup();
          showTranslateWorkbench({ tab: "history" });
        },
        "history",
      );

      return;
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
    // The chosen button owns the route. Lookup always requests contextual
    // explanation; Translate always requests translation, even for one word.
    if (dictionaryLookup) {
      contextResult.level = ContextLevel.Word;
    } else if (contextResult.level === ContextLevel.Word) {
      contextResult.level = ContextLevel.Sentence;
    }

    // ── 4. Load glossary and match terms ───────────────────────────────────
    // @ts-expect-error - Zotero.Profile.dir is a runtime API
    const profileDir: string = Zotero.Profile.dir;
    const sourceItem = itemID ? Zotero.Items.get(itemID) : undefined;
    const libraryId: number =
      sourceItem?.libraryID || Zotero.Libraries.userLibraryID;
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
      ) as string) || "zh-CN";

    // hasDictResult will be set after dict lookup below
    let hasDictResult = false;

    // ── Build prompt (placeholder, will finalize after dict lookup) ────────
    function buildMessages() {
      return buildPrompt({
        level: contextResult.level,
        selected: contextResult.selected,
        context: contextResult.context,
        glossaryEntries,
        targetLanguage,
        hasDictResult,
      });
    }

    // ── 6. Create popup in the active Reader document ─────────────────────
    const { container, dictArea, contentArea, analysisArea, actionsArea } =
      createPopup(contextResult.level, popupDoc, action);
    positionPopup(container, clientX, clientY);
    setupDismissListener(popupDoc);

    // Stage 1: Instant dictionary lookup (single English terms only)
    await loadDictionary();
    const dictionaryEntry =
      dictionaryLookup && exactDictionaryTerm
        ? lookupPhrase(selectedText)
        : null;
    if (dictionaryEntry) {
      showDictResult(
        dictArea,
        selectedText,
        dictionaryEntry.phonetic,
        dictionaryEntry.pos,
        dictionaryEntry.translation,
      );
      hasDictResult = true;
    }

    let historySaved = false;
    const saveReadingHistory = async (
      contextualResult: string,
      dictionaryOnly: boolean,
    ) => {
      if (historySaved) return;
      historySaved = true;
      try {
        await addHistoryRecord(profileDir, libraryId, {
          selected: contextResult.selected,
          context: contextResult.context,
          level: contextResult.level,
          result: contextualResult,
          itemId: String(itemID),
          page: pageNumber,
          operation: dictionaryLookup ? "lookup" : "translation",
          dictionary: dictionaryEntry
            ? {
                phonetic: dictionaryEntry.phonetic,
                pos: dictionaryEntry.pos,
                translation: dictionaryEntry.translation,
              }
            : undefined,
          dictionaryOnly,
        });
      } catch (err) {
        ztoolkit.log("Failed to save history record", err);
      }
    };

    // Local-only lookup never contacts the configured LLM provider.
    if (dictionaryLookup && getWordLookupMode() === "dictionary-only") {
      const localMessage = dictionaryEntry
        ? ""
        : exactDictionaryTerm
          ? "本地词典未收录此词"
          : "本地词典仅支持查询单个英文词";
      if (dictionaryEntry) {
        contentArea.style.display = "none";
      } else {
        contentArea.textContent = localMessage;
      }
      if (dictionaryEntry) {
        addAction(
          actionsArea,
          "复制",
          () => copyText(formatLookupText(selectedText, dictionaryEntry, "")),
          "copy",
        );
      }
      addAction(
        actionsArea,
        "工作台",
        () => {
          removePopup();
          showTranslateWorkbench({ tab: "history" });
        },
        "history",
      );
      setCache(itemID, pageNumber, selectedText, action, {
        level: contextResult.level,
        dictResult: dictionaryEntry,
        llmResult: localMessage,
        timestamp: Date.now(),
        dictionaryOnly: true,
      });
      await saveReadingHistory(localMessage, true);
      return;
    }

    // Stage 2: LLM contextual analysis (streaming)
    const cursor = appendStreamingCursor(contentArea);

    // For sentence/paragraph level: detect --- separator to split into two areas
    let inAnalysis = false;
    let separatorBuffer = "";
    let analysisCursor: HTMLElement | null = null;

    // ── 8. Stream translation ──────────────────────────────────────────────
    let fullText = "";

    const messages = buildMessages();
    await streamTranslation(messages, {
      onChunk(text: string) {
        fullText += text;

        // For word level, stream everything to contentArea
        if (contextResult.level === ContextLevel.Word) {
          appendChunk(contentArea, cursor, text);
          return;
        }

        // For sentence/paragraph: detect --- separator
        if (!inAnalysis) {
          separatorBuffer += text;
          const sepIdx = separatorBuffer.indexOf("---");
          if (sepIdx >= 0) {
            // Output everything before --- to contentArea
            const before = separatorBuffer
              .substring(0, sepIdx)
              .replace(/\n+$/, "");
            if (before) {
              // Clear and rewrite contentArea with text before separator
              removeCursor(cursor);
              contentArea.textContent = before;
            } else {
              removeCursor(cursor);
            }

            // Switch to analysis area
            inAnalysis = true;
            analysisArea.style.display = "block";
            analysisCursor = appendStreamingCursor(analysisArea);

            // Output everything after --- to analysisArea
            const after = separatorBuffer
              .substring(sepIdx + 3)
              .replace(/^\n+/, "");
            if (after && analysisCursor) {
              appendChunk(analysisArea, analysisCursor, after);
            }
            separatorBuffer = "";
          } else if (
            separatorBuffer.length > 200 ||
            !separatorBuffer.includes("-")
          ) {
            // No separator likely coming, flush buffer to contentArea
            appendChunk(contentArea, cursor, separatorBuffer);
            separatorBuffer = "";
          }
          // Otherwise keep buffering (might be mid-separator like "text-" or "text--")
        } else {
          // Already past separator, stream to analysisArea
          if (analysisCursor) {
            appendChunk(analysisArea, analysisCursor, text);
          }
        }
      },

      async onDone(result: string) {
        fullText = result || fullText;
        // Flush any remaining buffer
        if (separatorBuffer && !inAnalysis) {
          contentArea.textContent =
            (contentArea.textContent || "") + separatorBuffer;
        }
        try {
          removeCursor(cursor);
        } catch {
          /* already removed */
        }
        if (analysisCursor)
          try {
            removeCursor(analysisCursor);
          } catch {
            /* ok */
          }

        // Copy button
        addAction(
          actionsArea,
          "复制",
          () =>
            copyText(formatLookupText(selectedText, dictionaryEntry, fullText)),
          "copy",
        );

        // Add to glossary button (only for actual single-word lookups)
        if (dictionaryLookup) {
          addAction(
            actionsArea,
            "加入术语表",
            async () => {
              try {
                const glossaryData = await loadGlossary(profileDir, libraryId);
                const updated = addGlossaryEntry(glossaryData, {
                  term: contextResult.selected,
                  translation: dictionaryEntry?.translation || fullText.trim(),
                });
                await saveGlossary(profileDir, libraryId, updated);
              } catch (err) {
                ztoolkit.log("Failed to add glossary entry", err);
              }
            },
            "glossary",
          );
        }

        // Retry button
        addAction(
          actionsArea,
          dictionaryLookup ? "重新查询" : "重新翻译",
          () => {
            removePopup();
            setCache(itemID!, pageNumber, selectedText, action, {
              level: contextResult.level,
              dictResult: dictionaryEntry,
              llmResult: fullText,
              timestamp: 0,
              dictionaryOnly: false,
            });
            void handleTranslation(
              reader,
              clientX,
              clientY,
              selectedText,
              popupDoc,
              action,
            );
          },
          "refresh",
        );

        // History button — open the unified workbench
        addAction(
          actionsArea,
          "工作台",
          () => {
            removePopup();
            showTranslateWorkbench({ tab: "history" });
          },
          "history",
        );

        // Save to cache
        setCache(itemID!, pageNumber, selectedText, action, {
          level: contextResult.level,
          dictResult: dictionaryEntry,
          llmResult: fullText,
          timestamp: Date.now(),
          dictionaryOnly: false,
        });

        // Save to history
        await saveReadingHistory(fullText, false);
      },

      onError(error: Error) {
        removeCursor(cursor);
        const msg = error?.message || String(error) || "Unknown error";
        contentArea.textContent = `${dictionaryLookup ? "查词" : "翻译"}出错: ${msg}`;
        contentArea.style.color = "#f38ba8";
        if (dictionaryEntry) void saveReadingHistory("", false);

        // Retry button on error
        addAction(
          actionsArea,
          dictionaryLookup ? "重新查询" : "重新翻译",
          () => {
            removePopup();
            void handleTranslation(
              reader,
              clientX,
              clientY,
              selectedText,
              popupDoc,
              action,
            );
          },
          "refresh",
        );
      },
    });
  } catch (err: any) {
    const msg = err?.message || String(err) || "Unknown error";
    Zotero.log(`[ContextTranslate] Error: ${msg}`, "error");
    // Show error in a popup so user knows something went wrong
    removePopup();
    const errPopup = createPopup(ContextLevel.Word, popupDoc, action);
    positionPopup(errPopup.container, clientX, clientY);
    setupDismissListener(popupDoc);
    errPopup.contentArea.textContent = `错误: ${msg}`;
    errPopup.contentArea.style.color = "#f38ba8";
    addAction(errPopup.actionsArea, "关闭", () => removePopup(), "close");
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
