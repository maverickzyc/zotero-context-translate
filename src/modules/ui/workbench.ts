import { ContextLevel, HistoryRecord } from "../../types";
import { openPaperAttachment } from "../paper-translate/attachment-writer";
import { paperJobManager } from "../paper-translate/job-manager";
import { PaperJob, PaperJobStage } from "../paper-translate/types";
import { deleteHistoryRecord, loadHistory } from "./history";
import {
  effectivePaperJobStage,
  filterWorkbenchHistory,
  PAPER_PIPELINE_STAGES,
  paperJobProgressPercent,
  WorkbenchHistoryEntry,
} from "./workbench-model";

const XHTML = "http://www.w3.org/1999/xhtml";
const WORKBENCH_ID = "context-translate-workbench";

type WorkbenchTab = "history" | "jobs";
type JobFilter = "all" | "active" | "completed" | "failed";

interface WorkbenchOptions {
  tab?: WorkbenchTab;
  jobID?: string;
}

type WorkbenchRoot = HTMLDivElement & {
  contextTranslateCleanup?: () => void;
};

function element<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElementNS(XHTML, tag) as HTMLElementTagNameMap[K];
  if (text !== undefined) node.textContent = text;
  return node;
}

function applyStyle(
  node: HTMLElement,
  style: Partial<CSSStyleDeclaration>,
): void {
  Object.assign(node.style, style);
}

function createButton(
  document: Document,
  label: string,
  onClick: (button: HTMLButtonElement) => void | Promise<void>,
  kind: "default" | "primary" | "danger" | "ghost" = "default",
): HTMLButtonElement {
  const button = element(document, "button", label);
  const colors = {
    default: { background: "#313244", border: "#45475a", color: "#cdd6f4" },
    primary: { background: "#3b82f6", border: "#60a5fa", color: "#fff" },
    danger: { background: "#4a2634", border: "#7f334d", color: "#fda4af" },
    ghost: { background: "transparent", border: "#45475a", color: "#bac2de" },
  }[kind];
  applyStyle(button, {
    border: `1px solid ${colors.border}`,
    borderRadius: "7px",
    padding: "6px 11px",
    background: colors.background,
    color: colors.color,
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "600",
  });
  button.addEventListener("click", () => {
    try {
      void Promise.resolve(onClick(button)).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        Zotero.log(`[ContextTranslate] Workbench action failed: ${message}`);
        Services.prompt.alert(
          Zotero.getMainWindow() as any,
          "Context Translate 操作失败",
          message,
        );
      });
    } catch (error) {
      Services.prompt.alert(
        Zotero.getMainWindow() as any,
        "Context Translate 操作失败",
        error instanceof Error ? error.message : String(error),
      );
    }
  });
  return button;
}

function stageLabel(stage: PaperJobStage): string {
  const labels: Record<PaperJobStage, string> = {
    queued: "等待/恢复",
    extracting: "解析 PDF",
    structuring: "识别结构",
    terminology: "生成术语",
    translating: "翻译正文",
    validating: "校验译文",
    rendering: "渲染 HTML",
    attaching: "保存附件",
    completed: "已完成",
    paused: "已暂停",
    cancelled: "已取消",
    failed: "失败",
  };
  return labels[stage];
}

function levelLabel(record: HistoryRecord): string {
  if (record.operation === "lookup") return "查词";
  if (record.operation === "phrase-translation") return "短语翻译";
  if (record.operation === "translation") return "翻译";
  return (
    {
      [ContextLevel.Word]: "查词",
      [ContextLevel.Sentence]: "句子翻译",
      [ContextLevel.Paragraph]: "段落翻译",
    }[record.level] || "翻译"
  );
}

function dictionaryResultText(record: HistoryRecord): string {
  if (!record.dictionary) return "";
  const phonetic = record.dictionary.phonetic
    ? ` /${record.dictionary.phonetic}/`
    : "";
  const partOfSpeech = record.dictionary.pos ? `${record.dictionary.pos} ` : "";
  return `${record.selected}${phonetic}\n${partOfSpeech}${record.dictionary.translation}`;
}

function historyResultText(record: HistoryRecord): string {
  return [dictionaryResultText(record), record.result.trim()]
    .filter(Boolean)
    .join("\n\n");
}

