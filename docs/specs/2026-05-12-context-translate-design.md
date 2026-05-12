# Zotero Context Translate — MVP 设计文档

> 创建日期: 2026-05-12
> 状态: 已确认，待实现

## 1. 概述

### 1.1 产品定位

一款独立的 Zotero 翻译插件，核心差异化能力是**上下文感知翻译**：选中文本时自动提取前后文，结合上下文通过 LLM 提供更准确的翻译和解释。

### 1.2 目标用户

阅读英文学术论文的中文用户（研究生、学者），需要理解专业术语和复杂句式。

### 1.3 市场空缺

现有最流行的翻译插件 zotero-pdf-translate 只翻译选中的原文，不提取上下文。其社区曾提出上下文感知需求（Issue #1138），但被作者关闭（标记为不计划实现）。

### 1.4 MVP 功能范围

| 功能 | 说明 |
|---|---|
| 上下文感知翻译 | 选词/选句/选段时自动提取对应级别的上下文，发送给 LLM |
| 术语表 (Glossary) | 用户可维护专业术语对照表，翻译时自动匹配注入 Prompt |
| 翻译历史 | 保存每次翻译记录，按文献关联，可回查 |
| 流式输出 | LLM 响应逐字渲染到浮窗，无需等待完整响应 |

## 2. 架构设计

### 2.1 四层架构

```
┌──────────────────────────────────────────────┐
│  ① Plugin Entry (bootstrap.js)               │
│     注册 Reader 事件监听                       │
├──────────────────────────────────────────────┤
│  ② Context Engine (核心引擎)                  │
│     Text Layer Extractor → Context Resolver   │
│     → Paragraph Detector → Page Cache         │
├──────────────────────────────────────────────┤
│  ③ Translation Layer (翻译层)                 │
│     Prompt Builder → LLM Service (SSE)        │
│     → Glossary Manager                        │
├──────────────────────────────────────────────┤
│  ④ UI Layer (界面层)                          │
│     Popup Panel → Preferences → History Store │
└──────────────────────────────────────────────┘
```

### 2.2 核心数据流

用户选词/选句 → Reader 事件触发 → Text Layer Extractor 提取当前页文本（命中缓存则跳过） → Context Resolver 根据选中长度自动分级 → Prompt Builder 拼接上下文 + 术语表 → LLM Service 流式请求 → Popup Panel 逐字渲染 → 完成后存入 History Store

## 3. Context Engine（上下文引擎）

### 3.1 自动分级策略

| 级别 | 触发条件 | 提取的上下文 | LLM 任务 |
|---|---|---|---|
| Level 1 (词汇) | 选中 ≤3 个词 | 整个句子 | 解释词义、词性、学术用法 |
| Level 2 (句子) | 4+ 个词且 ≤1 个句号 | 所在段落 | 翻译 + 句子在段落中的逻辑角色 |
| Level 3 (段落) | 包含 2+ 个句号 | 前后各一段 | 翻译 + 与前后文的衔接关系 |

### 3.2 文本层提取

从 PDF Reader iframe 获取 pdf.js 实例，调用 `page.getTextContent()` 获取 `TextItem[]`，执行文本重组：

1. 按 Y 坐标分行
2. 按 X 坐标排序行内元素
3. 检测大间距 → 段落分隔（`gap > avgLineHeight × 1.5`）
4. 检测多栏布局 → 按栏分组处理
5. 拼接为结构化文本 `{ paragraphs: string[] }`

### 3.3 缓存策略（延迟缓存 + 按需扩展）

- 首次选中某页文字时提取并缓存该页文本
- 缓存结构：`PageCache[documentId][pageNumber] → { paragraphs, rawText, timestamp }`
- 文档关闭时自动清除对应缓存
- 如需跨页上下文，按需加载相邻页（最多 ±1 页）

### 3.4 跨页处理

- 页尾不以句号结尾 → 加载下一页文本，拼接到当前段落尾部
- 页首不以大写字母或缩进开始 → 加载上一页文本，拼接到当前段落头部
- 最多扩展 ±1 页

### 3.5 句子边界检测

