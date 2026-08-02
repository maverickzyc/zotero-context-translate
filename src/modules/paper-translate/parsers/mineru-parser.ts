import { unzipSync } from "fflate";
import {
  DocumentParser,
  PaperSource,
  ParsedAsset,
  ParsedPaper,
  ParserProgress,
} from "../types";
import { decodeUTF8, zoteroFetch } from "../runtime";

interface MinerUAPIResponse {
  code: number;
  msg?: string;
  trace_id?: string;
  data: Record<string, unknown>;
}

interface MinerUParserConfig {
  token: string;
  model: "vlm" | "pipeline";
  language: string;
  ocr: boolean;
  baseURL?: string;
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || "paper.pdf";
}

function extension(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function contentType(path: string): string {
  const types: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
  };
  return types[extension(path)] || "application/octet-stream";
}

function abortError(): Error {
  const error = new Error("Paper parsing was cancelled");
  error.name = "AbortError";
  return error;
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

export class MinerUDocumentParser implements DocumentParser {
  private readonly config: MinerUParserConfig;

  constructor(config: MinerUParserConfig) {
    this.config = config;
  }

  private async request(
    path: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<MinerUAPIResponse> {
    const baseURL = (
      this.config.baseURL || "https://mineru.net/api/v4"
    ).replace(/\/+$/, "");
    const response = await zoteroFetch(`${baseURL}${path}`, {
      ...init,
      signal,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
        source: "zotero-context-translate",
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `MinerU HTTP ${response.status}: ${response.statusText}${
          detail ? ` — ${detail}` : ""
        }`,
      );
    }
    const body = (await response.json()) as unknown as MinerUAPIResponse;
    if (body.code !== 0) {
      throw new Error(
        `MinerU API error ${body.code}: ${body.msg || "unknown error"}${
          body.trace_id ? ` (${body.trace_id})` : ""
        }`,
      );
    }
    return body;
  }

  async parse(
    source: PaperSource,
    jobDirectory: string,
    onProgress: (progress: ParserProgress) => void,
    signal: AbortSignal,
  ): Promise<ParsedPaper> {
    if (!this.config.token.trim()) {
      throw new Error(
        "MinerU Token 未配置。请在 Context Translate 设置中配置，或选择 Zotero 纯文本解析。",
      );
    }
    assertNotAborted(signal);
    onProgress({ completed: 0, total: 1, message: "正在申请 MinerU 上传地址" });

    const createResponse = await this.request(
      "/file-urls/batch",
      {
        method: "POST",
        body: JSON.stringify({
          files: [
            {
              name: basename(source.filePath),
              is_ocr: this.config.ocr,
            },
          ],
          model_version: this.config.model,
          enable_formula: true,
          enable_table: true,
          language: this.config.language,
        }),
      },
      signal,
    );
    const batchID = createResponse.data.batch_id as string;
    const uploadURLs = createResponse.data.file_urls as string[];
    if (!batchID || !uploadURLs?.[0]) {
      throw new Error("MinerU did not return a batch id or upload URL");
    }

    onProgress({ completed: 0, total: 1, message: "正在上传 PDF 到 MinerU" });
    const pdfBytes = await IOUtils.read(source.filePath);
    const uploadResponse = await zoteroFetch(uploadURLs[0], {
      method: "PUT",
      body: pdfBytes,
      signal,
    });
    if (!uploadResponse.ok) {
      throw new Error(
        `MinerU upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
      );
    }

    let interval = 2000;
    let zipURL = "";
    const deadline = Date.now() + 30 * 60 * 1000;
    while (!zipURL) {
      assertNotAborted(signal);
      if (Date.now() > deadline) {
        throw new Error("MinerU parsing timed out after 30 minutes");
      }
      const statusResponse = await this.request(
        `/extract-results/batch/${encodeURIComponent(batchID)}`,
        { method: "GET" },
        signal,
      );
      const results =
        (statusResponse.data.extract_result as Record<string, unknown>[]) || [];
      const result = results[0];
      if (result) {
        const state = String(result.state || "pending");
        const progress = result.extract_progress as
          Record<string, unknown> | undefined;
        const completed = Number(progress?.extracted_pages || 0);
        const total = Number(progress?.total_pages || 0);
        onProgress({
          completed,
          total,
          message:
            total > 0
              ? `MinerU 正在解析页面 ${completed}/${total}`
              : "MinerU 正在解析文档",
        });
        if (state === "failed") {
          throw new Error(
            `MinerU parsing failed: ${String(
              result.err_msg || result.err_code || "unknown error",
            )}`,
          );
        }
        if (state === "done") {
          zipURL = String(result.full_zip_url || "");
          if (!zipURL) throw new Error("MinerU result has no ZIP URL");
          break;
        }
      }
      await sleep(interval, signal);
      interval = Math.min(interval * 2, 30000);
    }

    onProgress({ completed: 1, total: 1, message: "正在下载 MinerU 解析结果" });
    const zipResponse = await zoteroFetch(zipURL, {
      signal,
      redirect: "follow",
    });
    if (!zipResponse.ok) {
      throw new Error(
        `MinerU result download failed: ${zipResponse.status} ${zipResponse.statusText}`,
      );
    }
    const entries = unzipSync(new Uint8Array(await zipResponse.arrayBuffer()));
    const assetsDirectory = PathUtils.join(jobDirectory, "assets");
    await Zotero.File.createDirectoryIfMissingAsync(assetsDirectory);

    let markdown = "";
    const assets: ParsedAsset[] = [];
    for (const [archivePath, data] of Object.entries(entries)) {
      if (archivePath.endsWith("/")) continue;
      const ext = extension(archivePath);
      if (ext === ".md") {
        const candidate = decodeUTF8(data);
        if (candidate.length > markdown.length) markdown = candidate;
        continue;
      }
      if (
        [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"].includes(ext)
      ) {
        const safeName = `${String(assets.length + 1).padStart(4, "0")}-${basename(
          archivePath,
        ).replace(/[^A-Za-z0-9._-]/g, "_")}`;
        const destination = PathUtils.join(assetsDirectory, safeName);
        await IOUtils.write(destination, new Uint8Array(data));
        assets.push({
          originalPath: archivePath,
          relativePath: destination,
          contentType: contentType(archivePath),
        });
      }
    }
    if (!markdown.trim()) {
      throw new Error("MinerU result ZIP contains no Markdown document");
    }
    await IOUtils.writeUTF8(
      PathUtils.join(jobDirectory, "source-mineru.md"),
      markdown,
    );
    onProgress({ completed: 1, total: 1, message: "MinerU 解析完成" });
    return { markdown, assets, parser: "mineru" };
  }
}

export const mineruParserInternals = {
  basename,
  extension,
  contentType,
};
