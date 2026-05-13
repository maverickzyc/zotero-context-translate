import { ContextLevel } from "../../types";

const PANEL_ID = "ctx-translate-panel";

const LEVEL_CONFIG: Record<ContextLevel, { color: string; label: string }> = {
  [ContextLevel.Word]: { color: "#818cf8", label: "词汇" },
  [ContextLevel.Sentence]: { color: "#4ade80", label: "句子" },
  [ContextLevel.Paragraph]: { color: "#fb923c", label: "段落" },
};

export function removePopup(doc?: Document): void {
  // Remove from main window
  const mainWin = Zotero.getMainWindow();
  const panel = mainWin?.document.getElementById(PANEL_ID);
  if (panel) {
    try { (panel as any).hidePopup?.(); } catch { /* ignore */ }
    panel.remove();
  }
  // Also clean up from reader doc if passed
  if (doc) {
    doc.getElementById(PANEL_ID)?.remove();
  }
}

export function createPopup(
  level: ContextLevel,
): {
  panel: XUL.Element;
  contentArea: HTMLElement;
  actionsArea: HTMLElement;
} {
  const mainWin = Zotero.getMainWindow();
  const mainDoc = mainWin.document;

  removePopup();

  const cfg = LEVEL_CONFIG[level];

  // Create XUL panel in the main Zotero window
  const panel = mainDoc.createXULElement("panel") as any;
  panel.id = PANEL_ID;
  panel.setAttribute("noautohide", "true");
  panel.setAttribute("level", "floating");
  panel.setAttribute("backdrag", "true");
  Object.assign(panel.style, {
    maxWidth: "440px",
    minWidth: "240px",
    background: "#1e1e2e",
    color: "#cdd6f4",
    borderRadius: "10px",
    border: "1px solid #313244",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "14px",
    lineHeight: "1.6",
    overflow: "hidden",
    padding: "0",
  });

  // Header
  const header = mainDoc.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement;
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    padding: "8px 12px",
    background: "#181825",
    cursor: "grab",
  });

  const badge = mainDoc.createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLElement;
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

  const title = mainDoc.createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLElement;
  Object.assign(title.style, {
    marginLeft: "8px",
    fontSize: "12px",
    color: "#a6adc8",
    flex: "1",
  });
  title.textContent = "Context Translate";

  const closeBtn = mainDoc.createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLElement;
  Object.assign(closeBtn.style, {
    cursor: "pointer",
    fontSize: "16px",
    color: "#6c7086",
    padding: "0 4px",
    lineHeight: "1",
  });
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("mouseenter", () => { closeBtn.style.color = "#f38ba8"; });
  closeBtn.addEventListener("mouseleave", () => { closeBtn.style.color = "#6c7086"; });
  closeBtn.addEventListener("click", () => removePopup());

  header.appendChild(badge);
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Content area
  const contentArea = mainDoc.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement;
  Object.assign(contentArea.style, {
    padding: "12px 14px",
    maxHeight: "300px",
    overflowY: "auto",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
  });

  // Actions area
  const actionsArea = mainDoc.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement;
  Object.assign(actionsArea.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    padding: "8px 12px",
    borderTop: "1px solid #313244",
  });

  panel.appendChild(header);
  panel.appendChild(contentArea);
  panel.appendChild(actionsArea);

  // Add to main document's popupset (or body)
  const popupset = mainDoc.getElementById("mainPopupSet")
    || mainDoc.querySelector("popupset")
    || mainDoc.documentElement;
  popupset!.appendChild(panel);

  return { panel, contentArea, actionsArea };
}

export function openPopupAtScreen(
  panel: XUL.Element,
  screenX: number,
  screenY: number,
): void {
  (panel as any).openPopupAtScreen(screenX, screenY, false);
}

// ─── Streaming helpers ────────────────────────────────────────────────────────

export function appendStreamingCursor(contentArea: HTMLElement): HTMLElement {
  const doc = contentArea.ownerDocument!;

  if (!doc.getElementById("ctx-blink-style")) {
    const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style") as HTMLElement;
    style.id = "ctx-blink-style";
    style.textContent = `@keyframes ctx-blink { 0%,100%{opacity:1} 50%{opacity:0} }`;
    (doc.head || doc.documentElement)!.appendChild(style);
  }

  const cursor = doc.createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLElement;
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

export function appendChunk(contentArea: HTMLElement, cursor: HTMLElement, text: string): void {
  const textNode = contentArea.ownerDocument!.createTextNode(text);
  contentArea.insertBefore(textNode, cursor);
}

// ─── Action buttons ───────────────────────────────────────────────────────────

export function addAction(
  actionsArea: HTMLElement,
  label: string,
  onClick: () => void,
): HTMLElement {
  const doc = actionsArea.ownerDocument!;
  const btn = doc.createElementNS("http://www.w3.org/1999/xhtml", "button") as HTMLElement;
  btn.textContent = label;
  Object.assign(btn.style, {
    padding: "4px 12px",
    borderRadius: "6px",
    border: "1px solid #45475a",
    background: "#313244",
    color: "#cdd6f4",
    fontSize: "12px",
    cursor: "pointer",
    transition: "background 0.15s",
  });
  btn.addEventListener("mouseenter", () => { btn.style.background = "#45475a"; });
  btn.addEventListener("mouseleave", () => { btn.style.background = "#313244"; });
  btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  actionsArea.appendChild(btn);
  return btn;
}
