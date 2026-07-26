# v0.1.0 — 整篇论文双语 HTML

> 2026-07-25

## 安装

Zotero → Tools → Add-ons → ⚙️ → Install Add-on From File → 选择
`zotero-context-translate-0.1.0.xpi`。

要求：Zotero 8.0–9.x。

## 新能力

- 从 Zotero 文献条目、PDF 附件或 PDF Reader 标签页直接生成双语 HTML。
- 接入 DeepSeek V4 Flash 的 OpenAI 兼容接口，按稳定块 ID 并发翻译。
- 支持 MinerU V4 高保真解析，以及不上传 PDF 的 Zotero 纯文本模式。
- 保留原文、参考文献、引用、URL、DOI、代码、公式、图片和表格结构。
- 内置原 `paper-translate-html` skill 的 483 条术语，且 Zotero Library
  自定义术语优先。
- 支持任务暂停、失败重试、Zotero 重启后继续和 Token 用量查看。
- 生成 classic、minimal、magazine 三种自包含 HTML，并自动挂回原条目。

## 初次使用

1. 在 Zotero 设置 → Context Translate 中选择 DeepSeek 并填写 API Key。
2. 若需要图片、表格、公式或 OCR，填写 MinerU Token；否则选择 Zotero
   纯文本模式。
3. 在文献条目或 PDF 上右键 → “生成双语 HTML”。

首次运行会确认论文文本和 PDF 的外部发送范围。

## 验证

- TypeScript 编译通过。
- 44 项本地纯逻辑测试通过。
- 正式 XPI 构建通过。
