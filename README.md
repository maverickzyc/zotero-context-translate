# Zotero Context Translate

面向学术阅读的 Zotero 上下文翻译插件。当前主测试环境为 Zotero 9.0.6，
声明兼容 Zotero 8.0–9.0.x。它同时支持两种工作流：

- 在 PDF Reader 中选中词、句子或段落，结合上下文流式翻译和解释。
- 将整个英文 PDF 转换成可切换“英文 / 中文 / 双语”的单文件 HTML，并自动保存到原 Zotero 条目。

## 安装

1. 从 [Releases](https://github.com/maverickzyc/zotero-context-translate/releases/latest)
   下载最新的 `zotero-context-translate.xpi`。
2. 在 Zotero 中打开“工具 → 插件”，点击右上角齿轮，选择“Install Plugin From
   File…”，安装下载的 XPI，然后重启 Zotero。
3. 打开“设置 → Context Translate”，配置 DeepSeek 或其他 OpenAI 兼容服务。
   只有使用 MinerU 高保真解析时才需要额外填写 MinerU Token。

插件声明兼容 Zotero 8.0–9.0.x，当前主要在 Zotero 9.0.6 上开发和验证。

## 整篇论文双语 HTML

在 Zotero 文库中右键文献条目或 PDF 附件，选择“生成双语 HTML”。也可以在 PDF Reader 标签页的右键菜单中触发。

处理流程：

1. MinerU 高保真解析 PDF，或使用 Zotero 全文索引进行纯文本解析。
2. 将论文整理成带稳定 ID 的结构化内容块，并保守合并跨页或浮动图表打断的
   续句。
3. 从原 skill 内置的 483 条领域术语和当前 Zotero Library 术语中按正文命中，
   再生成论文专属短术语表；用户术语优先。
4. 使用 DeepSeek/OpenAI 兼容 API 并发翻译，只填写中文字段。
5. 检查所有可译块、引用占位符和图片资源。
6. 渲染自包含 HTML，并作为 `text/html` 子附件导入原条目。

任务按块保存，失败或暂停后可从“工具 → Context Translate 工作台”继续，
不会重译已经完成的内容。

## Context Translate 工作台

从 Zotero 文献列表顶部、搜索框左侧的工作台按钮打开统一面板；也可以使用
“工具 → Context Translate 工作台”：

- “查词与翻译历史”区分单词查词、短语翻译、句子和段落翻译。单词记录会分别
  保存音标、词性、本地词典释义与 DeepSeek 语境解释，并可搜索这些字段；同时
  支持复制、定位条目和删除记录。
- “整篇翻译任务”展示解析 PDF、识别结构、生成术语、翻译、校验、渲染 HTML
  和保存附件的完整阶段，以及块进度、总体进度、错误和 Token 用量。
- 任务运行时面板实时更新；暂停、失败或 Zotero 重启中断后会保留中断阶段，
  “继续”操作会立即显示恢复状态。
- 每个任务显示尝试次数和最近活动时间；展开“诊断记录”可查看阶段事件和
  已脱敏的错误栈，方便区分 API、解析、翻译与附件写入问题。

完成一次选中文本翻译后，也可以从翻译弹窗中的“工作台”按钮进入历史页签。
已完成的整篇任务可点击“重新生成 HTML”，直接使用保存的译文检查点更新原
Zotero 附件，不会再次调用 MinerU 或翻译 API。
如果旧任务存在跨页断句或未翻译的叙述式连接词，点击“修复结构并补译”；插件
只会调用当前 LLM 补译受影响内容块，再更新同一个 HTML 附件。

生成的 HTML 使用纯 CSS 语言切换：宽屏下按钮位于正文左侧独立栏，窄屏下改为
静态顶部栏，避免与 Zotero 的高亮批注浮层覆盖正文。

### 解析模式

- `自动`：配置了 MinerU Token 时使用高保真解析，否则使用 Zotero 纯文本。
- `MinerU 高保真`：支持复杂排版、扫描 OCR、图片、表格和公式；PDF 会上传到 MinerU。
- `Zotero 纯文本`：不上传 PDF，但不保证图片、公式、表格及复杂阅读顺序。

### DeepSeek 配置

在“设置 → Context Translate”中选择 DeepSeek，配置 API Key。内置默认模型为 `deepseek-v4-flash`，整篇翻译默认关闭 thinking mode，并使用 2 个并发批次。

## 选中文本上下文翻译

- 手动模式下，划词浮层始终并排显示“查词”和“翻译”两个按钮，不再根据
  选中的词数自动决定路线。
- “查词”：查询单个英文词时先显示本地词典，再按设置补充 DeepSeek 语境解释；
  也可以选择“仅本地词典”，完全不调用 API。选择短语后仍可主动请求 DeepSeek
  的语境解释，但本地词典只进行单词精确查询。
- “翻译”：始终执行上下文翻译，即使只选择了一个英文词也不会切换到查词。
- 句子：提取所在段落，给出翻译和逻辑角色。
- 段落：提取前后段，给出翻译、衔接关系和核心论点。
- 支持流式输出、翻译缓存、历史记录和按 Zotero Library 隔离的术语表。

划词浮层与翻译弹窗使用矢量图标；Zotero 9 Reader 右键菜单同时提供无 Emoji
的纯文字“上下文查词 / 上下文翻译”入口。

## 开发

```bash
npm install
npm run build
node --import=tsx node_modules/mocha/bin/mocha.js "test/*.test.ts" --ignore test/startup.test.ts
```

构建产物位于：

```text
.scaffold/build/zotero-context-translate.xpi
```

项目使用 TypeScript、`zotero-plugin-scaffold`、`zotero-plugin-toolkit` 和 Firefox 140 构建目标。

## 隐私

选中文本翻译会把选中文本与上下文发送到当前配置的 LLM 服务商；整篇翻译会
发送论文文本。只有选择 MinerU 高保真解析时，PDF 文件才会上传到 MinerU；
使用 Zotero 纯文本解析不会上传 PDF。插件会在首次执行整篇翻译前显示确认
提示。

API Key 保存在 Zotero 本地首选项中，不会包含在插件包、翻译历史或公开仓库
里。使用第三方 API 时，其数据处理仍受对应服务商的隐私政策约束。

## 反馈与贡献

- 问题与建议：[GitHub Issues](https://github.com/maverickzyc/zotero-context-translate/issues)
- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)
- 安全问题：[SECURITY.md](SECURITY.md)
- 第三方组件与数据许可：[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## License

本项目采用 [AGPL-3.0-or-later](LICENSE) 许可证。
