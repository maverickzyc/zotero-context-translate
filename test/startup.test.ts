import { assert } from "chai";
import { config } from "../package.json";
import {
  closeTranslateWorkbench,
  openTranslateWorkbench,
} from "../src/modules/ui/workbench";
import {
  createZoteroAbortController,
  decodeUTF8,
} from "../src/modules/paper-translate/runtime";
import {
  loadTranslationPreferences,
  saveTranslationPreferences,
} from "../src/modules/ui/preferences";
import {
  addHistoryRecord,
  deleteHistoryRecord,
} from "../src/modules/ui/history";
import {
  createPopup,
  positionPopup,
  removePopup,
} from "../src/modules/ui/popup";
import { ContextLevel } from "../src/types";
import { onTextSelectionPopup, onViewContextMenu } from "../src/hooks";

const prefsPrefix = "extensions.zotero.contextTranslate";

/**
 * The scaffold test reporter sends failures over the wire as JSON, and
 * `Error.prototype.message` is not enumerable, so a bare `throw new Error(...)`
 * reaches CI as `undefined`. Reporting through chai keeps the message (chai's
 * AssertionError owns an enumerable `message`), and folding the original error
 * into that message is the only way runtime failures stay debuggable in CI.
 */
function describeError(error: unknown): string {
  if (error && typeof error === "object") {
    const { name, message, stack } = error as {
      name?: string;
      message?: string;
      stack?: string;
    };
    return `${name ?? "Error"}: ${message ?? String(error)}${
      stack ? `\n${stack}` : ""
    }`;
  }
  return String(error);
}

function withReportedError<T>(label: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    assert.fail(`${label} threw ${describeError(error)}`);
    throw error;
  }
}

