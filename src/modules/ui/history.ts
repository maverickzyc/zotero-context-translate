import { v4 as uuidv4 } from "uuid";
import { ContextLevel, HistoryRecord, HistoryData } from "../../types";

const MAX_RECORDS = 1000;

function historyFilePath(profileDir: string, libraryId: number): string {
  return PathUtils.join(profileDir, `context-translate-history-${libraryId}.json`);
}

export async function loadHistory(profileDir: string, libraryId: number): Promise<HistoryData> {
  const path = historyFilePath(profileDir, libraryId);
  try {
    const raw = await Zotero.File.getContentsAsync(path);
    return JSON.parse(raw as string) as HistoryData;
  } catch {
    return { libraryId, records: [] };
  }
}

async function saveHistory(profileDir: string, data: HistoryData): Promise<void> {
  const path = historyFilePath(profileDir, data.libraryId);
  await Zotero.File.putContentsAsync(path, JSON.stringify(data, null, 2));
}

export async function addHistoryRecord(
  profileDir: string,
  libraryId: number,
  record: Omit<HistoryRecord, "id" | "timestamp">,
): Promise<HistoryRecord> {
  const data = await loadHistory(profileDir, libraryId);
  const newRecord: HistoryRecord = {
    ...record,
    id: uuidv4(),
    timestamp: Date.now(),
  };
  data.records.unshift(newRecord);
  if (data.records.length > MAX_RECORDS) {
    data.records = data.records.slice(0, MAX_RECORDS);
  }
  await saveHistory(profileDir, data);
  return newRecord;
}

export async function deleteHistoryRecord(
  profileDir: string,
  libraryId: number,
  recordId: string,
): Promise<void> {
  const data = await loadHistory(profileDir, libraryId);
  data.records = data.records.filter((r) => r.id !== recordId);
  await saveHistory(profileDir, data);
}

export function filterByItem(records: HistoryRecord[], itemId: string): HistoryRecord[] {
  return records.filter((r) => r.itemId === itemId);
}

export function sortByTime(records: HistoryRecord[], ascending = false): HistoryRecord[] {
  return [...records].sort((a, b) =>
    ascending ? a.timestamp - b.timestamp : b.timestamp - a.timestamp,
  );
}
