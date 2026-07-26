import { config } from "../../../package.json";
import { getPaperTranslateOptions } from "./config";
import { paperJobManager } from "./job-manager";
import { canTranslatePaperItem } from "./source-resolver";
import { showTranslateWorkbench } from "../ui/workbench";

const MENU_IDS = [
  "context-translate-paper-library-menu",
  "context-translate-paper-tab-menu",
  "context-translate-paper-jobs-menu",
];

function privacyAccepted(): boolean {
  return Boolean(
    Zotero.Prefs.get(`${config.prefsPrefix}.paper.privacyAccepted`, true),
  );
}

function confirmPrivacy(): boolean {
  if (privacyAccepted()) return true;
  const accepted = Services.prompt.confirm(
    Zotero.getMainWindow() as any,
    "整篇论文翻译",
    "整篇论文翻译会把论文内容发送到当前配置的 LLM 服务。使用 MinerU 高保真模式时，PDF 文件也会发送到 MinerU。是否继续？",
  );
  if (accepted) {
    Zotero.Prefs.set(`${config.prefsPrefix}.paper.privacyAccepted`, true, true);
  }
  return accepted;
}

async function startForItem(item?: Zotero.Item): Promise<void> {
  if (!item || !canTranslatePaperItem(item) || !confirmPrivacy()) return;
  try {
    const job = await paperJobManager.start(item, getPaperTranslateOptions());
    showTranslateWorkbench({ tab: "jobs", jobID: job.id });
  } catch (error) {
    Services.prompt.alert(
      Zotero.getMainWindow() as any,
      "无法开始整篇论文翻译",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function registerPaperTranslateFeature(): void {
  Zotero.MenuManager.registerMenu({
    menuID: MENU_IDS[0],
    pluginID: config.addonID,
    target: "main/library/item",
    menus: [
      {
        menuType: "menuitem",
        l10nID: "context-translate-paper-menu",
        onShowing: (_event, context) => {
          context.setEnabled(
            context.items?.length === 1 &&
              canTranslatePaperItem(context.items[0]),
          );
        },
        onCommand: (_event, context) => {
          void startForItem(context.items?.[0]);
        },
      },
    ],
  });

  Zotero.MenuManager.registerMenu({
    menuID: MENU_IDS[1],
    pluginID: config.addonID,
    target: "main/tab",
    menus: [
      {
        menuType: "menuitem",
        l10nID: "context-translate-paper-menu",
        enableForTabTypes: ["reader/pdf"],
        onShowing: (_event, context) => {
          context.setEnabled(
            context.items.length === 1 &&
              canTranslatePaperItem(context.items[0]),
          );
        },
        onCommand: (_event, context) => {
          void startForItem(context.items[0]);
        },
      },
    ],
  });

  Zotero.MenuManager.registerMenu({
    menuID: MENU_IDS[2],
    pluginID: config.addonID,
    target: "main/menubar/tools",
    menus: [
      {
        menuType: "menuitem",
        l10nID: "context-translate-paper-jobs-menu",
        onCommand: () => {
          showTranslateWorkbench({ tab: "jobs" });
        },
      },
    ],
  });
}

export function unregisterPaperTranslateFeature(): void {
  for (const id of MENU_IDS) {
    try {
      Zotero.MenuManager.unregisterMenu(id);
    } catch {
      // Menu may not have been registered on older Zotero builds.
    }
  }
}
