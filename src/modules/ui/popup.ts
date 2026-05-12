import { ContextLevel } from "../../types";

const POPUP_ID = "ctx-translate-popup";

const LEVEL_CONFIG: Record<
  ContextLevel,
  { color: string; label: string }
> = {
  [ContextLevel.Word]: { color: "#818cf8", label: "词汇" },
  [ContextLevel.Sentence]: { color: "#4ade80", label: "句子" },
  [ContextLevel.Paragraph]: { color: "#fb923c", label: "段落" },
};

// ─── Popup lifecycle ───────────────────────────────────────────────────────────

/** Remove any existing popup from the document. */
export function removePopup(doc: Document): void {
  doc.getElementById(POPUP_ID)?.remove();
}

/**
 * Create the floating translation popup.
 *
 * @returns `{ container, contentArea, actionsArea }` — callers use these
 *   references to stream content and attach action buttons.
 */
export function createPopup(
  doc: Document,
  level: ContextLevel,
): {
  container: HTMLElement;
  contentArea: HTMLElement;
  actionsArea: HTMLElement;
} {
  removePopup(doc);

  const cfg = LEVEL_CONFIG[level];

  // ── inject blink keyframes once ──────────────────────────────────────────
  if (!doc.getElementById("ctx-blink-style")) {
    const style = doc.createElement("style");
    style.id = "ctx-blink-style";
    style.textContent = `
      @keyframes ctx-blink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0; }
      }
    `;
    (doc.head || doc.documentElement)!.appendChild(style);
  }

  // ── container ────────────────────────────────────────────────────────────
  const container = doc.createElement("div");
  container.id = POPUP_ID;
  Object.assign(container.style, {
    position: "fixed",
    zIndex: "99999",
    maxWidth: "420px",
    minWidth: "220px",
    background: "#1e1e2e",
    color: "#cdd6f4",
    borderRadius: "10px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "14px",
    lineHeight: "1.6",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    userSelect: "text",
  });

  // ── header / drag handle ─────────────────────────────────────────────────
  const header = doc.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    padding: "8px 12px",
    background: "#181825",
    cursor: "grab",
    flexShrink: "0",
  });

  const badge = doc.createElement("span");
  Object.assign(badge.style, {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "999px",
    background: cfg.color,
    color: "#1e1e2e",
    fontWeight: "700",
    fontSize: "12px",
    letterSpacing: "0.03em",
  });
  badge.textContent = cfg.label;

  const title = doc.createElement("span");
  Object.assign(title.style, {
    marginLeft: "8px",
    fontSize: "12px",
    color: "#a6adc8",
    flex: "1",
  });
  title.textContent = "Context Translate";

  header.appendChild(badge);
  header.appendChild(title);

  // ── content area ─────────────────────────────────────────────────────────
  const contentArea = doc.createElement("div");
  Object.assign(contentArea.style, {
    padding: "12px 14px",
    maxHeight: "300px",
    overflowY: "auto",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
    flexGrow: "1",
  });

  // ── actions area ─────────────────────────────────────────────────────────
  const actionsArea = doc.createElement("div");
  Object.assign(actionsArea.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    padding: "8px 12px",
    borderTop: "1px solid #313244",
    flexShrink: "0",
  });

  container.appendChild(header);
  container.appendChild(contentArea);
  container.appendChild(actionsArea);

  // ── drag behaviour ────────────────────────────────────────────────────────
  _attachDrag(doc, header, container);

  return { container, contentArea, actionsArea };
}

// ─── Streaming helpers ─────────────────────────────────────────────────────────

/**
 * Append a blinking cursor element to `contentArea`.
 * Returns the cursor element so it can later be removed or used as an
 * insertion point.
 */
export function appendStreamingCursor(
  doc: Document,
  contentArea: HTMLElement,
): HTMLElement {
  const cursor = doc.createElement("span");
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

/** Remove the streaming cursor once the stream is complete. */
export function removeCursor(cursor: HTMLElement): void {
  cursor.remove();
}

/**
 * Insert a text chunk immediately before the streaming cursor.
 * This produces the "live typing" effect.
 */
export function appendChunk(
  contentArea: HTMLElement,
  cursor: HTMLElement,
  text: string,
): void {
  const textNode = contentArea.ownerDocument!.createTextNode(text);
  contentArea.insertBefore(textNode, cursor);
}

// ─── Action buttons ────────────────────────────────────────────────────────────

/**
 * Add an action button to the actions bar.
 *
 * @param label  Button label text.
 * @param onClick Callback invoked when the button is clicked.
 * @returns The created button element.
 */
export function addAction(
  doc: Document,
  actionsArea: HTMLElement,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = doc.createElement("button");
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

  actionsArea.appendChild(btn);
  return btn;
}

// ─── Positioning ───────────────────────────────────────────────────────────────

/**
 * Position the popup near `(anchorX, anchorY)`, adjusting so it stays
 * fully inside the viewport.
 *
 * @param container The popup root element (must already be in the DOM so
 *   that `getBoundingClientRect` is available).
 * @param anchorX   X coordinate (client pixels) of the selection anchor.
 * @param anchorY   Y coordinate (client pixels) of the selection anchor.
 */
export function positionPopup(
  container: HTMLElement,
  anchorX: number,
  anchorY: number,
): void {
  const OFFSET = 10;
  const doc = container.ownerDocument!;
  const vw = doc.defaultView?.innerWidth ?? 800;
  const vh = doc.defaultView?.innerHeight ?? 600;

  // First pass: place below-right of anchor
  container.style.left = `${anchorX + OFFSET}px`;
  container.style.top = `${anchorY + OFFSET}px`;

  // Measure after placement
  const rect = container.getBoundingClientRect();
  let left = anchorX + OFFSET;
  let top = anchorY + OFFSET;

  // Overflow right → shift left
  if (left + rect.width > vw - OFFSET) {
    left = Math.max(OFFSET, anchorX - rect.width - OFFSET);
  }

  // Overflow bottom → shift above anchor
  if (top + rect.height > vh - OFFSET) {
    top = Math.max(OFFSET, anchorY - rect.height - OFFSET);
  }

  container.style.left = `${left}px`;
  container.style.top = `${top}px`;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function _attachDrag(
  doc: Document,
  handle: HTMLElement,
  container: HTMLElement,
): void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;

  handle.addEventListener("mousedown", (e: MouseEvent) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    origLeft = parseFloat(container.style.left) || 0;
    origTop = parseFloat(container.style.top) || 0;
    handle.style.cursor = "grabbing";
    e.preventDefault();
  });

  doc.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) return;
    container.style.left = `${origLeft + (e.clientX - startX)}px`;
    container.style.top = `${origTop + (e.clientY - startY)}px`;
  });

  doc.addEventListener("mouseup", () => {
    if (dragging) {
      dragging = false;
      handle.style.cursor = "grab";
    }
  });
}
