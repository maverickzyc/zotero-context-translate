import { v4 as uuidv4 } from "uuid";
import { loadGlossary } from "../translate/glossary";
import { getLLMConfig } from "../translate/llm-service";
import { writeAndAttachPaperHTML } from "./attachment-writer";
import {
  getMinerUBaseURL,
  getMinerUToken,
  getPaperTranslateOptions,
  resolveParserKind,
} from "./config";
import {
  loadBuiltInPaperGlossary,
  mergePaperGlossaries,
} from "./default-glossary";
import { renderPaperHTML } from "./html-renderer";
import {
  listPaperJobs,
  loadPaperDocument,
  loadPaperJob,
  paperJobDirectory,
  savePaperDocument,
  savePaperJob,
} from "./job-store";
import { buildPaperGlossary, translatePaperDocument } from "./paper-translator";
import { structureParsedPaper } from "./paper-structurer";
import { MinerUDocumentParser } from "./parsers/mineru-parser";
import { ZoteroFulltextDocumentParser } from "./parsers/zotero-fulltext-parser";
import { resolvePaperSource } from "./source-resolver";
import { validatePaperDocument } from "./translation-validator";
import {
  clearUntranslatedNarrativeConnectorTranslations,
  repairPaperDocumentTranslations,
} from "./translation-protocol";
import { createZoteroAbortController } from "./runtime";
import { repairPaperStructure } from "./structure-normalizer";
import {
  DocumentParser,
  emptyPaperUsage,
  isTranslatableBlock,
  PaperDocument,
  PaperJob,
  PaperJobListener,
  PaperJobStage,
  PaperTranslateOptions,
} from "./types";

class PaperJobManager {
  private readonly jobs = new Map<string, PaperJob>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly executions = new Map<string, Promise<void>>();
  private readonly listeners = new Set<PaperJobListener>();
  private readonly lastProgressPersist = new Map<string, number>();

  subscribe(listener: PaperJobListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(job: PaperJob): void {
    for (const listener of this.listeners) {
      try {
        listener(job);
      } catch (error) {
        Zotero.log(
          `[ContextTranslate] Paper job listener failed: ${this.errorMessage(
            error,
          )}`,
          "error",
        );
      }
    }
  }

  private redact(value: string): string {
    return value
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "<redacted-api-key>")
      .replace(
        /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
        "<redacted-token>",
      );
  }