基于标点符号切分（`. ? ! ;`），排除常见缩写（"et al.", "Fig.", "e.g.", "i.e.", "vs.", "Dr.", "Prof."）和小数点（"p < 0.05", "3.14"）。

### 3.6 多栏检测

统计 TextItem 的 X 坐标分布，如果出现 2+ 个明显的 X 坐标聚类 → 判定为多栏。按栏分组后分别处理，避免跨栏拼接。MVP 优先支持常见双栏格式，复杂排版降级为页面级上下文。

## 4. Translation Layer（翻译层）

### 4.1 LLM Service

统一使用 OpenAI 兼容的 `/v1/chat/completions` 接口：

- 流式请求（`stream: true`，SSE `text/event-stream`）
- `temperature: 0.3`（学术翻译需要低随机性）
- `max_tokens: 1024`
- 兼容端点：OpenAI、DeepSeek、Ollama (localhost:11434/v1)、任意 OpenAI 兼容服务

用户可配置：Base URL、API Key、Model 名称、Temperature。

### 4.2 分级 Prompt 模板

**Level 1（词汇解释）**：
```
[System] 你是学术论文阅读助手。用户正在阅读英文学术论文，选中了一个词/短语。
请根据该词在句子中的具体语境，提供：
1. 中文翻译（在此语境下最准确的译法）
2. 词性和学术含义（一句话）
3. 在这个句子中为什么这样翻译（一句话）

[Glossary] （匹配到的术语表条目）
[User] 选中词: "..." / 所在句子: "..."
```

**Level 2（句子翻译）**：
```
[System] 你是学术论文翻译助手。用户选中了一个句子，并提供了所在段落作为上下文。
请提供：
1. 准确的中文翻译
2. 这句话在段落中的逻辑角色（引出论点/提供证据/总结/转折等，一句话）

[Glossary] （匹配到的术语表条目）
[User] 选中句子: "..." / 所在段落: "..."
```

**Level 3（段落翻译）**：
```
[System] 你是学术论文翻译助手。用户选中了一段文字，并提供了前后段落作为上下文。
请提供：
1. 完整的段落中文翻译
2. 与前文的衔接关系（一句话）
3. 本段的核心论点（一句话）

[Glossary] （匹配到的术语表条目）
[User] 前一段: "..." / 选中段落: "..." / 后一段: "..."
```

### 4.3 Glossary Manager（术语表管理）

**存储格式**：JSON 文件，按 Zotero Library 隔离，存储在 Zotero profile 目录下。

```json
{
  "entries": [
    { "term": "epistemological", "translation": "认识论的", "field": "philosophy", "note": "" }
  ]
}
```

**注入策略**：Token 预算制
- 翻译前扫描选中文本 + 上下文，不区分大小写做子串匹配
- 给术语表分配 ~800 token 预算（约 50-60 条术语）
- 匹配到多少注入多少，超出预算时优先保留出现在选中文本中的术语
- 用户可通过设置面板管理术语表，支持 CSV 导入/导出

### 4.4 Token 预算控制

| 级别 | 预估输入 tokens | 说明 |
|---|---|---|
| Level 1 | ~500 | 选中词 + 句子 + 术语 |
| Level 2 | ~1200 | 句子 + 段落 + 术语 |
| Level 3 | ~3000 | 段落 + 前后段 + 术语 |

超出预算时优先截断距离选中文本最远的内容。

## 5. UI Layer（界面层）

### 5.1 翻译浮窗 (Popup)

**触发方式**：
- 默认：文本选中后 300ms 延迟，在 Reader 选中弹窗中注入翻译按钮，点击按钮展开翻译浮窗
- 可选：自动模式（选中即翻译）

**浮窗内容**（根据级别不同）：
- Level 1：标签（词汇）+ 中文翻译 + 词性 + 语境解释 + 上下文引用
- Level 2：标签（句子）+ 原文 + 中文翻译 + 段落角色分析
- Level 3：标签（段落）+ 中文翻译 + 衔接关系 + 核心论点

**交互行为**：
- 流式逐字渲染，加载时显示脉冲光标
- 点击外部 / Esc / 新选中文本 → 关闭/替换浮窗
- 浮窗可拖拽移动
- 快捷操作：复制、加入术语表（Level 1）、重新翻译、打开设置

