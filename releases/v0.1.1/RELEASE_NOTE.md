# v0.1.1 — Zotero 9 菜单兼容修复

> 2026-07-25

## 安装

Zotero 9 → Tools → Plugins，将 `zotero-context-translate-0.1.1.xpi`
拖入窗口，或使用 Plugins 窗口中的“Install Plugin From File”。

安装或升级后请重启 Zotero。

## 修复

- 修复文献条目右键菜单中“生成双语 HTML”显示为空白的问题。
- 修复 Tools 菜单中“论文翻译任务”显示为空白的问题。
- 菜单文本改用 Zotero 9 XUL/Fluent 所要求的 `.label` 属性。
- 新增真实 Zotero 进程集成测试，检查菜单标签已经加载且不为空。

## 兼容性

- 主测试版本：Zotero 9.0.6。
- 声明兼容范围：Zotero 8.0–9.0.x。
