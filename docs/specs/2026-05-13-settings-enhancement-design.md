# Settings & UX Enhancement — Design Spec

> 创建日期: 2026-05-13
> 状态: 已确认，待实现

## 1. 多模型预设

### 数据结构

```ts
interface LLMPreset {
  name: string; // "GPT-4o", "DeepSeek", "Ollama"
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: string; // stored as string for prefs compatibility
}
```

存储在 Zotero Prefs:

- `prefsPrefix.llm.presets` — JSON 字符串，`LLMPreset[]`
- `prefsPrefix.llm.activeIndex` — number，当前激活的预设索引

### 设置面板

列表显示所有预设，当前激活的用 ★ 标记。支持：添加、编辑、删除、设为激活。每个预设可展开编辑 name/baseUrl/apiKey/model/temperature。

### 弹窗集成

弹窗操作栏末尾显示当前模型名（如 `GPT-4o ▾`），点击弹出预设列表切换。切换后下次翻译使用新预设。

### 迁移

首次升级时，将现有单一配置（llm.baseUrl/apiKey/model/temperature）迁移为 presets 数组的第一个元素。

## 2. 词典下载

### 策略变更

XPI 不再捆绑 `addon/dict/ecdict-subset.json`（从打包中移除）。词典改为按需下载到 Zotero profile 目录。

### 下载选项

| 版本   | 词条数   | 大小  | 说明        |
| ------ | -------- | ----- | ----------- |
| 轻量版 | ~50,000  | ~4MB  | 学术高频词  |
| 完整版 | ~770,000 | ~30MB | ECDICT 全量 |

下载源：GitHub Release URL（可在设置中自定义镜像地址）。

### 设置面板

显示当前词典状态：

- "未安装" — 显示两个下载按钮
- "轻量版 (50,000 词)" — 显示"升级到完整版"按钮
- "完整版 (770,000 词)" — 显示已安装

下载时显示进度。文件保存到 `{profileDir}/context-translate-dict.json`。

### dictionary.ts 变更

加载路径从 `rootURI + dict/` 改为 `{profileDir}/context-translate-dict.json`。未安装时 lookupWord 返回 null（不阻塞 LLM 翻译）。

## 3. 触发方式设置

### 选项

- **自动翻译**（默认）：选中文本后自动触发，当前行为不变
- **右键菜单**：选中文本后不自动触发，用户右键 → "📖 上下文翻译" 触发

存储：`prefsPrefix.translate.triggerMode` — `"auto"` | `"contextmenu"`

### 实现

- `auto` 模式：保持现有 `renderTextSelectionPopup` 自动翻译逻辑
- `contextmenu` 模式：`renderTextSelectionPopup` 只捕获选中文本但不翻译；通过 `Zotero.Reader.registerEventListener("createAnnotationContextMenu", ...)` 注册右键菜单项 "📖 上下文翻译"，点击后触发翻译

### 设置面板

Radio group 选择触发方式。

## 4. 翻译缓存

### 缓存 Key

`${itemId}:${page}:${normalizedSelectedText}`

`normalizedSelectedText` = selectedText.trim().toLowerCase()

### 存储

内存 Map（与 page-cache 生命周期一致，文档关闭时清除）。

```ts
interface CacheEntry {
  level: ContextLevel;
  dictResult: DictEntry | null;
  llmResult: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
```

### 命中行为

1. 构建 cache key
2. 如果命中：
   - 直接显示词典结果（如有）
   - 直接显示 LLM 结果（不调用 API）
   - 弹窗标题栏显示 "缓存" 标签
   - "🔄 重新翻译" 按钮强制跳过缓存重新调用 API
3. 如果未命中：正常流程（词典 + LLM），完成后写入缓存

### 缓存失效

- 文档关闭：清除该文档的所有缓存
- 切换模型：不清除缓存（缓存带模型标识可选，MVP 不区分）
- 手动重试：重试结果覆盖旧缓存

## 5. 文件变更清单

| 文件                                     | 变更                                 |
| ---------------------------------------- | ------------------------------------ |
| `src/modules/translate/llm-service.ts`   | 从 presets 读取配置                  |
| `src/modules/context/dictionary.ts`      | 从 profile 目录加载，支持下载        |
| `src/modules/ui/popup.ts`                | 模型切换按钮、缓存标签               |
| `src/modules/ui/preferences.ts`          | 预设管理、词典下载、触发方式         |
| `addon/content/preferences.xhtml`        | 新增预设列表、词典区域、触发方式     |
| `addon/prefs.js`                         | 新增 presets/activeIndex/triggerMode |
| `src/hooks.ts`                           | 缓存逻辑、右键菜单注册、触发模式分支 |
| `src/modules/context/translate-cache.ts` | 新文件：翻译结果缓存                 |