### 5.2 设置面板

通过 `Zotero.PreferencePanes.register()` 注册到 Zotero 设置中：

- **LLM 设置**：API Base URL、API Key、Model、Temperature
- **翻译设置**：源语言（默认自动检测）、目标语言（默认中文简体）、触发方式、自定义 Prompt
- **术语表管理**：当前条目数、导入 CSV、导出、编辑

### 5.3 翻译历史

**存储结构**（JSON 文件）：

```json
{
  "selected": "原文",
  "context": "上下文",
  "level": 1,
  "result": "翻译结果",
  "itemId": "zotero-item-id",
  "page": 5,
  "timestamp": 1715500000000
}
```

**访问方式**（MVP）：Zotero 主菜单 → Context Translate → 翻译历史。支持按文献筛选、按时间排序，可复制和删除单条记录。

## 6. 技术实现

### 6.1 技术栈

| 类别 | 选型 |
|---|---|
| 语言 | TypeScript |
| 打包 | esbuild → 单文件 JS |
| 构建工具 | zotero-plugin-scaffold |
| 辅助库 | zotero-plugin-toolkit (v5.1+), zotero-types |
| 国际化 | Fluent (.ftl) |
| 持久化 | Zotero Prefs + JSON 文件 |

### 6.2 目标兼容性

- Zotero 8+ (Firefox 140 ESR)
- manifest.json: `strict_min_version: "6.999"`, `strict_max_version: "9.*"`
- ESM 模块，原生 Promise，Fluent 国际化

### 6.3 Zotero 8/9 兼容要点

- 全部使用 `import/export` ESM 语法，禁止 .jsm
- 原生 Promise，禁止 Bluebird
- 使用 `Zotero.MenuManager.registerMenu()` 注册上下文菜单
- 使用 `ChromeUtils.defineLazyGetter` 替代 XPCOMUtils
- 按钮 label 通过 property 设置
- 偏好面板运行在隔离全局作用域

### 6.4 Reader API 访问

- `Zotero.Reader.registerEventListener("renderTextSelectionPopup", handler, pluginID)` 注入翻译按钮
- 选中文本通过内部路径获取：`reader._iframeWindow.wrappedJSObject._reader._primaryView._selectionRanges`
- pdf.js 实例通过 Reader iframe 访问

### 6.5 项目目录结构

```
zotero-context-translate/
├── addon/                         # 插件资源（打包进 XPI）
│   ├── manifest.json
│   ├── prefs.js
│   ├── locale/{en-US,zh-CN}/addon.ftl
│   └── content/preferences.xhtml
├── src/                           # TypeScript 源码
│   ├── index.ts                   # 入口
│   ├── hooks.ts                   # bootstrap 生命周期
│   ├── modules/
│   │   ├── context/               # Context Engine
│   │   │   ├── text-extractor.ts
│   │   │   ├── context-resolver.ts
│   │   │   ├── paragraph-detect.ts
│   │   │   └── page-cache.ts
│   │   ├── translate/             # Translation Layer
│   │   │   ├── llm-service.ts
│   │   │   ├── prompt-builder.ts
│   │   │   ├── stream-parser.ts
│   │   │   └── glossary.ts
│   │   └── ui/                    # UI Layer
│   │       ├── popup.ts
│   │       ├── history.ts
│   │       └── preferences.ts
│   └── utils/
│       ├── prefs.ts
│       └── locale.ts
├── typings/global.d.ts
├── docs/
├── package.json
├── tsconfig.json
├── zotero-plugin.config.ts
└── .gitignore
```

## 7. 技术风险与缓解

| 风险 | 级别 | 缓解措施 |
|---|---|---|
| Reader 内部 API 不稳定 | 高 | 封装为独立模块 (text-extractor.ts)，集中管理内部 API 调用 |
| 多栏/复杂排版段落检测不准 | 中 | MVP 优先支持双栏，复杂排版降级为页面级上下文 |
| SSE 流式解析兼容性 | 低 | 严格遵循 OpenAI SSE 规范，非标准格式通过 adapter 适配 |