describe("startup", function () {
  it("constructs an AbortController from the Zotero DOM window", function () {
    const controller = withReportedError("createZoteroAbortController()", () =>
      createZoteroAbortController(),
    );
    assert.isOk(
      controller.signal,
      "Zotero DOM AbortController did not expose a signal",
    );
  });

  it("calls abort on the Zotero DOM AbortController", function () {
    const controller = withReportedError("createZoteroAbortController()", () =>
      createZoteroAbortController(),
    );
    withReportedError("AbortController.abort()", () => controller.abort());
    assert.isTrue(
      controller.signal.aborted,
      "Zotero DOM AbortController did not mark its signal as aborted",
    );
  });

  it("decodes UTF-8 through the Zotero DOM TextDecoder", function () {
    const decoded = withReportedError("decodeUTF8()", () =>
      String(decodeUTF8(new Uint8Array([0xe4, 0xb8, 0xad, 0xe6, 0x96, 0x87]))),
    );
    assert.strictEqual(
      decoded,
      "中文",
      "Zotero DOM TextDecoder returned unexpected text",
    );
  });

  it("should have plugin instance defined", function () {
    assert.isNotEmpty(Zotero[config.addonInstance]);
    assert.containsAllKeys(
      (Zotero[config.addonInstance] as any).api.paperJobs,
      ["list", "get", "resume", "pause", "cancel", "rerender", "repair"],
    );
  });

  it("renders script-free CSS language controls in every paper template", async function () {
    for (const template of ["classic", "minimal", "magazine"]) {
      const html = await Zotero.File.getResourceAsync(
        `chrome://context-translate/content/paper-templates/${template}.html`,
      );
      assert.notInclude(html, "<script");
      assert.notInclude(html, "data-mode=");
      assert.include(html, 'id="mode-en"');
      assert.include(html, 'id="mode-zh"');
      assert.include(html, 'id="mode-both"');
      assert.include(html, 'label class="toolbar-label" for="mode-en"');
      assert.include(html, 'class="reader-layout"');
      assert.include(html, "#mode-en:checked ~ .reader-layout main .zh");
      assert.match(html, /\.toolbar\s*\{[\s\S]*?position:\s*sticky/);
      assert.match(html, /@media \(max-width:[\s\S]*?position:\s*static/);
      assert.include(
        html,
        "#mode-zh:checked ~ .reader-layout main .en:not(.en-always)",
      );
    }
  });

  it("loads a non-empty Zotero 9 menu label from Fluent", async function () {
    const win = Zotero.getMainWindow();
    const document = win.document as Document & {
      l10n: {
        formatMessages(keys: Array<{ id: string }>): Promise<
          Array<{
            attributes?: Array<{ name: string; value: string }>;
          }>
        >;
      };
    };
    const keys = [
      { id: "context-translate-paper-menu" },
      { id: "context-translate-paper-jobs-menu" },
    ];
    let labels: string[] = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      const messages = await document.l10n.formatMessages(keys);
      labels = messages.map((message) =>
        String(
          message?.attributes?.find(
            (attribute) => String(attribute.name) === "label",
          )?.value || "",
        ),
      );
      if (labels.length === keys.length && labels.every(Boolean)) break;
      await new Promise((resolve) => win.setTimeout(resolve, 50));
    }
    for (const label of labels) {
      assert.isNotEmpty(label);
    }
    assert.lengthOf(labels, keys.length);
  });

  it("adds a Zotero 9 library-toolbar button that opens the workbench", async function () {
    const win = Zotero.getMainWindow();
    const button = win.document.getElementById(
      "context-translate-workbench-button",
    );
    assert.exists(button);
    assert.equal(button?.parentElement?.id, "zotero-items-toolbar");
    assert.match(
      (button as HTMLElement).style.listStyleImage,
      /content\/icons\/workbench\.svg/,
    );
    assert.match(
      button?.getAttribute("image") || "",
      /content\/icons\/workbench\.svg/,
    );
    assert.isAbove(button?.getBoundingClientRect().width || 0, 0);
    const computedButtonStyle = win.getComputedStyle(button!);
    assert.equal(computedButtonStyle.fill, computedButtonStyle.color);
    if (win.matchMedia("(prefers-color-scheme: dark)").matches) {
      assert.notEqual(computedButtonStyle.fill, "rgb(0, 0, 0)");
    }

    const toolbar = button?.parentElement;
    const spacer = toolbar?.querySelector("spacer[flex='1']");
    assert.equal(button?.nextElementSibling, spacer);
    const lateButton = (win.document as any).createXULElement(
      "toolbarbutton",
    ) as HTMLElement;
    lateButton.id = "context-translate-test-late-toolbar-button";
    toolbar?.insertBefore(lateButton, spacer || null);
    await new Promise((resolve) => win.setTimeout(resolve, 30));
    assert.equal(button?.previousElementSibling, lateButton);
    assert.equal(button?.nextElementSibling, spacer);
    lateButton.remove();

    button?.dispatchEvent(new win.Event("command", { bubbles: true }));
    await new Promise((resolve) => win.setTimeout(resolve, 80));
    assert.isNotNull(
      win.document.getElementById("context-translate-workbench"),
    );
    closeTranslateWorkbench(win);
  });

  it("drags the translation popup by its header in Zotero 9", function () {
    const win = Zotero.getMainWindow();
    const { container } = createPopup(
      ContextLevel.Word,
      win.document,
      "lookup",
    );
    positionPopup(container, 100, 100);
    const header = container.firstElementChild as HTMLElement;
    const pointerId = 71;

    try {
      header.dispatchEvent(
        new win.PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerId,
          clientX: 120,
          clientY: 115,
        }),
      );
      win.document.dispatchEvent(
        new win.PointerEvent("pointermove", {
          bubbles: true,
          buttons: 1,
          pointerId,
          clientX: 180,
          clientY: 155,
        }),
      );
      win.document.dispatchEvent(
        new win.PointerEvent("pointerup", {
          bubbles: true,
          button: 0,
          pointerId,
          clientX: 180,
          clientY: 155,
        }),
      );

      assert.equal(container.style.left, "160px");
      assert.equal(container.style.top, "140px");
      assert.equal(header.style.cursor, "grab");
    } finally {
      removePopup();
    }
  });

  it("opens and closes the unified workbench in Zotero 9", async function () {
    await openTranslateWorkbench({ tab: "jobs" });
    assert.isNotNull(
      Zotero.getMainWindow().document.getElementById(
        "context-translate-workbench",
      ),
    );
    closeTranslateWorkbench();
    assert.isNull(
      Zotero.getMainWindow().document.getElementById(
        "context-translate-workbench",
      ),
    );
  });

  it("renders persisted dictionary details in workbench history", async function () {
    // @ts-expect-error Zotero.Profile.dir is available at runtime
    const profileDirectory: string = Zotero.Profile.dir;
    const libraryID = Zotero.Libraries.userLibraryID;
    const selected = `contexttest${Date.now()}`;
    const record = await addHistoryRecord(profileDirectory, libraryID, {
      selected,
      context: `A sentence containing ${selected}.`,
      level: 1,
      result: "语境解释测试",
      itemId: "0",
      page: 1,
      operation: "lookup",
      dictionary: {
        phonetic: "test-fəˈnetɪk",
        pos: "n.",
        translation: "词典释义测试",
      },
      dictionaryOnly: false,
    });

    try {
      await openTranslateWorkbench({ tab: "history" });
      const workbench = Zotero.getMainWindow().document.getElementById(
        "context-translate-workbench",
      );
      assert.include(workbench?.textContent || "", selected);
      assert.include(workbench?.textContent || "", "test-fəˈnetɪk");
      assert.include(workbench?.textContent || "", "词典释义测试");
      assert.include(workbench?.textContent || "", "语境解释测试");
    } finally {
      closeTranslateWorkbench();
      await deleteHistoryRecord(profileDirectory, libraryID, record.id);
    }
  });

  it("loads and saves Zotero 9 translation preferences explicitly", function () {
    const win = Zotero.getMainWindow();
    const doc = win.document;
    const host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    const targetLanguage = createSelect(doc, ["zh-CN", "en", "ja"]);
    const triggerMode = createSelect(doc, ["auto", "contextmenu"]);
    const wordLookupMode = createSelect(doc, [
      "dictionary-context",
      "dictionary-only",
    ]);
    targetLanguage.id = "context-translate-targetLanguage";
    triggerMode.id = "context-translate-triggerMode";
    wordLookupMode.id = "context-translate-wordLookupMode";
    host.append(targetLanguage, triggerMode, wordLookupMode);
    doc.documentElement.appendChild(host);

    const targetPref = `${prefsPrefix}.translate.targetLanguage`;
    const triggerPref = `${prefsPrefix}.translate.triggerMode`;
    const wordLookupPref = `${prefsPrefix}.translate.wordLookupMode`;
    const previousTarget = Zotero.Prefs.get(targetPref, true) as string;
    const previousTrigger = Zotero.Prefs.get(triggerPref, true) as string;
    const previousWordLookup = Zotero.Prefs.get(wordLookupPref, true) as string;

    try {
      Zotero.Prefs.set(targetPref, "en", true);
      Zotero.Prefs.set(triggerPref, "contextmenu", true);
      Zotero.Prefs.set(wordLookupPref, "dictionary-only", true);
      loadTranslationPreferences(win);
      assert.equal(targetLanguage.value, "en");
      assert.equal(triggerMode.value, "contextmenu");
      assert.equal(wordLookupMode.value, "dictionary-only");

      targetLanguage.value = "ja";
      triggerMode.value = "auto";
      wordLookupMode.value = "dictionary-context";
      saveTranslationPreferences(win);
      assert.equal(Zotero.Prefs.get(targetPref, true), "ja");
      assert.equal(Zotero.Prefs.get(triggerPref, true), "auto");
      assert.equal(
        Zotero.Prefs.get(wordLookupPref, true),
        "dictionary-context",
      );
    } finally {
      Zotero.Prefs.set(targetPref, previousTarget, true);
      Zotero.Prefs.set(triggerPref, previousTrigger, true);
      Zotero.Prefs.set(wordLookupPref, previousWordLookup, true);
      host.remove();
    }
  });

  it("adds selection and view-menu translation controls in manual mode", async function () {
    const win = Zotero.getMainWindow();
    const doc = win.document;
    const triggerPref = `${prefsPrefix}.translate.triggerMode`;
    const previousTrigger = Zotero.Prefs.get(triggerPref, true) as string;
    const reader = {} as _ZoteroTypes.ReaderInstance;
    const appendedNodes: Node[] = [];

    try {
      Zotero.Prefs.set(triggerPref, "contextmenu", true);
      onTextSelectionPopup({
        reader,
        doc,
        params: { annotation: { text: "teacher agency" } },
        append: (...nodes: Array<Node | string>) => {
          appendedNodes.push(
            ...nodes.filter((node): node is Node => typeof node !== "string"),
          );
        },
        type: "renderTextSelectionPopup",
      } as any);

      const actionButtons = appendedNodes.filter(
        (node) => node instanceof win.HTMLButtonElement,
      ) as HTMLButtonElement[];
      assert.deepEqual(
        actionButtons.map((button) => button.textContent),
        ["查词", "翻译"],
      );
      assert.deepEqual(
        actionButtons.map((button) =>
          button.getAttribute("data-context-translate-action"),
        ),
        ["lookup", "translate"],
      );
      assert.isTrue(
        actionButtons.every((button) => Boolean(button.querySelector("svg"))),
      );

      await new Promise((resolve) => win.setTimeout(resolve, 80));
      const menuItems: Array<{ label: string }> = [];
      onViewContextMenu({
        reader,
        doc,
        params: { x: 0, y: 0 },
        append: (item: { label: string }) => menuItems.push(item),
        type: "createViewContextMenu",
      } as any);
      assert.deepEqual(
        menuItems.map((item) => item.label),
        ["上下文查词", "上下文翻译"],
      );
    } finally {
      Zotero.Prefs.set(triggerPref, previousTrigger, true);
    }
  });
});

function createSelect(doc: Document, values: string[]): HTMLSelectElement {
  const select = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "select",
  ) as HTMLSelectElement;
  for (const value of values) {
    const option = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "option",
    ) as HTMLOptionElement;
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  return select;
}