  private errorMessage(error: unknown): string {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return this.redact(error.message);
    }
    return this.redact(String(error));
  }

  private errorStack(error: unknown): string | undefined {
    if (
      error &&
      typeof error === "object" &&
      "stack" in error &&
      typeof error.stack === "string"
    ) {
      return this.redact(error.stack);
    }
    return undefined;
  }

  private addEvent(
    job: PaperJob,
    level: "info" | "warning" | "error",
    message: string,
    detail?: string,
  ): void {
    const safeMessage = this.redact(message);
    const safeDetail = detail ? this.redact(detail) : undefined;
    job.events ||= [];
    job.events.push({
      at: Date.now(),
      level,
      stage: job.stage,
      message: safeMessage,
      detail: safeDetail,
    });
    if (job.events.length > 80) {
      job.events.splice(0, job.events.length - 80);
    }
    Zotero.log(
      `[ContextTranslate] Paper job ${job.id} [${job.stage}] ${safeMessage}${
        safeDetail ? ` — ${safeDetail}` : ""
      }`,
      level === "error" ? "error" : level === "warning" ? "warning" : undefined,
    );
  }

  private async persist(job: PaperJob): Promise<void> {
    job.heartbeatAt = Date.now();
    await savePaperJob(job);
    this.jobs.set(job.id, job);
    this.emit(job);
  }

  private persistProgress(job: PaperJob): void {
    job.heartbeatAt = Date.now();
    this.emit(job);
    const now = Date.now();
    if (now - (this.lastProgressPersist.get(job.id) || 0) < 1000) return;
    this.lastProgressPersist.set(job.id, now);
    void savePaperJob(job).catch((error) => {
      Zotero.log(
        `[ContextTranslate] Could not persist paper progress: ${this.errorMessage(
          error,
        )}`,
        "error",
      );
    });
  }

  private async setStage(
    job: PaperJob,
    stage: PaperJobStage,
    message: string,
    completed = job.progress.completed,
    total = job.progress.total,
  ): Promise<void> {
    job.stage = stage;
    if (
      [
        "extracting",
        "structuring",
        "terminology",
        "translating",
        "validating",
        "rendering",
        "attaching",
      ].includes(stage)
    ) {
      job.lastActiveStage = stage;
    }
    job.progress = { completed, total, message };
    if (stage !== "failed") delete job.error;
    if (stage !== "failed") delete job.errorStack;
    this.addEvent(job, "info", message);
    await this.persist(job);
  }

  get(jobID: string): PaperJob | undefined {
    return this.jobs.get(jobID);
  }

  async list(): Promise<PaperJob[]> {
    const stored = await listPaperJobs();
    const activeStages: PaperJobStage[] = [
      "queued",
      "extracting",
      "structuring",
      "terminology",
      "translating",
      "validating",
      "rendering",
      "attaching",
    ];
    for (let index = 0; index < stored.length; index++) {
      const job = stored[index];
      if (this.executions.has(job.id)) {
        const live = this.jobs.get(job.id);
        if (live) stored[index] = live;
        continue;
      }
      if (activeStages.includes(job.stage)) {
        if (job.stage !== "queued") job.lastActiveStage = job.stage;
        job.stage = "paused";
        job.progress.message = "任务在 Zotero 退出时中断，点击“继续”恢复";
        this.addEvent(job, "warning", job.progress.message);
        await savePaperJob(job);
      }
      if (
        !job.lastActiveStage &&
        (job.stage === "paused" || job.stage === "failed")
      ) {
        const document = await loadPaperDocument(job.id);
        job.lastActiveStage = !document
          ? "extracting"
          : document.blocks.some(
                (block) => isTranslatableBlock(block) && block.translation,
              )
            ? "translating"
            : document.glossary.length
              ? "translating"
              : "terminology";
        await savePaperJob(job);
      }
      this.jobs.set(job.id, job);
    }
    return stored;
  }

  async start(
    item: Zotero.Item,
    options: PaperTranslateOptions = getPaperTranslateOptions(),
  ): Promise<PaperJob> {
    const llm = getLLMConfig();
    if (!llm.apiKey) {
      throw new Error("请先在 Context Translate 设置中配置 LLM API Key");
    }
    const source = await resolvePaperSource(item);
    const existing = (await this.list()).find(
      (job) =>
        job.source.attachmentID === source.attachmentID &&
        job.source.fingerprint === source.fingerprint &&
        job.stage !== "cancelled",
    );
    if (existing && existing.stage !== "completed") {
      await this.resume(existing.id);
      return existing;
    }
    if (existing?.stage === "completed" && existing.outputAttachmentID) {
      const output = Zotero.Items.get(existing.outputAttachmentID);
      const outputPath = await output?.getFilePathAsync();
      if (
        output &&
        !output.deleted &&
        outputPath &&
        (await IOUtils.exists(outputPath))
      ) {
        return existing;
      }
      delete existing.outputAttachmentID;
      delete existing.outputPath;
      existing.stage = "paused";
      existing.progress.message = "原双语 HTML 附件缺失，正在重新生成";
      await this.persist(existing);
      await this.resume(existing.id);
      return existing;
    }

    const now = Date.now();
    const job: PaperJob = {
      version: 1,
      id: uuidv4(),
      source,
      options,
      stage: "queued",
      progress: { completed: 0, total: 0, message: "等待开始" },
      usage: emptyPaperUsage(),
      attempt: 1,
      runID: uuidv4(),
      startedAt: now,
      heartbeatAt: now,
      events: [],
      createdAt: now,
      updatedAt: now,
    };
    this.addEvent(job, "info", "任务已创建，等待后台执行");
    await this.persist(job);
    this.launch(job);
    return job;
  }

  async resume(jobID: string): Promise<PaperJob> {
    const job = this.jobs.get(jobID) || (await loadPaperJob(jobID));
    if (!job) throw new Error("Paper translation job not found");
    if (job.stage === "completed") return job;
    const activeExecution = this.executions.get(jobID);
    if (activeExecution) {
      const controller = this.controllers.get(jobID);
      if (!controller?.signal.aborted) return job;
      await activeExecution.catch(() => undefined);
    }
    try {
      if (!getLLMConfig().apiKey) {
        throw new Error("请先在 Context Translate 设置中配置 LLM API Key");
      }
      const attachment = Zotero.Items.get(job.source.attachmentID);
      if (!attachment) {
        throw new Error("源 PDF 附件已不存在");
      }
      const path = await attachment.getFilePathAsync();
      if (!path || !(await IOUtils.exists(path))) {
        throw new Error("源 PDF 尚未下载到本地或文件已被移动");
      }
      job.source.filePath = path;
    } catch (error) {
      job.stage = "failed";
      job.error = this.errorMessage(error);
      job.errorStack = this.errorStack(error);
      job.progress.message = `无法恢复：${job.error}`;
      this.addEvent(job, "error", job.progress.message, job.errorStack);
      await this.persist(job);
      throw error;
    }
    job.attempt = (job.attempt || 0) + 1;
    job.runID = uuidv4();
    job.startedAt = Date.now();
    job.heartbeatAt = job.startedAt;
    job.stage = "queued";
    job.progress.message = `正在恢复任务（第 ${job.attempt} 次尝试）…`;
    delete job.error;
    delete job.errorStack;
    this.addEvent(job, "info", job.progress.message);
    await this.persist(job);
    this.launch(job);
    return job;
  }

  async rerender(jobID: string): Promise<PaperJob> {
    const job = this.jobs.get(jobID) || (await loadPaperJob(jobID));
    if (!job) throw new Error("Paper translation job not found");
    if (this.executions.has(jobID)) {
      throw new Error("任务仍在运行，暂时无法重新生成 HTML");
    }
    const document = await loadPaperDocument(jobID);
    if (!document) {
      throw new Error("任务检查点缺失，请使用“继续”重新执行任务");
    }
    try {
      await this.setStage(
        job,
        "rendering",
        "正在清理已有译文并重新生成 HTML",
        0,
        1,
      );
      const repaired = repairPaperDocumentTranslations(document);
      if (repaired) {
        await savePaperDocument(jobID, document);
        this.addEvent(job, "info", `已清理 ${repaired} 个译文中的旧版协议标记`);
      }
      const validation = validatePaperDocument(document);
      if (!validation.valid) {
        throw new Error(
          validation.issues
            .slice(0, 12)
            .map((issue) => issue.message)
            .join("; "),
        );
      }
      const html = await renderPaperHTML(document, job.options.template);
      await this.setStage(job, "attaching", "正在更新 Zotero HTML 附件", 0, 1);
      const output = await writeAndAttachPaperHTML(job, html);
      job.outputAttachmentID = output.attachment.id;
      job.outputPath = output.path;
      await this.setStage(job, "completed", "双语 HTML 已重新生成", 1, 1);
      return job;
    } catch (error) {
      await this.failSafely(job, error, "重新生成 HTML 失败");
      throw error;
    }
  }

  async repairAndRetranslate(jobID: string): Promise<PaperJob> {
    const job = this.jobs.get(jobID) || (await loadPaperJob(jobID));
    if (!job) throw new Error("Paper translation job not found");
    if (this.executions.has(jobID)) {
      throw new Error("任务仍在运行，暂时无法修复结构");
    }
    if (!getLLMConfig().apiKey) {
      throw new Error("请先在 Context Translate 设置中配置 LLM API Key");
    }
    if (!(await loadPaperDocument(jobID))) {
      throw new Error("任务检查点缺失，请使用“继续”重新执行任务");
    }

    job.attempt = (job.attempt || 0) + 1;
    job.runID = uuidv4();
    job.startedAt = Date.now();
    job.heartbeatAt = job.startedAt;
    const execution = this.executeRepair(job).finally(() => {
      if (this.executions.get(job.id) === execution) {
        this.executions.delete(job.id);
      }
    });
    this.executions.set(job.id, execution);
    await execution;
    return job;
  }

  async pause(jobID: string): Promise<void> {
    const job = this.jobs.get(jobID);
    if (!job) return;
    if (!["paused", "cancelled", "completed", "failed"].includes(job.stage)) {
      job.lastActiveStage = job.stage;
    }
    job.stage = "paused";
    job.progress.message = "任务已暂停，可稍后继续";
    this.addEvent(job, "warning", job.progress.message);
    this.controllers.get(jobID)?.abort();
    await this.persist(job);
    await this.waitForExecutionStop(jobID, 3000);
  }

  async cancel(jobID: string): Promise<void> {
    const job = this.jobs.get(jobID);
    if (!job) return;
    if (!["paused", "cancelled", "completed", "failed"].includes(job.stage)) {
      job.lastActiveStage = job.stage;
    }
    job.stage = "cancelled";
    job.progress.message = "任务已取消";
    this.addEvent(job, "warning", job.progress.message);
    this.controllers.get(jobID)?.abort();
    await this.persist(job);
    await this.waitForExecutionStop(jobID, 3000);
  }

  private async waitForExecutionStop(
    jobID: string,
    timeout: number,
  ): Promise<void> {
    const execution = this.executions.get(jobID);
    if (!execution) return;
    await Promise.race([
      execution.catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeout)),
    ]);
  }

  private launch(job: PaperJob): void {
    if (this.executions.has(job.id)) return;
    const execution = Promise.resolve()
      .then(() => this.execute(job))
      .catch((error) => this.failSafely(job, error, "后台任务启动失败"))
      .finally(() => {
        if (this.executions.get(job.id) === execution) {
          this.executions.delete(job.id);
        }
      });
    this.executions.set(job.id, execution);
  }

  private async failSafely(
    job: PaperJob,
    error: unknown,
    prefix = "任务失败",
  ): Promise<void> {
    job.stage = "failed";
    job.error = this.errorMessage(error);
    job.errorStack = this.errorStack(error);
    job.progress.message = `${prefix}：${job.error}`;
    this.addEvent(job, "error", job.progress.message, job.errorStack);
    try {
      await this.persist(job);
    } catch (persistError) {
      this.jobs.set(job.id, job);
      this.emit(job);
      Zotero.log(
        `[ContextTranslate] Failed to persist paper job failure: ${this.errorMessage(
          persistError,
        )}`,
        "error",
      );
    }
  }

  private parserFor(job: PaperJob): DocumentParser {
    const parser = resolveParserKind(job.options.parser);
    if (parser === "mineru") {
      return new MinerUDocumentParser({
        token: getMinerUToken(),
        model: job.options.mineruModel,
        language: job.options.sourceLanguage.startsWith("zh") ? "ch" : "en",
        ocr: job.options.mineruOCR,
        baseURL: getMinerUBaseURL(),
      });
    }
    return new ZoteroFulltextDocumentParser();
  }

  private addUsage(
    job: PaperJob,
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      requests: number;
    },
  ): void {
    job.usage.promptTokens += usage.promptTokens;
    job.usage.completionTokens += usage.completionTokens;
    job.usage.totalTokens += usage.totalTokens;
    job.usage.requests += usage.requests;
  }

  private async executeRepair(job: PaperJob): Promise<void> {
    let controller: AbortController | undefined;
    try {
      controller = createZoteroAbortController();
      this.controllers.set(job.id, controller);
      const signal = controller.signal;
      const document = await loadPaperDocument(job.id);
      if (!document) {
        throw new Error("任务检查点缺失，请使用“继续”重新执行任务");
      }

      await this.setStage(job, "structuring", "正在修复跨页段落结构", 0, 1);
      const structureRepair = repairPaperStructure(document, {
        resetTranslations: true,
      });
      const connectorRepairs =
        clearUntranslatedNarrativeConnectorTranslations(document);
      const protocolRepairs = repairPaperDocumentTranslations(document);
      await savePaperDocument(job.id, document);
      this.addEvent(
        job,
        "info",
        `结构修复完成：合并 ${structureRepair.removedIDs.length} 处跨页断句，待补译 ${connectorRepairs} 处连接词`,
      );
      if (protocolRepairs) {
        this.addEvent(
          job,
          "info",
          `已清理 ${protocolRepairs} 个译文中的旧版协议标记`,
        );
      }

      const pendingCount = document.blocks.filter(
        (block) => isTranslatableBlock(block) && !block.translation,
      ).length;
      if (pendingCount) {
        const translatableCount =
          document.blocks.filter(isTranslatableBlock).length;
        const completedCount = translatableCount - pendingCount;
        await this.setStage(
          job,
          "translating",
          `正在补译 ${pendingCount} 个受影响内容块`,
          completedCount,
          translatableCount,
        );
        const usageBefore = { ...job.usage };
        const translatedUsage = await translatePaperDocument(
          document,
          {
            concurrency: job.options.concurrency,
            maxBatchCharacters: job.options.maxBatchCharacters,
            maxOutputTokens: job.options.maxOutputTokens,
            glossary: document.glossary,
          },
          {
            onProgress: (completed, total, message) => {
              job.progress = { completed, total, message };
              this.persistProgress(job);
            },
            onCheckpoint: async (checkpoint, cumulativeUsage) => {
              job.usage = {
                promptTokens:
                  usageBefore.promptTokens + cumulativeUsage.promptTokens,
                completionTokens:
                  usageBefore.completionTokens +
                  cumulativeUsage.completionTokens,
                totalTokens:
                  usageBefore.totalTokens + cumulativeUsage.totalTokens,
                requests: usageBefore.requests + cumulativeUsage.requests,
              };
              await Promise.all([
                savePaperDocument(job.id, checkpoint),
                savePaperJob(job),
              ]);
              this.emit(job);
            },
          },
          signal,
        );
        job.usage = {
          promptTokens: usageBefore.promptTokens + translatedUsage.promptTokens,
          completionTokens:
            usageBefore.completionTokens + translatedUsage.completionTokens,
          totalTokens: usageBefore.totalTokens + translatedUsage.totalTokens,
          requests: usageBefore.requests + translatedUsage.requests,
        };
      }

      await this.setStage(job, "validating", "正在检查修复后的译文", 0, 1);
      const validation = validatePaperDocument(document);
      if (!validation.valid) {
        throw new Error(
          validation.issues
            .slice(0, 12)
            .map((issue) => issue.message)
            .join("; "),
        );
      }
      for (const block of document.blocks) {
        if (isTranslatableBlock(block)) block.status = "validated";
      }
      await savePaperDocument(job.id, document);

      await this.setStage(job, "rendering", "正在生成修复后的双语 HTML", 0, 1);
      const html = await renderPaperHTML(document, job.options.template);
      await this.setStage(job, "attaching", "正在更新 Zotero HTML 附件", 0, 1);
      const output = await writeAndAttachPaperHTML(job, html);
      job.outputAttachmentID = output.attachment.id;
      job.outputPath = output.path;
      await this.setStage(
        job,
        "completed",
        "结构与译文已修复，双语 HTML 已更新",
        1,
        1,
      );
    } catch (error) {
      if (controller?.signal.aborted) {
        if (job.stage !== "paused" && job.stage !== "cancelled") {
          job.stage = "paused";
          job.progress.message = "修复任务已暂停";
          this.addEvent(job, "warning", job.progress.message);
          await this.persist(job);
        }
      } else {
        await this.failSafely(job, error, "结构修复失败");
        throw error;
      }
    } finally {
      if (controller && this.controllers.get(job.id) === controller) {
        this.controllers.delete(job.id);
      }
    }
  }

  private async execute(job: PaperJob): Promise<void> {
    let controller: AbortController | undefined;

    try {
      controller = createZoteroAbortController();
      this.controllers.set(job.id, controller);
      const signal = controller.signal;
      let document = await loadPaperDocument(job.id);
      if (document && document.sourceFingerprint !== job.source.fingerprint) {
        document = null;
      }

      if (!document) {
        const parserKind = resolveParserKind(job.options.parser);
        await this.setStage(
          job,
          "extracting",
          parserKind === "mineru"
            ? "正在解析 PDF（MinerU 高保真）"
            : "正在解析 PDF（Zotero 全文索引）",
          0,
          1,
        );
        const parsed = await this.parserFor(job).parse(
          job.source,
          paperJobDirectory(job.id),
          (progress) => {
            job.progress = progress;
            this.persistProgress(job);
          },
          signal,
        );
        await this.setStage(job, "structuring", "正在识别论文结构", 0, 1);
        document = structureParsedPaper(
          parsed,
          job.source,
          job.options.targetLanguage,
          job.options.sourceLanguage,
        );
        await savePaperDocument(job.id, document);
      }

      if (!document.glossary.length) {
        await this.setStage(job, "terminology", "正在生成论文专属术语表", 0, 1);
        // @ts-expect-error Zotero.Profile.dir is available at runtime
        const profileDirectory: string = Zotero.Profile.dir;
        const [libraryGlossary, builtInGlossary] = await Promise.all([
          loadGlossary(profileDirectory, job.source.libraryID),
          loadBuiltInPaperGlossary(),
        ]);
        const glossaryResult = await buildPaperGlossary(
          document,
          mergePaperGlossaries(builtInGlossary, libraryGlossary.entries),
          job.options.maxOutputTokens,
          signal,
        );
        document.glossary = glossaryResult.terms;
        this.addUsage(job, glossaryResult.usage);
        await savePaperDocument(job.id, document);
        await this.persist(job);
      }

      const translatableCount =
        document.blocks.filter(isTranslatableBlock).length;
      const completedCount = document.blocks.filter(
        (block) => isTranslatableBlock(block) && block.translation,
      ).length;
      await this.setStage(
        job,
        "translating",
        `已翻译 ${completedCount}/${translatableCount} 个内容块`,
        completedCount,
        translatableCount,
      );
      const usageBefore = { ...job.usage };
      const translatedUsage = await translatePaperDocument(
        document,
        {
          concurrency: job.options.concurrency,
          maxBatchCharacters: job.options.maxBatchCharacters,
          maxOutputTokens: job.options.maxOutputTokens,
          glossary: document.glossary,
        },
        {
          onProgress: (completed, total, message) => {
            job.progress = { completed, total, message };
            this.persistProgress(job);
          },
          onCheckpoint: async (checkpoint, cumulativeUsage) => {
            job.usage = {
              promptTokens:
                usageBefore.promptTokens + cumulativeUsage.promptTokens,
              completionTokens:
                usageBefore.completionTokens + cumulativeUsage.completionTokens,
              totalTokens:
                usageBefore.totalTokens + cumulativeUsage.totalTokens,
              requests: usageBefore.requests + cumulativeUsage.requests,
            };
            await Promise.all([
              savePaperDocument(job.id, checkpoint),
              savePaperJob(job),
            ]);
            this.emit(job);
          },
        },
        signal,
      );
      job.usage = {
        promptTokens: usageBefore.promptTokens + translatedUsage.promptTokens,
        completionTokens:
          usageBefore.completionTokens + translatedUsage.completionTokens,
        totalTokens: usageBefore.totalTokens + translatedUsage.totalTokens,
        requests: usageBefore.requests + translatedUsage.requests,
      };

      await this.setStage(job, "validating", "正在检查译文完整性", 0, 1);
      const validation = validatePaperDocument(document);
      if (!validation.valid) {
        throw new Error(
          validation.issues
            .slice(0, 12)
            .map((issue) => issue.message)
            .join("; "),
        );
      }
      for (const block of document.blocks) {
        if (isTranslatableBlock(block)) block.status = "validated";
      }
      await savePaperDocument(job.id, document);

      await this.setStage(job, "rendering", "正在生成自包含双语 HTML", 0, 1);
      const html = await renderPaperHTML(document, job.options.template);
      await this.setStage(job, "attaching", "正在保存到 Zotero 条目", 0, 1);
      const output = await writeAndAttachPaperHTML(job, html);
      job.outputAttachmentID = output.attachment.id;
      job.outputPath = output.path;
      await this.setStage(job, "completed", "双语 HTML 已保存到 Zotero", 1, 1);
    } catch (error) {
      if (controller?.signal.aborted) {
        if (job.stage !== "paused" && job.stage !== "cancelled") {
          job.stage = "paused";
          job.progress.message = "任务已暂停";
          this.addEvent(job, "warning", job.progress.message);
          await this.persist(job);
        }
      } else {
        await this.failSafely(job, error);
      }
    } finally {
      if (controller && this.controllers.get(job.id) === controller) {
        this.controllers.delete(job.id);
      }
    }
  }
}

export const paperJobManager = new PaperJobManager();
