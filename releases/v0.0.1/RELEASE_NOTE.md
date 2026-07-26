# v0.0.1 — First Release

> 2026-05-14

## 安装

Zotero → Tools → Add-ons → ⚙️ → Install Add-on From File → 选择 `zotero-context-translate-0.0.1.xpi`

**要求**: Zotero 8.0+（已测试 Zotero 9）

## 功能

### 上下文感知翻译

- 选中单词：自动提取所在句子作为上下文，提供词义解释
- 选中句子：自动提取所在段落作为上下文，提供翻译 + 逻辑角色分析
- 选中段落：自动提取前后段，提供翻译 + 衔接关系 + 核心论点
- 两阶段渲染：词典速查（<1ms）+ LLM 上下文解读（流式输出）

### 离线词典

- 内置 ECDICT 轻量版（50,000 学术高频词）
- 支持在设置中下载完整版（770,000 词）
- 词条含音标、词性、中文释义

### LLM 服务

- 支持 OpenAI 兼容接口（SSE 流式输出）
- 内置预设：DeepSeek（默认）、OpenAI、OpenRouter、Ollama、Claude
- 可自定义 Base URL / API Key / Model / Temperature

### 设置与交互

- 选中自动翻译 / 右键菜单翻译 两种触发方式
- 翻译结果缓存（同文档同页同文本命中缓存，不重复调用 API）
- 弹窗支持拖拽、📌固定、✕关闭
- 翻译历史记录（📜 按钮查看最近 10 条）
- 术语表管理（CSV 导入/导出，翻译时自动匹配注入）

## 已知限制

- PDF 文本提取依赖 Zotero 内部 API（`reader._iframeWindow`），可能因 Zotero 更新而需要适配
- 复杂排版（三栏、图表穿插）的段落检测可能不准确
- 词典下载需要从 GitHub 获取 ~65MB CSV 并本地转换，网络不佳时可能失败
- Claude API 使用 Anthropic 原生接口时格式不完全兼容 OpenAI，建议通过 OpenRouter 使用
