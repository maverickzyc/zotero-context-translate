import { PaperBlock, PaperDocument, PaperTemplate } from "./types";
import { sanitizePaperTranslation } from "./translation-protocol";

export type AssetReader = (path: string) => Promise<Uint8Array>;

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(value: string): string {
  return escapeHTML(value)
    .replace(/\$\^\{([^{}\n]+)\}\$/g, "<sup>$1</sup>")
    .replace(/\$_\{([^{}\n]+)\}\$/g, "<sub>$1</sub>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function splitMarkdownRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function renderMarkdownTable(markdown: string): string {
  const lines = markdown.split("\n").filter((line) => line.trim());
  if (lines.length < 2) {
    return `<pre class="table-fallback">${escapeHTML(markdown)}</pre>`;
  }
  const rows = lines.filter((_, index) => index !== 1).map(splitMarkdownRow);
  const head = rows.shift() || [];
  const headerHTML = `<thead><tr>${head
    .map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`)
    .join("")}</tr></thead>`;
  const bodyHTML = `<tbody>${rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody>`;
  return `<div class="table-wrap"><table>${headerHTML}${bodyHTML}</table></div>`;
}

function renderTable(value: string): string {
  if (/^\s*\|/.test(value) || /\n\s*\|?\s*:?-{3,}/.test(value)) {
    return renderMarkdownTable(value);
  }
  if (/^\s*<table(?:\s|>)/i.test(value) && typeof DOMParser !== "undefined") {
    const parsed = new DOMParser().parseFromString(value, "text/html");
    const body = parsed.body;
    if (!body) {
      return `<pre class="table-fallback">${escapeHTML(value)}</pre>`;
    }
    const allowed = new Set([
      "TABLE",
      "THEAD",
      "TBODY",
      "TFOOT",
      "TR",
      "TH",
      "TD",
      "CAPTION",
      "BR",
      "SUB",
      "SUP",
      "EM",
      "STRONG",
      "SPAN",
      "P",
    ]);
    for (const node of [...body.querySelectorAll("*")]) {
      if (!allowed.has(node.tagName)) {
        node.replaceWith(parsed.createTextNode(node.textContent || ""));
        continue;
      }
      for (const attribute of [...node.attributes]) {
        if (!["rowspan", "colspan", "scope"].includes(attribute.name)) {
          node.removeAttribute(attribute.name);
        }
      }
    }
    return `<div class="table-wrap">${body.innerHTML}</div>`;
  }
  return `<pre class="table-fallback">${escapeHTML(value)}</pre>`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function mimeForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
  };
  return types[extension || ""] || "application/octet-stream";
}

async function renderImage(
  block: PaperBlock,
  readAsset: AssetReader,
): Promise<string> {
  if (!block.assetPath) {
    return `<figure class="missing-asset"><div>图片资源缺失：${escapeHTML(
      block.sourceAssetPath || block.id,
    )}</div></figure>`;
  }
  try {
    const bytes = await readAsset(block.assetPath);
    const dataURI = `data:${mimeForPath(block.assetPath)};base64,${bytesToBase64(
      bytes,
    )}`;
    const caption = block.source
      ? `<figcaption><span class="en">${renderInlineMarkdown(
          block.source,
        )}</span></figcaption>`
      : "";
    return `<figure><img src="${dataURI}" alt="${escapeHTML(
      block.source,
    )}" loading="lazy">${caption}</figure>`;
  } catch {
    return `<figure class="missing-asset"><div>图片资源读取失败：${escapeHTML(
      block.sourceAssetPath || block.id,
    )}</div></figure>`;
  }
}

function bilingual(
  tag: "h1" | "h2" | "h3" | "p",
  block: PaperBlock,
  className = "",
): string {
  const classes = ["bilingual-block", className].filter(Boolean).join(" ");
  const classAttr = ` class="${classes}"`;
  return `<${tag}${classAttr} data-block-id="${block.id}"><span class="en">${renderInlineMarkdown(
    block.source,
  )}</span><span class="zh">${renderInlineMarkdown(
    sanitizePaperTranslation(block.translation || ""),
  )}</span></${tag}>`;
}

export async function renderPaperBody(
  document: PaperDocument,
  readAsset: AssetReader,
): Promise<string> {
  const output: string[] = [];

  for (const block of document.blocks) {
    switch (block.type) {
      case "drop":
        break;
      case "title":
        output.push(bilingual("h1", block));
        break;
      case "author":
        output.push(
          `<p class="byline" data-block-id="${block.id}">${renderInlineMarkdown(
            block.source,
          )}</p>`,
        );
        break;
      case "heading":
        output.push(bilingual("h2", block));
        break;
      case "subheading":
        output.push(bilingual("h3", block));
        break;
      case "paragraph":
        output.push(
          `<section class="pair" data-block-id="${block.id}"><p class="en">${renderInlineMarkdown(
            block.source,
          )}</p><p class="zh">${renderInlineMarkdown(
            sanitizePaperTranslation(block.translation || ""),
          )}</p></section>`,
        );
        break;
      case "quote":
        output.push(
          `<blockquote data-block-id="${block.id}"><p class="en">${renderInlineMarkdown(
            block.source,
          )}</p><p class="zh">${renderInlineMarkdown(
            sanitizePaperTranslation(block.translation || ""),
          )}</p></blockquote>`,
        );
        break;
      case "reference":
        output.push(
          `<p class="reference en-always" data-block-id="${block.id}">${renderInlineMarkdown(
            block.source,
          )}</p>`,
        );
        break;
      case "image":
        output.push(await renderImage(block, readAsset));
        break;
      case "caption":
        output.push(bilingual("p", block, "caption"));
        break;
      case "formula":
        output.push(
          `<pre class="formula en-always" data-block-id="${block.id}">${escapeHTML(
            block.source,
          )}</pre>`,
        );
        break;
      case "table":
        output.push(
          `<section class="table-pair" data-block-id="${block.id}"><div class="en">${renderTable(
            block.source,
          )}</div><div class="zh">${renderTable(
            sanitizePaperTranslation(block.translation || ""),
          )}</div></section>`,
        );
        break;
    }
  }
  return output.join("\n");
}

export function applyPaperTemplate(
  template: string,
  document: PaperDocument,
  body: string,
): string {
  const metadata = [
    document.metadata.authors,
    `由 Zotero Context Translate 生成 · ${new Date(
      document.updatedAt,
    ).toLocaleDateString()}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return template
    .replaceAll("{{TITLE}}", escapeHTML(document.metadata.title))
    .replaceAll("{{META}}", escapeHTML(metadata))
    .replace("{{BODY}}", body);
}

export async function renderPaperHTML(
  document: PaperDocument,
  templateName: PaperTemplate,
  readAsset?: AssetReader,
): Promise<string> {
  const templateURL = `${rootURI}content/paper-templates/${templateName}.html`;
  const template = await Zotero.File.getResourceAsync(templateURL);
  const reader: AssetReader =
    readAsset || (async (path) => await IOUtils.read(path));
  const body = await renderPaperBody(document, reader);
  return applyPaperTemplate(template, document, body);
}

export const htmlRendererInternals = {
  escapeHTML,
  renderInlineMarkdown,
  renderMarkdownTable,
  mimeForPath,
};
