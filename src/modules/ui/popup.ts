import { ContextLevel } from "../../types";

const POPUP_ID = "ctx-translate-popup";

const LEVEL_CONFIG: Record<ContextLevel, { color: string; label: string }> = {
  [ContextLevel.Word]: { color: "#818cf8", label: "词汇" },
  [ContextLevel.Sentence]: { color: "#4ade80", label: "句子" },
  [ContextLevel.Paragraph]: { color: "#fb923c", label: "段落" },
};

let pinned = false;

export function isPinned(): boolean {
  return pinned;
}

export function removePopup(): void {
  const mainDoc = Zotero.getMainWindow()?.document;
  if (!mainDoc) return;
  const existing = mainDoc.getElementById(POPUP_ID);
  if (existing) existing.remove();
  pinned = false;
}

export function dismissIfNotPinned(): void {
  if (!pinned) removePopup();
}

export function createPopup(
  level: ContextLevel,
): {
  container: HTMLElement;
  dictArea: HTMLElement;
  contentArea: HTMLElement;
  actionsArea: HTMLElement;
} {
  removePopup();

  const mainWin = Zotero.getMainWindow();
  const mainDoc = mainWin.document;
  const cfg = LEVEL_CONFIG[level];

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
    flexShrink: "0",
    gap: "6px",
  });

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
  const pinBtn = el(mainDoc, "span");
  Object.assign(pinBtn.style, {
    cursor: "pointer",
    fontSize: "14px",
    color: "#6c7086",
    padding: "0 2px",
    lineHeight: "1",
    title: "固定弹窗",
  });
  pinBtn.textContent = "📌";
  pinBtn.style.opacity = "0.4";
  pinBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pinned = !pinned;
    pinBtn.style.opacity = pinned ? "1" : "0.4";
    container.style.borderColor = pinned ? "#818cf8" : "#313244";
  });

  // Close button
  const closeBtn = el(mainDoc, "span");
  Object.assign(closeBtn.style, {
    cursor: "pointer", fontSize: "16px", color: "#6c7086", padding: "0 2px", lineHeight: "1",
  });
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("mouseenter", () => { closeBtn.style.color = "#f38ba8"; });
  closeBtn.addEventListener("mouseleave", () => { closeBtn.style.color = "#6c7086"; });
  closeBtn.addEventListener("click", () => { pinned = false; removePopup(); });

  header.append(badge, title, pinBtn, closeBtn);

  // ── Dict area (instant dictionary result) ───────────────────────────────
  const dictArea = el(mainDoc, "div");
  Object.assign(dictArea.style, {
    padding: "10px 14px",
    borderBottom: "1px solid #313244",
    display: "none",
    flexShrink: "0",
  });

  // ── Content area (LLM streaming) ────────────────────────────────────────
  const contentArea = el(mainDoc, "div");
  Object.assign(contentArea.style, {
    padding: "12px 14px",
    maxHeight: "260px",
    overflowY: "auto",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
    flexGrow: "1",
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

  container.append(header, dictArea, contentArea, actionsArea);
  attachDrag(mainDoc, header, container);
  mainDoc.documentElement!.appendChild(container);

  return { container, dictArea, contentArea, actionsArea };
}

export function positionPopup(container: HTMLElement, screenX: number, screenY: number): void {
  const mainWin = Zotero.getMainWindow();
  const left = screenX - mainWin.screenX;
  const top = screenY - mainWin.screenY;
  const vw = mainWin.innerWidth;
  const vh = mainWin.innerHeight;
  container.style.left = `${Math.max(10, Math.min(left, vw - 450))}px`;
  container.style.top = `${Math.max(10, Math.min(top, vh - 200))}px`;
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
  Object.assign(wordEl.style, { fontSize: "16px", fontWeight: "700", color: "#cdd6f4" });
  wordEl.textContent = word;

  if (phonetic) {
    const phoneticEl = el(doc, "span");
    Object.assign(phoneticEl.style, { fontSize: "13px", color: "#6c7086", marginLeft: "8px", fontWeight: "400" });
    phoneticEl.textContent = `/${phonetic}/`;
    wordEl.appendChild(phoneticEl);
  }

  const transEl = el(doc, "div");
  Object.assign(transEl.style, { fontSize: "13px", color: "#a6adc8", marginTop: "4px" });
  if (pos) {
    const posSpan = el(doc, "span");
    Object.assign(posSpan.style, { color: "#818cf8", marginRight: "6px", fontSize: "12px" });
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
    display: "inline-block", width: "2px", height: "1em",
    background: "#818cf8", verticalAlign: "text-bottom",
    marginLeft: "1px", animation: "ctx-blink 1s step-start infinite",
  });
  contentArea.appendChild(cursor);
  return cursor;
}

export function removeCursor(cursor: HTMLElement): void { cursor.remove(); }

export function appendChunk(contentArea: HTMLElement, cursor: HTMLElement, text: string): void {
  contentArea.insertBefore(contentArea.ownerDocument!.createTextNode(text), cursor);
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export function addAction(actionsArea: HTMLElement, label: string, onClick: () => void): HTMLElement {
  const btn = el(actionsArea.ownerDocument!, "button");
  btn.textContent = label;
  Object.assign(btn.style, {
    padding: "4px 12px", borderRadius: "6px", border: "1px solid #45475a",
    background: "#313244", color: "#cdd6f4", fontSize: "12px", cursor: "pointer",
  });
  btn.addEventListener("mouseenter", () => { btn.style.background = "#45475a"; });
  btn.addEventListener("mouseleave", () => { btn.style.background = "#313244"; });
  btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  actionsArea.appendChild(btn);
  return btn;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function el(doc: Document, tag: string): HTMLElement {
  return doc.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLElement;
}

function attachDrag(doc: Document, handle: HTMLElement, container: HTMLElement): void {
  let startX = 0, startY = 0, origLeft = 0, origTop = 0;

  function onMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement)?.style?.cursor === "pointer") return;
    startX = e.screenX;
    startY = e.screenY;
    origLeft = parseFloat(container.style.left) || 0;
    origTop = parseFloat(container.style.top) || 0;
    handle.style.cursor = "grabbing";
    e.preventDefault();
    doc.addEventListener("mousemove", onMouseMove, true);
    doc.addEventListener("mouseup", onMouseUp, true);
  }

  function onMouseMove(e: MouseEvent) {
    container.style.left = `${origLeft + (e.screenX - startX)}px`;
    container.style.top = `${origTop + (e.screenY - startY)}px`;
  }

  function onMouseUp() {
    handle.style.cursor = "grab";
    doc.removeEventListener("mousemove", onMouseMove, true);
    doc.removeEventListener("mouseup", onMouseUp, true);
  }

  handle.addEventListener("mousedown", onMouseDown);
}
