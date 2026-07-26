import { isTranslatableBlock, PaperBlock, TranslationBatch } from "./types";

export function planTranslationBatches(
  blocks: PaperBlock[],
  maxCharacters = 24000,
  maxBlocks = 20,
): TranslationBatch[] {
  const pending = blocks.filter(
    (block) =>
      isTranslatableBlock(block) &&
      (!block.translation || block.status === "failed"),
  );
  const batches: TranslationBatch[] = [];
  let currentIDs: string[] = [];
  let currentCharacters = 0;

  const flush = () => {
    if (!currentIDs.length) return;
    batches.push({
      id: `batch-${String(batches.length + 1).padStart(3, "0")}`,
      blockIDs: currentIDs,
      characterCount: currentCharacters,
    });
    currentIDs = [];
    currentCharacters = 0;
  };

  for (const block of pending) {
    const blockCharacters = block.source.length;
    if (
      currentIDs.length > 0 &&
      (currentCharacters + blockCharacters > maxCharacters ||
        currentIDs.length >= maxBlocks)
    ) {
      flush();
    }
    currentIDs.push(block.id);
    currentCharacters += blockCharacters;
  }
  flush();
  return batches;
}
