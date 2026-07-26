import { PaperDocument, PaperJob } from "./types";

const writeQueues = new Map<string, Promise<void>>();

function profileDirectory(): string {
  // @ts-expect-error Zotero.Profile.dir is available at runtime
  return Zotero.Profile.dir;
}

export function paperJobsDirectory(): string {
  return PathUtils.join(profileDirectory(), "context-translate", "paper-jobs");
}

export function paperJobDirectory(jobID: string): string {
  return PathUtils.join(
    paperJobsDirectory(),
    jobID.replace(/[^A-Za-z0-9_-]/g, "_"),
  );
}

function jobPath(jobID: string): string {
  return PathUtils.join(paperJobDirectory(jobID), "job.json");
}

function documentPath(jobID: string): string {
  return PathUtils.join(paperJobDirectory(jobID), "document.json");
}

async function putJSON(path: string, value: unknown): Promise<void> {
  const previous = writeQueues.get(path) || Promise.resolve();
  const queued = previous
    .catch(() => undefined)
    .then(async () => {
      const directory = PathUtils.parent(path);
      if (!directory) {
        throw new Error(`Cannot determine parent directory for ${path}`);
      }
      await Zotero.File.createDirectoryIfMissingAsync(directory);
      const temporary = `${path}.tmp`;
      await IOUtils.writeUTF8(temporary, JSON.stringify(value, null, 2));
      await IOUtils.move(temporary, path, { noOverwrite: false });
    });
  writeQueues.set(path, queued);
  try {
    await queued;
  } finally {
    if (writeQueues.get(path) === queued) {
      writeQueues.delete(path);
    }
  }
}

export async function savePaperJob(job: PaperJob): Promise<void> {
  job.updatedAt = Date.now();
  await putJSON(jobPath(job.id), job);
}

export async function loadPaperJob(jobID: string): Promise<PaperJob | null> {
  const path = jobPath(jobID);
  if (!(await IOUtils.exists(path))) return null;
  return (await IOUtils.readJSON(path)) as PaperJob;
}

export async function savePaperDocument(
  jobID: string,
  document: PaperDocument,
): Promise<void> {
  document.updatedAt = Date.now();
  await putJSON(documentPath(jobID), document);
}

export async function loadPaperDocument(
  jobID: string,
): Promise<PaperDocument | null> {
  const path = documentPath(jobID);
  if (!(await IOUtils.exists(path))) return null;
  return (await IOUtils.readJSON(path)) as PaperDocument;
}

export async function listPaperJobs(): Promise<PaperJob[]> {
  const root = paperJobsDirectory();
  if (!(await IOUtils.exists(root))) return [];
  const entries = await IOUtils.getChildren(root);
  const jobs: PaperJob[] = [];
  for (const entry of entries) {
    const path = PathUtils.join(entry, "job.json");
    if (!(await IOUtils.exists(path))) continue;
    try {
      jobs.push((await IOUtils.readJSON(path)) as PaperJob);
    } catch {
      // Ignore corrupt or partially written historical jobs.
    }
  }
  return jobs.sort((a, b) => b.updatedAt - a.updatedAt);
}
