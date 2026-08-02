import { getItem } from "../../utils/items";
import { paperJobDirectory } from "./job-store";
import { PaperJob } from "./types";

function safeFilename(title: string): string {
  const clean = title
    .split("")
    .map((character) =>
      character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character)
        ? "_"
        : character,
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  return `${clean || "paper"}（双语）.html`;
}

function zoteroDateToTimestamp(value: string): number {
  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  return Date.parse(normalized);
}

export async function writeAndAttachPaperHTML(
  job: PaperJob,
  html: string,
): Promise<{ attachment: Zotero.Item; path: string }> {
  const outputPath = PathUtils.join(
    paperJobDirectory(job.id),
    safeFilename(job.source.title),
  );
  await IOUtils.writeUTF8(outputPath, html);

  if (job.outputAttachmentID) {
    const existing = getItem(job.outputAttachmentID);
    if (existing && !existing.deleted) {
      const path = await existing.getFilePathAsync();
      if (path && (await IOUtils.exists(path))) {
        await IOUtils.writeUTF8(path, html);
        return { attachment: existing, path };
      }
    }
  }

  const attachmentTitle = `${job.source.title}（双语 HTML）`;
  if (job.source.parentItemID) {
    const parent = getItem(job.source.parentItemID);
    const candidates = parent
      ?.getAttachments()
      .map((id) => getItem(id))
      .filter((item): item is Zotero.Item =>
        Boolean(
          item &&
          item.attachmentContentType === "text/html" &&
          item.getField("title") === attachmentTitle &&
          zoteroDateToTimestamp(item.dateAdded) >= job.createdAt - 60000,
        ),
      );
    for (const candidate of candidates || []) {
      const existingPath = await candidate.getFilePathAsync();
      if (existingPath && (await IOUtils.exists(existingPath))) {
        await IOUtils.writeUTF8(existingPath, html);
        return { attachment: candidate, path: existingPath };
      }
    }
  }

  const attachment = await Zotero.Attachments.importFromFile({
    file: outputPath,
    parentItemID: job.source.parentItemID,
    libraryID: job.source.libraryID,
    title: attachmentTitle,
    contentType: "text/html",
    charset: "utf-8",
  });
  const storedPath = await attachment.getFilePathAsync();
  return {
    attachment,
    path: storedPath || outputPath,
  };
}

export async function openPaperAttachment(attachmentID: number): Promise<void> {
  const attachment = getItem(attachmentID);
  if (!attachment) throw new Error("HTML attachment no longer exists");
  const path = await attachment.getFilePathAsync();
  if (!path) throw new Error("HTML attachment file is not available locally");
  Zotero.launchFile(path);
}

export const attachmentWriterInternals = {
  safeFilename,
  zoteroDateToTimestamp,
};
