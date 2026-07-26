import { ContextLevel } from "../../types";
import { createUIIcon, UIIconName } from "./icons";

const POPUP_ID = "ctx-translate-popup";

const LEVEL_CONFIG: Record<ContextLevel, { color: string; label: string }> = {
  [ContextLevel.Word]: { color: "#818cf8", label: "词汇" },
  [ContextLevel.Sentence]: { color: "#4ade80", label: "句子" },
  [ContextLevel.Paragraph]: { color: "#fb923c", label: "段落" },
};

let pinned = false;
let popupDocument: Document | null = null;

export function isPinned(): boolean {
  return pinned;
}

export function removePopup(): void {
  const mainDoc = Zotero.getMainWindow()?.document || null;
  const documents = [popupDocument, mainDoc].filter(
    (doc, index, all): doc is Document =>
      Boolean(doc) && all.indexOf(doc) === index,
  );
  for (const doc of documents) {
    doc.getElementById(POPUP_ID)?.remove();
  }
  popupDocument = null;
  pinned = false;
}

export function dismissIfNotPinned(): void {
  if (!pinned) removePopup();
}

export function createPopup(
  level: ContextLevel,
  ownerDocument?: Document,
  action?: "lookup" | "translate",
): {
  container: HTMLElement;
  dictArea: HTMLElement;
  contentArea: HTMLElement;
  analysisArea: HTMLElement;
  actionsArea: HTMLElement;
} {
  removePopup();

  const mainDoc = ownerDocument || Zotero.getMainWindow().document;
  popupDocument = mainDoc;
  const cfg = {
    ...LEVEL_CONFIG[level],
    label:
      action === "lookup"
        ? "查词"
        : action === "translate"
          ? "翻译"
          : LEVEL_CONFIG[level].label,
  };

  if (!mainDoc.getElementById("ctx-blink-style")) {
    const style = el(mainDoc, "style");
    style.id = "ctx-blink-style";
    style.textContent = `@keyframes ctx-blink { 0%,100%{opacity:1} 50%{opacity:0} }`;
    mainDoc.documentElement!.appendChild(style);
  }

  const container = el(mainDoc, "div");
  container.id = POPUP_ID;
  Object.assign(container.style, {
    position: "fixed",
    zIndex: "99999",
    maxWidth: "420px",
    minWidth: "240px",
    background: "#1e1e2e",
    color: "#cdd6f4",
    borderRadius: "10px",
    border: "1px solid #313244",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "14px",
    lineHeight: "1.6",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    userSelect: "text",
  });

  // ── Header ──────────────────────────────────────────────────────────────
  const header = el(mainDoc, "div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    padding: "8px 12px",
    background: "#181825",
    cursor: "grab",
    touchAction: "none",
    userSelect: "none",
    flexShrink: "0",
    gap: "6px",
  });
  header.title = "拖动弹窗";

  const badge = el(mainDoc, "span");
  Object.assign(badge.style, {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "999px",
    background: cfg.color,
    color: "#1e1e2e",
    fontWeight: "700",
    fontSize: "12px",
  });
  badge.textContent = cfg.label;

  const title = el(mainDoc, "span");
  Object.assign(title.style, { fontSize: "12px", color: "#a6adc8", flex: "1" });
  title.textContent = "Context Translate";

  // Pin button
  const pinBtn = el(mainDoc, "button") as HTMLButtonElement;
  Object.assign(pinBtn.style, {
    cursor: "pointer",
    color: "#6c7086",
    padding: "2px",
    border: "0",
    borderRadius: "4px",
    background: "transparent",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });
  pinBtn.type = "button";
  pinBtn.title = "固定弹窗";
  pinBtn.setAttribute("aria-label", "固定弹窗");
  pinBtn.appendChild(createUIIcon(mainDoc, "pin", 15));
  pinBtn.style.opacity = "0.4";
  pinBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pinned = !pinned;
    pinBtn.style.opacity = pinned ? "1" : "0.4";
    container.style.borderColor = pinned ? "#818cf8" : "#313244";
  });

  // Close button
  const closeBtn = el(mainDoc, "button") as HTMLButtonElement;
  Object.assign(closeBtn.style, {
    cursor: "pointer",
    color: "#6c7086",
    padding: "2px",
    border: "0",
    borderRadius: "4px",
    background: "transparent",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });
  closeBtn.type = "button";
  closeBtn.title = "关闭";
  closeBtn.setAttribute("aria-label", "关闭");
  closeBtn.appendChild(createUIIcon(mainDoc, "close", 15));
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.color = "#f38ba8";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.color = "#6c7086";
  });
  closeBtn.addEventListener("click", () => {
    pinned = false;
    removePopup();
  });

  header.append(badge, title, pinBtn, closeBtn);

  // ── Dict area (instant dictionary result) ───────────────────────────────
  const dictArea = el(mainDoc, "div");
  Object.assign(dictArea.style, {
    padding: "10px 14px",
    borderBottom: "1px solid #313244",
    display: "none",
    flexShrink: "0",
  });

  // ── Translation area (LLM streaming - primary) ──────────────────────────
  const contentArea = el(mainDoc, "div");
  Object.assign(contentArea.style, {
    padding: "12px 14px",
    maxHeight: "200px",
    overflowY: "auto",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
    flexGrow: "1",
  });

  // ── Analysis area (LLM streaming - secondary, after ---) ───────────────
  const analysisArea = el(mainDoc, "div");
  Object.assign(analysisArea.style, {
    padding: "10px 14px",
    borderTop: "1px solid #313244",
    fontSize: "13px",
    color: "#a6adc8",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
    display: "none",
  });

  // ── Actions ─────────────────────────────────────────────────────────────
  const actionsArea = el(mainDoc, "div");
  Object.assign(actionsArea.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    padding: "8px 12px",
    borderTop: "1px solid #313244",
    flexShrink: "0",
  });

  container.append(header, dictArea, contentArea, analysisArea, actionsArea);
  attachDrag(mainDoc, header, container);
  mainDoc.documentElement!.appendChild(container);

  return { container, dictArea, contentArea, analysisArea, actionsArea };
}

