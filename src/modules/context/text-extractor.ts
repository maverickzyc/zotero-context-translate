import { PageTextData } from "../../types";
import { reconstructParagraphs, TextItemLike } from "./paragraph-detect";
import { getCachedPage, setCachedPage } from "./page-cache";

// Explore the reader object tree to find pdf.js access paths
export function debugReaderStructure(reader: any): void {
  const log = (msg: string) => Zotero.log(`[ContextTranslate] ${msg}`, "warning");

  try {
    const readerKeys = Object.keys(reader).filter(k => k.startsWith("_"));
    log(`reader keys: [${readerKeys.join(", ")}]`);

    // Check _iframeWindow path
    const ifw = reader._iframeWindow;
    if (ifw) {
      log(`_iframeWindow exists, type: ${typeof ifw}`);
      const wrapped = ifw.wrappedJSObject;
      if (wrapped) {
        const wrappedKeys = Object.keys(wrapped).filter(k => k.startsWith("_") || k === "PDFViewerApplication");
        log(`_iframeWindow.wrappedJSObject keys: [${wrappedKeys.join(", ")}]`);

        if (wrapped._reader) {
          const irKeys = Object.keys(wrapped._reader).filter(k => k.startsWith("_"));
          log(`wrappedJSObject._reader keys: [${irKeys.join(", ")}]`);

          const pv = wrapped._reader._primaryView;
          if (pv) {
            const pvKeys = Object.keys(pv).filter(k => k.startsWith("_") || k === "pdfDocument");
            log(`_primaryView keys: [${pvKeys.join(", ")}]`);

            if (pv._iframeWindow) {
              const pvIfw = pv._iframeWindow;
              const pvIfwKeys = Object.keys(pvIfw).filter(k => k.includes("PDF") || k.includes("pdf") || k.includes("viewer"));
              log(`_primaryView._iframeWindow keys (PDF-related): [${pvIfwKeys.join(", ")}]`);
              if (pvIfw.PDFViewerApplication) {
                const pvaKeys = Object.keys(pvIfw.PDFViewerApplication).filter(k => k.includes("pdf") || k.includes("document") || k.includes("page"));
                log(`PDFViewerApplication keys: [${pvaKeys.join(", ")}]`);
              }
            }
          }
        }

        // Also check if PDFViewerApplication is directly on wrappedJSObject
        if (wrapped.PDFViewerApplication) {
          log(`PDFViewerApplication found directly on wrappedJSObject`);
        }
      }
    }

    // Alternative: check _internalReader
    if (reader._internalReader) {
      log(`_internalReader exists`);
      const irKeys = Object.keys(reader._internalReader);
      log(`_internalReader keys: [${irKeys.join(", ")}]`);
    }
  } catch (err: any) {
    log(`debugReaderStructure error: ${err?.message || err}`);
  }
}

function getReaderIframeWindow(reader: any): any {
  try {
    return reader._iframeWindow?.wrappedJSObject;
  } catch {
    return null;
  }
}

function getInternalReader(iframeWindow: any): any {
  try {
    return iframeWindow?._reader;
  } catch {
    return null;
  }
}

function findPDFDocument(reader: any): any {
  // Try multiple known paths to find the pdf.js PDFDocumentProxy
  const paths = [
    () => reader._iframeWindow?.wrappedJSObject?._reader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfDocument,
    () => reader._iframeWindow?.wrappedJSObject?._reader?._primaryView?.pdfDocument,
    () => reader._iframeWindow?.wrappedJSObject?.PDFViewerApplication?.pdfDocument,
    () => reader._iframeWindow?.PDFViewerApplication?.pdfDocument,
    () => reader._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfDocument,
    () => reader._internalReader?._primaryView?.pdfDocument,
  ];

  for (const tryPath of paths) {
    try {
      const doc = tryPath();
      if (doc && typeof doc.getPage === "function") {
        return doc;
      }
    } catch { /* try next */ }
  }
  return null;
}

function findCurrentPageNumber(reader: any): number | null {
  const paths = [
    () => reader._iframeWindow?.wrappedJSObject?._reader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfViewer?.currentPageNumber,
    () => reader._iframeWindow?.wrappedJSObject?._reader?._primaryView?.currentPageIndex,
    () => reader._iframeWindow?.wrappedJSObject?.PDFViewerApplication?.pdfViewer?.currentPageNumber,
    () => reader._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfViewer?.currentPageNumber,
  ];

  for (const tryPath of paths) {
    try {
      const num = tryPath();
      if (typeof num === "number" && num > 0) return num;
    } catch { /* try next */ }
  }
  return null;
}

