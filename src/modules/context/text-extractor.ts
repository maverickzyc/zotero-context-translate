import { PageTextData } from "../../types";
import { reconstructParagraphs, TextItemLike } from "./paragraph-detect";
import { getCachedPage, setCachedPage } from "./page-cache";

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

export function getSelectedText(reader: any): string | null {
  try {
    const iframeWindow = getReaderIframeWindow(reader);
    const internalReader = getInternalReader(iframeWindow);
    const selectionRanges = internalReader?._primaryView?._selectionRanges;
    if (!selectionRanges || selectionRanges.length === 0) return null;
    return selectionRanges
      .map((range: any) => range.toString?.() || "")
      .join(" ")
      .trim() || null;
  } catch {
    return null;
  }
}

export function getCurrentPageNumber(reader: any): number | null {
  try {
    const iframeWindow = getReaderIframeWindow(reader);
    const internalReader = getInternalReader(iframeWindow);
    const pageIndex =
      internalReader?._primaryView?._iframeWindow?.PDFViewerApplication
        ?.pdfViewer?.currentPageNumber;
    return typeof pageIndex === "number" ? pageIndex : null;
  } catch {
    return null;
  }
}

async function extractPageTextItems(reader: any, pageNumber: number): Promise<TextItemLike[]> {
  const iframeWindow = getReaderIframeWindow(reader);
  const pdfDocument =
    iframeWindow?._reader?._primaryView?._iframeWindow
      ?.PDFViewerApplication?.pdfDocument;
  if (!pdfDocument) throw new Error("Cannot access PDF document");
  const page = await pdfDocument.getPage(pageNumber);
  const textContent = await page.getTextContent();
  return textContent.items
    .filter((item: any) => item.str && item.str.trim())
    .map((item: any) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      height: item.height,
    }));
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
