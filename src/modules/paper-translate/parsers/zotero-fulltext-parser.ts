import {
  DocumentParser,
  PaperSource,
  ParsedPaper,
  ParserProgress,
} from "../types";
import { getItem } from "../../../utils/items";
import { createAbortError } from "../runtime";

export class ZoteroFulltextDocumentParser implements DocumentParser {
  async parse(
    source: PaperSource,
    _jobDirectory: string,
    onProgress: (progress: ParserProgress) => void,
    signal: AbortSignal,
  ): Promise<ParsedPaper> {
    if (signal.aborted) throw createAbortError();
    const attachment = getItem(source.attachmentID);
    if (!attachment) throw new Error("Source PDF attachment no longer exists");

    onProgress({ completed: 0, total: 1, message: "正在读取 Zotero 全文索引" });
    if (!(await Zotero.Fulltext.isFullyIndexed(attachment))) {
      onProgress({ completed: 0, total: 1, message: "正在建立 PDF 全文索引" });
      await Zotero.Fulltext.indexItems([source.attachmentID], {
        complete: true,
        ignoreErrors: false,
      });
    }
    if (signal.aborted) throw createAbortError();

    const cacheFile = Zotero.Fulltext.getItemCacheFile(attachment);
    if (!(await IOUtils.exists(cacheFile.path))) {
      throw new Error(
        "Zotero 无法提取此 PDF 的全文。扫描件请改用 MinerU OCR 模式。",
      );
    }
    const text = await IOUtils.readUTF8(cacheFile.path);
    if (!text.trim()) {
      throw new Error(
        "Zotero 全文索引为空。扫描件或复杂排版论文请改用 MinerU。",
      );
    }
    const hasTitle = text
      .slice(0, Math.max(500, source.title.length * 3))
      .toLowerCase()
      .includes(source.title.toLowerCase().slice(0, 40));
    const markdown = hasTitle ? text : `# ${source.title}\n\n${text}`;
    onProgress({ completed: 1, total: 1, message: "Zotero 纯文本解析完成" });
    return { markdown, assets: [], parser: "zotero-fulltext" };
  }
}