function historyDetailsText(record: HistoryRecord): string {
  const sections = [`上下文\n${record.context}`];
  const dictionary = dictionaryResultText(record);
  if (dictionary) sections.push(`本地词典\n${dictionary}`);
  if (record.result.trim()) {
    sections.push(
      `${record.operation === "lookup" ? "语境解释" : "翻译结果"}\n${record.result}`,
    );
  }
  return sections.join("\n\n");
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function copyText(value: string): void {
  try {
    const helper = (Components.classes as any)[
      "@mozilla.org/widget/clipboardhelper;1"
    ].getService(Components.interfaces.nsIClipboardHelper);
    helper.copyString(value);
  } catch {
    void navigator.clipboard?.writeText(value);
  }
}

function historyItemTitle(record: HistoryRecord): string {
  const item = Zotero.Items.get(Number(record.itemId));
  const parent = item && item.parentItem;
  const sourceItem = parent || item;
  const title =
    sourceItem && typeof sourceItem.getField === "function"
      ? sourceItem.getField("title")
      : "";
  return typeof title === "string" && title.trim()
    ? title
    : `Zotero Item ${record.itemId}`;
}

async function loadAllHistory(): Promise<WorkbenchHistoryEntry[]> {
  // @ts-expect-error Zotero.Profile.dir is available at runtime
  const profileDirectory: string = Zotero.Profile.dir;
  const libraries = Zotero.Libraries.getAll().filter(
    (library) => library.libraryType !== "feed",
  );
  const groups = await Promise.all(
    libraries.map(async (library) => {
      const data = await loadHistory(profileDirectory, library.libraryID);
      return data.records.map((record) => ({
        libraryID: library.libraryID,
        libraryName: library.name,
        record,
      }));
    }),
  );
  return groups.flat().sort((a, b) => b.record.timestamp - a.record.timestamp);
}

export function showTranslateWorkbench(options: WorkbenchOptions = {}): void {
  void openTranslateWorkbench(options).catch((error) => {
    Services.prompt.alert(
      Zotero.getMainWindow() as any,
      "无法打开 Context Translate 工作台",
      error instanceof Error ? error.message : String(error),
    );
  });
}

export async function openTranslateWorkbench(
  options: WorkbenchOptions = {},
): Promise<void> {
  await mountTranslateWorkbench(options);
}

export function closeTranslateWorkbench(win?: Window): void {
  const targetWindow = win || Zotero.getMainWindow();
  if (!targetWindow) return;
  const existing = targetWindow.document.getElementById(
    WORKBENCH_ID,
  ) as WorkbenchRoot | null;
  existing?.contextTranslateCleanup?.();
  existing?.remove();
}

async function mountTranslateWorkbench(
  options: WorkbenchOptions,
): Promise<void> {
  const win = Zotero.getMainWindow();
  const document = win.document;
  const existing = document.getElementById(
    WORKBENCH_ID,
  ) as WorkbenchRoot | null;
  existing?.contextTranslateCleanup?.();
  existing?.remove();

  let activeTab: WorkbenchTab = options.tab || "jobs";
  let jobFilter: JobFilter = "all";
  let histories: WorkbenchHistoryEntry[] = [];
  let jobs: PaperJob[] = [];
  let historyQuery = "";
  let updateTimer: number | undefined;

  const backdrop = element(document, "div") as WorkbenchRoot;
  backdrop.id = WORKBENCH_ID;
  applyStyle(backdrop, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483646",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px",
    background: "rgba(10, 11, 18, .58)",
    backdropFilter: "blur(3px)",
  });

  const panel = element(document, "section");
  applyStyle(panel, {
    width: "min(1080px, calc(100vw - 36px))",
    height: "min(780px, calc(100vh - 42px))",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    border: "1px solid #45475a",
    borderRadius: "16px",
    background: "#1e1e2e",
    color: "#cdd6f4",
    boxShadow: "0 28px 90px rgba(0,0,0,.55)",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  });

  const header = element(document, "header");
  applyStyle(header, {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "17px 20px",
    borderBottom: "1px solid #313244",
  });
  const headingBox = element(document, "div");
  headingBox.style.flex = "1";
  const title = element(document, "div", "Context Translate 工作台");
  applyStyle(title, { fontSize: "18px", fontWeight: "750" });
  const summary = element(document, "div", "正在加载历史和任务…");
  applyStyle(summary, {
    marginTop: "3px",
    color: "#7f849c",
    fontSize: "12px",
  });
  headingBox.append(title, summary);
  const toast = element(document, "div");
  applyStyle(toast, {
    display: "none",
    maxWidth: "360px",
    color: "#a6e3a1",
    fontSize: "12px",
    textAlign: "right",
  });
  const refreshButton = createButton(
    document,
    "刷新",
    async (button) => {
      button.disabled = true;
      await refreshAll();
      showToast("数据已刷新");
      button.disabled = false;
    },
    "ghost",
  );
  const closeButton = createButton(document, "关闭", () => close(), "ghost");
  header.append(headingBox, toast, refreshButton, closeButton);

  const nav = element(document, "nav");
  applyStyle(nav, {
    display: "flex",
    gap: "8px",
    padding: "10px 20px",
    borderBottom: "1px solid #313244",
    background: "#181825",
  });
  const historyTab = createButton(document, "查词与翻译历史", () => {
    activeTab = "history";
    render();
  });
  const jobsTab = createButton(document, "整篇翻译任务", () => {
    activeTab = "jobs";
    render();
  });
  nav.append(historyTab, jobsTab);

  const content = element(document, "main");
  applyStyle(content, {
    flex: "1",
    overflow: "auto",
    padding: "18px 20px 28px",
  });
  panel.append(header, nav, content);
  backdrop.appendChild(panel);
  document.documentElement!.appendChild(backdrop);

  const showToast = (message: string, error = false) => {
    toast.textContent = message;
    toast.style.color = error ? "#f38ba8" : "#a6e3a1";
    toast.style.display = "block";
    win.setTimeout(() => {
      if (toast.textContent === message) toast.style.display = "none";
    }, 5000);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  const unsubscribe = paperJobManager.subscribe((updated) => {
    const index = jobs.findIndex((job) => job.id === updated.id);
    if (index >= 0) jobs[index] = updated;
    else jobs.unshift(updated);
    updateSummary();
    if (activeTab === "jobs") {
      if (updateTimer !== undefined) win.clearTimeout(updateTimer);
      updateTimer = win.setTimeout(() => renderJobs(), 120);
    }
  });
  const close = () => {
    unsubscribe();
    if (updateTimer !== undefined) win.clearTimeout(updateTimer);
    win.removeEventListener("keydown", onKeyDown, true);
    backdrop.remove();
  };
  backdrop.contextTranslateCleanup = close;
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) close();
  });
  win.addEventListener("keydown", onKeyDown, true);

  function updateSummary(): void {
    const activeJobs = jobs.filter((job) =>
      [
        "queued",
        "extracting",
        "structuring",
        "terminology",
        "translating",
        "validating",
        "rendering",
        "attaching",
        "paused",
      ].includes(job.stage),
    ).length;
    const completedJobs = jobs.filter(
      (job) => job.stage === "completed",
    ).length;
    summary.textContent = `${histories.length} 条阅读翻译记录 · ${activeJobs} 个进行中/暂停任务 · ${completedJobs} 个已完成任务`;
  }

  function updateTabs(): void {
    for (const [button, selected] of [
      [historyTab, activeTab === "history"],
      [jobsTab, activeTab === "jobs"],
    ] as Array<[HTMLButtonElement, boolean]>) {
      button.style.background = selected ? "#3b82f6" : "#313244";
      button.style.borderColor = selected ? "#60a5fa" : "#45475a";
      button.style.color = selected ? "#fff" : "#cdd6f4";
    }
  }

  function render(): void {
    updateTabs();
    content.replaceChildren();
    if (activeTab === "history") renderHistory();
    else renderJobs();
  }

  function renderHistory(): void {
    content.replaceChildren();
    const toolbar = element(document, "div");
    applyStyle(toolbar, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      marginBottom: "14px",
    });
    const search = element(document, "input");
    search.type = "search";
    search.placeholder = "搜索原文、译文、上下文或文献…";
    search.value = historyQuery;
    applyStyle(search, {
      flex: "1",
      minWidth: "180px",
      border: "1px solid #45475a",
      borderRadius: "8px",
      padding: "8px 10px",
      background: "#181825",
      color: "#cdd6f4",
      fontSize: "13px",
    });
    const count = element(document, "div");
    applyStyle(count, { color: "#7f849c", fontSize: "12px" });
    toolbar.append(search, count);
    const list = element(document, "div");
    content.append(toolbar, list);

    const updateList = () => {
      const filtered = filterWorkbenchHistory(histories, historyQuery);
      count.textContent = `${filtered.length} / ${histories.length}`;
      list.replaceChildren();
      if (!filtered.length) {
        const empty = element(
          document,
          "div",
          histories.length ? "没有匹配的历史记录" : "暂无查词或翻译历史",
        );
        applyStyle(empty, {
          padding: "52px 0",
          color: "#7f849c",
          textAlign: "center",
        });
        list.appendChild(empty);
        return;
      }
      for (const entry of filtered) {
        list.appendChild(renderHistoryCard(entry));
      }
    };
    search.addEventListener("input", () => {
      historyQuery = search.value;
      updateList();
    });
    updateList();
  }

  function renderHistoryCard(entry: WorkbenchHistoryEntry): HTMLElement {
    const { record } = entry;
    const card = element(document, "article");
    applyStyle(card, {
      padding: "13px 15px",
      marginBottom: "10px",
      border: "1px solid #313244",
      borderRadius: "10px",
      background: "#181825",
    });
    const top = element(document, "div");
    applyStyle(top, {
      display: "flex",
      alignItems: "center",
      gap: "9px",
    });
    const badge = element(document, "span", levelLabel(record));
    applyStyle(badge, {
      padding: "2px 7px",
      borderRadius: "999px",
      background: "#24334f",
      color: "#89b4fa",
      fontSize: "11px",
      fontWeight: "700",
    });
    const source = element(document, "strong", record.selected);
    applyStyle(source, {
      flex: "1",
      overflow: "hidden",
      fontSize: "14px",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    const time = element(document, "span", formatDate(record.timestamp));
    applyStyle(time, { color: "#6c7086", fontSize: "11px" });
    top.append(badge, source, time);

    const result = element(document, "div", historyResultText(record));
    applyStyle(result, {
      maxHeight: "4.8em",
      overflow: "hidden",
      marginTop: "8px",
      color: "#bac2de",
      fontSize: "13px",
      lineHeight: "1.6",
      whiteSpace: "pre-wrap",
    });
    const meta = element(
      document,
      "div",
      `${historyItemTitle(record)} · 第 ${record.page} 页 · ${entry.libraryName}`,
    );
    applyStyle(meta, {
      marginTop: "8px",
      color: "#6c7086",
      fontSize: "11px",
    });
    const details = element(document, "details");
    details.style.marginTop = "8px";
    const detailsSummary = element(document, "summary", "查看上下文与完整结果");
    applyStyle(detailsSummary, {
      color: "#89b4fa",
      cursor: "pointer",
      fontSize: "12px",
    });
    const contextBlock = element(document, "pre", historyDetailsText(record));
    applyStyle(contextBlock, {
      maxHeight: "260px",
      overflow: "auto",
      padding: "10px",
      borderRadius: "7px",
      background: "#11111b",
      color: "#cdd6f4",
      fontFamily: "inherit",
      fontSize: "12px",
      lineHeight: "1.55",
      whiteSpace: "pre-wrap",
    });
    details.append(detailsSummary, contextBlock);
    const actions = element(document, "div");
    applyStyle(actions, {
      display: "flex",
      gap: "7px",
      flexWrap: "wrap",
      marginTop: "10px",
    });
    actions.append(
      createButton(document, "复制结果", () => {
        copyText(historyResultText(record));
        showToast("结果已复制");
      }),
      createButton(document, "定位条目", () => {
        Zotero.getActiveZoteroPane().selectItem(Number(record.itemId), true);
      }),
      createButton(
        document,
        "删除记录",
        async () => {
          const confirmed = Services.prompt.confirm(
            win as any,
            "删除翻译记录",
            `确定删除“${record.selected.slice(0, 60)}”的历史记录吗？`,
          );
          if (!confirmed) return;
          // @ts-expect-error Zotero.Profile.dir is available at runtime
          const profileDirectory: string = Zotero.Profile.dir;
          await deleteHistoryRecord(
            profileDirectory,
            entry.libraryID,
            record.id,
          );
          histories = histories.filter(
            (candidate) =>
              !(
                candidate.libraryID === entry.libraryID &&
                candidate.record.id === record.id
              ),
          );
          updateSummary();
          renderHistory();
          showToast("历史记录已删除");
        },
        "danger",
      ),
    );
    card.append(top, result, meta, details, actions);
    return card;
  }

  function filteredJobs(): PaperJob[] {
    if (jobFilter === "all") return jobs;
    if (jobFilter === "completed") {
      return jobs.filter((job) => job.stage === "completed");
    }
    if (jobFilter === "failed") {
      return jobs.filter((job) => ["failed", "cancelled"].includes(job.stage));
    }
    return jobs.filter((job) =>
      [
        "queued",
        "extracting",
        "structuring",
        "terminology",
        "translating",
        "validating",
        "rendering",
        "attaching",
        "paused",
      ].includes(job.stage),
    );
  }

  function renderJobs(): void {
    content.replaceChildren();
    const filters = element(document, "div");
    applyStyle(filters, {
      display: "flex",
      alignItems: "center",
      gap: "7px",
      flexWrap: "wrap",
      marginBottom: "14px",
    });
    const filterLabels: Array<[JobFilter, string]> = [
      ["all", `全部 ${jobs.length}`],
      ["active", "进行中/暂停"],
      ["completed", "已完成"],
      ["failed", "失败/取消"],
    ];
    for (const [value, label] of filterLabels) {
      const filterButton = createButton(document, label, () => {
        jobFilter = value;
        renderJobs();
      });
      if (jobFilter === value) {
        filterButton.style.background = "#3b82f6";
        filterButton.style.borderColor = "#60a5fa";
        filterButton.style.color = "#fff";
      }
      filters.appendChild(filterButton);
    }
    const hint = element(
      document,
      "div",
      "阶段：解析 → 结构 → 术语 → 翻译 → 校验 → HTML → Zotero",
    );
    applyStyle(hint, {
      marginLeft: "auto",
      color: "#6c7086",
      fontSize: "11px",
    });
    filters.appendChild(hint);
    content.appendChild(filters);

    const visible = filteredJobs();
    if (!visible.length) {
      const empty = element(document, "div", "当前筛选下没有整篇翻译任务");
      applyStyle(empty, {
        padding: "52px 0",
        color: "#7f849c",
        textAlign: "center",
      });
      content.appendChild(empty);
      return;
    }
    for (const job of visible) {
      content.appendChild(renderJobCard(job));
    }
    if (options.jobID) {
      const focused = document.getElementById(
        `context-translate-job-${options.jobID}`,
      );
      focused?.scrollIntoView({ block: "center" });
      options.jobID = undefined;
    }
  }

  function renderJobCard(job: PaperJob): HTMLElement {
    const card = element(document, "article");
    card.id = `context-translate-job-${job.id}`;
    applyStyle(card, {
      padding: "15px",
      marginBottom: "12px",
      border: `1px solid ${job.stage === "failed" ? "#7f334d" : "#313244"}`,
      borderRadius: "11px",
      background: "#181825",
    });
    const top = element(document, "div");
    applyStyle(top, {
      display: "flex",
      alignItems: "flex-start",
      gap: "10px",
    });
    const titleBox = element(document, "div");
    titleBox.style.flex = "1";
    const jobTitle = element(document, "strong", job.source.title);
    applyStyle(jobTitle, {
      display: "block",
      fontSize: "14px",
      lineHeight: "1.4",
    });
    const metadata = element(
      document,
      "div",
      `${job.options.parser === "auto" ? "自动解析" : job.options.parser} · ${
        job.options.template
      } 模板 · 第 ${job.attempt || 1} 次尝试 · ${formatDate(
        job.heartbeatAt || job.updatedAt,
      )} 最近活动`,
    );
    applyStyle(metadata, {
      marginTop: "4px",
      color: "#6c7086",
      fontSize: "11px",
    });
    titleBox.append(jobTitle, metadata);
    const badge = element(document, "span", stageLabel(job.stage));
    applyStyle(badge, {
      flex: "none",
      padding: "3px 8px",
      borderRadius: "999px",
      background:
        job.stage === "completed"
          ? "#1d4033"
          : job.stage === "failed"
            ? "#4a2634"
            : job.stage === "paused"
              ? "#40361d"
              : "#24334f",
      color:
        job.stage === "completed"
          ? "#a6e3a1"
          : job.stage === "failed"
            ? "#fda4af"
            : job.stage === "paused"
              ? "#f9e2af"
              : "#89b4fa",
      fontSize: "11px",
      fontWeight: "700",
    });
    top.append(titleBox, badge);

    const stageTrack = element(document, "div");
    applyStyle(stageTrack, {
      display: "grid",
      gridTemplateColumns: `repeat(${PAPER_PIPELINE_STAGES.length}, minmax(64px, 1fr))`,
      gap: "4px",
      marginTop: "13px",
      overflowX: "auto",
    });
    const effectiveStage = effectivePaperJobStage(job);
    const effectiveIndex = PAPER_PIPELINE_STAGES.indexOf(effectiveStage);
    for (const [index, stage] of PAPER_PIPELINE_STAGES.entries()) {
      const step = element(document, "div", stageLabel(stage));
      applyStyle(step, {
        padding: "4px 5px",
        borderRadius: "5px",
        background:
          index < effectiveIndex || job.stage === "completed"
            ? "#1d4033"
            : index === effectiveIndex
              ? "#24334f"
              : "#242435",
        color:
          index < effectiveIndex || job.stage === "completed"
            ? "#a6e3a1"
            : index === effectiveIndex
              ? "#89b4fa"
              : "#6c7086",
        fontSize: "10px",
        textAlign: "center",
        whiteSpace: "nowrap",
      });
      stageTrack.appendChild(step);
    }

    const progressBar = element(document, "div");
    applyStyle(progressBar, {
      height: "7px",
      marginTop: "12px",
      overflow: "hidden",
      borderRadius: "999px",
      background: "#313244",
    });
    const progressFill = element(document, "div");
    applyStyle(progressFill, {
      width: `${paperJobProgressPercent(job)}%`,
      height: "100%",
      borderRadius: "999px",
      background:
        job.stage === "failed"
          ? "#f38ba8"
          : "linear-gradient(90deg,#3b82f6,#22c55e)",
    });
    progressBar.appendChild(progressFill);

    const messageLine = element(document, "div");
    applyStyle(messageLine, {
      display: "flex",
      gap: "10px",
      marginTop: "8px",
      color: "#bac2de",
      fontSize: "12px",
    });
    const message = element(document, "span", job.progress.message);
    message.style.flex = "1";
    const progressText = element(
      document,
      "span",
      job.progress.total > 0
        ? `${job.progress.completed}/${job.progress.total} · ${paperJobProgressPercent(
            job,
          ).toFixed(0)}%`
        : `${paperJobProgressPercent(job).toFixed(0)}%`,
    );
    progressText.style.color = "#7f849c";
    messageLine.append(message, progressText);

    const usage = element(
      document,
      "div",
      job.usage.requests
        ? `API 请求 ${job.usage.requests} 次 · 输入 ${job.usage.promptTokens.toLocaleString()} tokens · 输出 ${job.usage.completionTokens.toLocaleString()} tokens`
        : "尚未产生 LLM Token 用量",
    );
    applyStyle(usage, {
      marginTop: "6px",
      color: "#6c7086",
      fontSize: "11px",
    });
    const error = element(document, "div", job.error || "");
    applyStyle(error, {
      display: job.error ? "block" : "none",
      marginTop: "8px",
      padding: "8px 10px",
      borderRadius: "6px",
      background: "#341f2a",
      color: "#fda4af",
      fontSize: "12px",
      whiteSpace: "pre-wrap",
    });
    const diagnostics = element(document, "details");
    applyStyle(diagnostics, {
      display: job.events?.length || job.errorStack ? "block" : "none",
      marginTop: "8px",
      color: "#7f849c",
      fontSize: "11px",
    });
    const diagnosticsSummary = element(
      document,
      "summary",
      `诊断记录（${job.events?.length || 0}）`,
    );
    diagnosticsSummary.style.cursor = "pointer";
    const diagnosticsBody = element(
      document,
      "pre",
      [
        ...(job.events || [])
          .slice(-20)
          .map(
            (event) =>
              `${new Date(event.at).toLocaleTimeString("zh-CN")} [${
                event.level
              }] ${stageLabel(event.stage)}：${event.message}${
                event.detail ? `\n${event.detail}` : ""
              }`,
          ),
        ...(job.errorStack ? [`错误栈：\n${job.errorStack}`] : []),
      ].join("\n"),
    );
    applyStyle(diagnosticsBody, {
      maxHeight: "220px",
      overflow: "auto",
      padding: "9px",
      borderRadius: "6px",
      background: "#11111b",
      color: "#a6adc8",
      fontSize: "10px",
      lineHeight: "1.5",
      whiteSpace: "pre-wrap",
    });
    diagnostics.append(diagnosticsSummary, diagnosticsBody);
    const actions = element(document, "div");
    applyStyle(actions, {
      display: "flex",
      gap: "7px",
      flexWrap: "wrap",
      marginTop: "11px",
    });

    const runAction = async (
      button: HTMLButtonElement,
      pendingMessage: string,
      action: () => Promise<unknown>,
    ) => {
      button.disabled = true;
      button.style.opacity = ".65";
      showToast(pendingMessage);
      try {
        await action();
      } catch (actionError) {
        showToast(
          actionError instanceof Error
            ? actionError.message
            : String(actionError),
          true,
        );
      } finally {
        button.disabled = false;
        button.style.opacity = "1";
      }
    };

    if (!["completed", "failed", "paused", "cancelled"].includes(job.stage)) {
      actions.append(
        createButton(document, "暂停", (button) =>
          runAction(button, "正在暂停任务…", () =>
            paperJobManager.pause(job.id),
          ),
        ),
        createButton(
          document,
          "取消",
          async (button) => {
            const confirmed = Services.prompt.confirm(
              win as any,
              "取消整篇翻译",
              "确定取消这个任务吗？已完成的检查点会保留。",
            );
            if (!confirmed) return;
            await runAction(button, "正在取消任务…", () =>
              paperJobManager.cancel(job.id),
            );
          },
          "danger",
        ),
      );
    }
    if (job.stage === "paused" || job.stage === "failed") {
      actions.append(
        createButton(
          document,
          "继续",
          (button) =>
            runAction(button, "正在恢复任务…", () =>
              paperJobManager.resume(job.id),
            ),
          "primary",
        ),
      );
    }
    if (job.stage === "completed" && job.outputAttachmentID) {
      actions.append(
        createButton(
          document,
          "打开双语 HTML",
          (button) =>
            runAction(button, "正在打开 HTML…", () =>
              openPaperAttachment(job.outputAttachmentID!),
            ),
          "primary",
        ),
        createButton(document, "重新生成 HTML", (button) =>
          runAction(button, "正在重新生成 HTML…", () =>
            paperJobManager.rerender(job.id),
          ),
        ),
        createButton(document, "修复结构并补译", async (button) => {
          const confirmed = Services.prompt.confirm(
            win as any,
            "修复结构并补译",
            "将合并检测到的跨页断句，并调用当前 LLM 补译受影响内容，随后更新原双语 HTML 附件。是否继续？",
          );
          if (!confirmed) return;
          await runAction(button, "正在修复结构并补译…", () =>
            paperJobManager.repairAndRetranslate(job.id),
          );
        }),
      );
    }
    actions.append(
      createButton(document, "定位原 PDF", () => {
        Zotero.getActiveZoteroPane().selectItem(job.source.attachmentID, true);
      }),
    );
    card.append(
      top,
      stageTrack,
      progressBar,
      messageLine,
      usage,
      error,
      diagnostics,
      actions,
    );
    return card;
  }

  async function refreshAll(): Promise<void> {
    try {
      [histories, jobs] = await Promise.all([
        loadAllHistory(),
        paperJobManager.list(),
      ]);
      updateSummary();
      render();
    } catch (error) {
      content.textContent = `工作台加载失败：${
        error instanceof Error ? error.message : String(error)
      }`;
      showToast("工作台数据加载失败", true);
    }
  }

  await refreshAll();
}
