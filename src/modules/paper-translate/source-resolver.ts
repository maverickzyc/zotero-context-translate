import { PaperSource } from "./types";

function getTitle(item: Zotero.Item): string {
  const value = item.getField("title");
  return (
    (typeof value === "string" && value.trim()) ||
    item.attachmentFilename ||
    "Untitled Paper"
  );
}

async function findPDFAttachment(item: Zotero.Item): Promise<Zotero.Item> {
  if (item.isPDFAttachment()) return item;
  if (!item.isRegularItem()) {
    throw new Error("请选择一个文献条目或 PDF 附件");
  }

  const attachments = item
    .getAttachments()
    .map((id) => Zotero.Items.get(id))
    .filter((candidate): candidate is Zotero.Item =>
      Boolean(candidate && candidate.isPDFAttachment()),
    );
  for (const attachment of attachments) {
    if (await attachment.fileExists()) return attachment;
  }
  throw new Error("所选条目没有可用的本地 PDF 附件");
}

export function canTranslatePaperItem(item?: Zotero.Item): boolean {
  return Boolean(item && (item.isRegularItem() || item.isPDFAttachment()));
}

export async function resolvePaperSource(
  selectedItem: Zotero.Item,
): Promise<PaperSource> {
  const attachment = await findPDFAttachment(selectedItem);
  const parent =
    attachment.parentItemID && attachment.parentItem
      ? attachment.parentItem
      : selectedItem.isRegularItem()
        ? selectedItem
        : undefined;
  const filePath = await attachment.getFilePathAsync();
  if (!filePath) throw new Error("PDF 文件不存在或尚未下载到本地");

  const libraryID = (parent || attachment).libraryID;
  if (!Zotero.Libraries.isFilesEditable(libraryID)) {
    throw new Error("当前 Zotero Library 不允许添加文件附件");
  }

  const stat = await IOUtils.stat(filePath);
  const fingerprint = [
    attachment.key,
    stat.size,
    (stat as any).lastModified || (stat as any).lastModifiedTime || 0,
  ].join(":");

  return {
    attachmentID: attachment.id,
    attachmentKey: attachment.key,
    parentItemID: parent?.id,
    libraryID,
    title: parent ? getTitle(parent) : getTitle(attachment),
    authors: parent?.firstCreator || undefined,
    filePath,
    fingerprint,
  };
}

export const paperSourceInternals = { findPDFAttachment, getTitle };