export function getSelectedText(reader: any): string | null {
  try {
    const iframeWindow = getReaderIframeWindow(reader);
    const internalReader = getInternalReader(iframeWindow);
    const selectionRanges = internalReader?._primaryView?._selectionRanges;
    if (!selectionRanges || selectionRanges.length === 0) return null;
    return selectionRanges
      .map((range: any) => {
        if (typeof range === "string") return range;
        if (typeof range?.toString === "function") {
          const s = range.toString();
          if (s && !s.includes("[object")) return s;
        }
        return "";
      })
      .join(" ")
      .trim() || null;
  } catch {
    return null;
  }
}

export function getCurrentPageNumber(reader: any): number | null {
  return findCurrentPageNumber(reader);
}

async function extractPageTextItems(reader: any, pageNumber: number): Promise<TextItemLike[]> {
  const log = (msg: string) => Zotero.log(`[ContextTranslate] ${msg}`, "warning");

  // Find the pdf.js iframe window where PDFViewerApplication lives
  const primaryView = reader._iframeWindow?.wrappedJSObject?._reader?._primaryView
    || reader._internalReader?._primaryView;
  const iframeWin = primaryView?._iframeWindow;

  if (!iframeWin) {
    throw new Error("Cannot access pdf.js iframe window");
  }

  // Execute extraction INSIDE the iframe context to avoid cross-compartment issues.
  // The iframe has PDFViewerApplication as a global. We eval a self-contained async
  // function that returns JSON, which can safely cross the compartment boundary.
  try {
    const jsonResult = await iframeWin.eval(`
      (async function() {
        var page = await PDFViewerApplication.pdfDocument.getPage(${pageNumber});
        var tc = await page.getTextContent();
        var items = [];
        for (var i = 0; i < tc.items.length; i++) {
          var it = tc.items[i];
          if (it.str && it.str.trim()) {
            items.push({
              s: it.str,
              x: it.transform ? it.transform[4] : 0,
              y: it.transform ? it.transform[5] : 0,
              w: it.width || 0,
              h: it.height || 0
            });
          }
        }
        return JSON.stringify(items);
      })()
    `);

    const parsed = JSON.parse(jsonResult);
    log(`Extracted ${parsed.length} text items from page ${pageNumber}`);

    return parsed.map((item: any) => ({
      str: item.s,
      x: item.x,
      y: item.y,
      width: item.w,
      height: item.h,
    }));
  } catch (evalErr: any) {
    log(`iframe eval failed: ${evalErr?.message || evalErr}`);
    throw new Error(`Text extraction failed: ${evalErr?.message || evalErr}`);
  }
}

export async function getPageText(reader: any, itemId: number, pageNumber: number): Promise<PageTextData> {
  const cached = getCachedPage(itemId, pageNumber);
  if (cached) return cached;
  const textItems = await extractPageTextItems(reader, pageNumber);
  const { paragraphs, rawText } = reconstructParagraphs(textItems);
  const data: PageTextData = { paragraphs, rawText, timestamp: Date.now() };
  setCachedPage(itemId, pageNumber, data);
  return data;
}

export async function getPageTextWithNeighbors(
  reader: any, itemId: number, pageNumber: number
): Promise<PageTextData> {
  const current = await getPageText(reader, itemId, pageNumber);
  const paragraphs = [...current.paragraphs];
  let modified = false;
  if (paragraphs.length > 0) {
    const lastPara = paragraphs[paragraphs.length - 1];
    if (!/[.?!]$/.test(lastPara.trim())) {
      try {
        const next = await getPageText(reader, itemId, pageNumber + 1);
        if (next.paragraphs.length > 0) {
          paragraphs[paragraphs.length - 1] += " " + next.paragraphs[0];
          modified = true;
        }
      } catch { /* next page doesn't exist */ }
    }
    const firstPara = paragraphs[0];
    if (firstPara && !/^[A-Z]/.test(firstPara.trim()) && pageNumber > 1) {
      try {
        const prev = await getPageText(reader, itemId, pageNumber - 1);
        if (prev.paragraphs.length > 0) {
          paragraphs[0] = prev.paragraphs[prev.paragraphs.length - 1] + " " + firstPara;
          modified = true;
        }
      } catch { /* prev page doesn't exist */ }
    }
  }
  if (modified) {
    return { paragraphs, rawText: paragraphs.join("\n"), timestamp: Date.now() };
  }
  return current;
}