export function positionPopup(
  container: HTMLElement,
  clientX: number,
  clientY: number,
): void {
  const ownerWindow = container.ownerDocument?.defaultView;
  const viewportWidth = ownerWindow?.innerWidth || 1024;
  const viewportHeight = ownerWindow?.innerHeight || 768;
  const width = container.offsetWidth || 420;
  const height = container.offsetHeight || 200;
  const left = Math.max(10, Math.min(clientX, viewportWidth - width - 10));
  const top = Math.max(10, Math.min(clientY, viewportHeight - height - 10));
  container.style.left = `${left}px`;
  container.style.top = `${top}px`;
}

// ─── Dictionary display ───────────────────────────────────────────────────────

export function showDictResult(
  dictArea: HTMLElement,
  word: string,
  phonetic: string,
  pos: string,
  translation: string,
): void {
  const doc = dictArea.ownerDocument!;
  dictArea.innerHTML = "";
  dictArea.style.display = "block";

  const wordEl = el(doc, "div");
  Object.assign(wordEl.style, {
    fontSize: "16px",
    fontWeight: "700",
    color: "#cdd6f4",
  });
  wordEl.textContent = word;

  if (phonetic) {
    const phoneticEl = el(doc, "span");
    Object.assign(phoneticEl.style, {
      fontSize: "13px",
      color: "#6c7086",
      marginLeft: "8px",
      fontWeight: "400",
    });
    phoneticEl.textContent = `/${phonetic}/`;
    wordEl.appendChild(phoneticEl);
  }

  const transEl = el(doc, "div");
  Object.assign(transEl.style, {
    fontSize: "13px",
    color: "#a6adc8",
    marginTop: "4px",
  });
  if (pos) {
    const posSpan = el(doc, "span");
    Object.assign(posSpan.style, {
      color: "#818cf8",
      marginRight: "6px",
      fontSize: "12px",
    });
    posSpan.textContent = pos;
    transEl.appendChild(posSpan);
  }
  transEl.appendChild(doc.createTextNode(translation));

  dictArea.append(wordEl, transEl);
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export function appendStreamingCursor(contentArea: HTMLElement): HTMLElement {
  const doc = contentArea.ownerDocument!;
  const cursor = el(doc, "span");
  Object.assign(cursor.style, {
    display: "inline-block",
    width: "2px",
    height: "1em",
    background: "#818cf8",
    verticalAlign: "text-bottom",
    marginLeft: "1px",
    animation: "ctx-blink 1s step-start infinite",
  });
  contentArea.appendChild(cursor);
  return cursor;
}

export function removeCursor(cursor: HTMLElement): void {
  cursor.remove();
}

export function appendChunk(
  contentArea: HTMLElement,
  cursor: HTMLElement,
  text: string,
): void {
  contentArea.insertBefore(
    contentArea.ownerDocument!.createTextNode(text),
    cursor,
  );
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export function addAction(
  actionsArea: HTMLElement,
  label: string,
  onClick: () => void,
  icon?: UIIconName,
): HTMLElement {
  const btn = el(actionsArea.ownerDocument!, "button");
  Object.assign(btn.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "4px 12px",
    borderRadius: "6px",
    border: "1px solid #45475a",
    background: "#313244",
    color: "#cdd6f4",
    fontSize: "12px",
    cursor: "pointer",
  });
  btn.addEventListener("mouseenter", () => {
    btn.style.background = "#45475a";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "#313244";
  });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  if (icon) {
    btn.appendChild(createUIIcon(actionsArea.ownerDocument!, icon, 13));
  }
  btn.appendChild(actionsArea.ownerDocument!.createTextNode(label));
  actionsArea.appendChild(btn);
  return btn;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function el(doc: Document, tag: string): HTMLElement {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as HTMLElement;
}

function attachDrag(
  doc: Document,
  handle: HTMLElement,
  container: HTMLElement,
): void {
  let activePointerId: number | null = null;
  let startX = 0,
    startY = 0,
    origLeft = 0,
    origTop = 0;

  function isInteractiveTarget(target: EventTarget | null): boolean {
    return Boolean(
      (target as Element | null)?.closest?.(
        "button, a, input, textarea, select",
      ),
    );
  }

  function clampToViewport(left: number, top: number): [number, number] {
    const ownerWindow = doc.defaultView;
    const viewportWidth = ownerWindow?.innerWidth || 1024;
    const viewportHeight = ownerWindow?.innerHeight || 768;
    const rect = container.getBoundingClientRect();
    const width = rect.width || container.offsetWidth || 240;
    const height = rect.height || container.offsetHeight || 120;
    const margin = 8;
    return [
      Math.max(margin, Math.min(left, viewportWidth - width - margin)),
      Math.max(margin, Math.min(top, viewportHeight - height - margin)),
    ];
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || isInteractiveTarget(e.target)) return;
    const rect = container.getBoundingClientRect();
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    origLeft = Number.parseFloat(container.style.left);
    origTop = Number.parseFloat(container.style.top);
    if (!Number.isFinite(origLeft)) origLeft = rect.left;
    if (!Number.isFinite(origTop)) origTop = rect.top;
    handle.style.cursor = "grabbing";
    e.preventDefault();
    e.stopPropagation();
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events and some embedded Reader documents cannot capture an
      // inactive pointer. Document-level listeners still provide dragging.
    }
    doc.addEventListener("pointermove", onPointerMove, true);
    doc.addEventListener("pointerup", finishDrag, true);
    doc.addEventListener("pointercancel", finishDrag, true);
  }

  function onPointerMove(e: PointerEvent) {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    const [left, top] = clampToViewport(
      origLeft + (e.clientX - startX),
      origTop + (e.clientY - startY),
    );
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
    e.preventDefault();
  }

  function finishDrag(e: PointerEvent) {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    try {
      if (handle.hasPointerCapture(activePointerId)) {
        handle.releasePointerCapture(activePointerId);
      }
    } catch {
      // The pointer may already have been released by the Reader document.
    }
    activePointerId = null;
    handle.style.cursor = "grab";
    doc.removeEventListener("pointermove", onPointerMove, true);
    doc.removeEventListener("pointerup", finishDrag, true);
    doc.removeEventListener("pointercancel", finishDrag, true);
  }

  handle.addEventListener("pointerdown", onPointerDown);
}
