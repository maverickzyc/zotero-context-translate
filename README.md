<div align="center">

<img src="addon/content/icons/icon.svg" width="88" alt="">

# Zotero Context Translate

**读英文文献时，划词看得懂语境，整篇读得下双语。**

一个为中文研究者设计的 Zotero 翻译插件：它不只翻译你选中的那几个词，
而是先把这句话所在的段落一起读进去，再让大模型给出符合上下文的译文和解释。

[![Release](https://img.shields.io/github/v/release/maverickzyc/zotero-context-translate?style=flat-square&color=CC2936)](https://github.com/maverickzyc/zotero-context-translate/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/maverickzyc/zotero-context-translate/total?style=flat-square)](https://github.com/maverickzyc/zotero-context-translate/releases)
[![Zotero](https://img.shields.io/badge/Zotero-8.0%20–%209.0-CC2936?style=flat-square)](https://www.zotero.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/maverickzyc/zotero-context-translate/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/maverickzyc/zotero-context-translate/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)](LICENSE)

简体中文 · [English](README.en.md)

</div>

<!--
截图占位：录一段 6~10 秒的 GIF（划词 → 词典秒出 → 大模型流式补充），
保存为 docs/images/demo-selection.gif，然后删掉这段注释、保留下面一行。
拍摄清单见 docs/images/README.md。

![划词上下文翻译演示](docs/images/demo-selection.gif)
-->

## 为什么会有这个插件

读英文论文时，真正卡住人的很少是"这个词什么意思"，而是"这个词在这句话里
是什么意思"。把选中的短语单独丢给翻译引擎，得到的往往是一个通顺但对不上
上下文的译文 —— 尤其是术语、指代和长从句。

所以这个插件做了两件事：

1. **翻译前先补上下文。** 选中内容后，插件会从 PDF 里重建它所在的句子和
   段落（段落级还会带上前后段），连同你的术语表一起交给大模型。
2. **不让你干等。** 本地离线词典先给出即时结果，大模型的语境解释随后流式
   补充进同一个浮窗。

在这之上，还可以把**整篇论文**转成一个可切换"英文 / 中文 / 双语"的单文件
HTML，并自动存回原来的 Zotero 条目 —— 相当于给这篇文献配了一份对照读本。

## 功能对比


|                | Zotero Context Translate                                      | 一般划词翻译插件 |
| -------------- | ------------------------------------------------------------- | ---------------- |
| 送给引擎的内容 | 选中文本 **+ 所在句/段 + 前后段**                             | 选中文本本身     |
| 结果呈现       | 离线词典即时结果 → 大模型流式补充                             | 等引擎返回       |
| 术语控制       | 按 Zotero 文库隔离的术语表，按正文命中注入                    | 通常没有         |
| 整篇论文       | 生成可切换语言的单文件 HTML，存回条目                         | 通常没有         |
| 翻译引擎       | OpenAI 兼容 API（DeepSeek / OpenRouter / Ollama / Claude 等） | 引擎选择更多     |

一句话：**它换来的是译文质量和长文阅读，代价是需要你自己配一个 LLM API。**

## 安装

1. 从 [Releases](https://github.com/maverickzyc/zotero-context-translate/releases/latest)
   下载 `zotero-context-translate.xpi`。
2. Zotero 里打开 **工具 → 插件**，点右上角齿轮 → **Install Plugin From File…**，
   选中刚下载的 XPI，重启 Zotero。
3. 打开 **设置 → Context Translate**，填入 DeepSeek 或其他 OpenAI 兼容服务的
   API 地址、密钥和模型。

安装后插件会通过 GitHub Releases 自动检查更新，不需要每次手动装。

<!--
截图占位：设置面板全貌，保存为 docs/images/preferences.png

![设置面板](docs/images/preferences.png)
-->

> **兼容性**：声明支持 Zotero 8.0 – 9.0.\*，日常开发和验证在 Zotero 9.0.6 上进行。
> 目前只支持 PDF 阅读器，EPUB 尚未支持。

### 关于费用

插件本身免费开源。真正产生费用的是你自己配的 LLM API：

- **完全免费的用法**：查词时选"仅本地词典"，全程不联网、不调用 API。
- **划词翻译**：每次几百到几千 token，DeepSeek 这类服务基本可以忽略不计。
- **整篇论文翻译**：一篇 20 页的论文通常是几万到十几万 token，请按你的服务商
  单价自行估算。MinerU 高保真解析另有其自身的配额规则。

## 主要功能

### 划词上下文翻译

选中文本后浮层会并排给出**查词**和**翻译**两个按钮，由你决定走哪条路，
不会因为你只选了一个词就自动改成查词。

- **查词** —— 先出本地词典结果（音标、词性、释义），再按设置补充大模型的
  语境解释。也可以设成"仅本地词典"，完全不调用 API。
- **翻译** —— 始终带上下文翻译。选中的是句子就提取所在段落；选中的是段落
  就再带上前后段，并额外给出衔接关系和核心论点。

支持流式输出、翻译缓存（同一文档同一页的相同文本直接命中）、历史记录，
以及按 Zotero 文库隔离的术语表。Zotero 9 的阅读器右键菜单里也有
"上下文查词 / 上下文翻译"两个入口。

<!--
截图占位：浮窗两栏（上译文 / 下解析），保存为 docs/images/popup.png

![翻译浮窗](docs/images/popup.png)
-->

### 整篇论文双语 HTML

在文库里右键文献条目或 PDF 附件，选择**生成双语 HTML**；PDF 阅读器标签页的
右键菜单里也有同样的入口。

生成的 HTML 是**单文件、自包含**的，语言切换用纯 CSS 实现（没有 JavaScript），
所以在 Zotero 自带的快照阅读器里也能正常切换。宽屏时切换按钮在正文左侧独立栏，
窄屏时退化成顶部静态栏，不会挡住 Zotero 的批注浮层。

处理流程大致是：解析 PDF → 整理成带稳定 ID 的结构化内容块 → 生成论文专属
术语表 → 并发翻译 → 校验 → 渲染 HTML → 作为 `text/html` 子附件导入原条目。

**解析模式**可以在设置里选：

| 模式          | 说明                                             | 会上传 PDF 吗 |
| ------------- | ------------------------------------------------ | ------------- |
| 自动          | 配了 MinerU Token 就走高保真，否则走纯文本       | 视情况        |
| MinerU 高保真 | 支持复杂排版、扫描件 OCR、图片、表格、公式       | **会**        |
| Zotero 纯文本 | 只用 Zotero 已有的全文索引，不保证图表和阅读顺序 | 不会          |

三套模板可选：`classic` / `minimal` / `magazine`。

<!--
截图占位：生成的双语 HTML 在 Zotero 里打开的样子（最好是"双语"模式），
保存为 docs/images/bilingual-html.png

![双语 HTML](docs/images/bilingual-html.png)
-->

### 工作台

从文库列表顶部搜索框左侧的按钮打开，或走**工具 → Context Translate 工作台**。

- **查词与翻译历史** —— 按单词 / 短语 / 句子 / 段落分类。单词记录会分别保存
  音标、词性、词典释义和大模型解释，这些字段都可以搜索，也支持复制、定位到
  原条目、删除。
- **整篇翻译任务** —— 展示解析、识别结构、生成术语、翻译、校验、渲染、保存
  附件的完整阶段，以及块进度、总体进度、错误和 token 用量。

任务是**按块保存**的，所以失败、暂停甚至 Zotero 重启之后都可以从中断的那个
阶段继续，已经译完的内容不会重译。每个任务还能展开"诊断记录"，看阶段事件和
脱敏后的错误栈，便于区分是 API、解析、翻译还是附件写入的问题。

已完成的任务可以：

- **重新生成 HTML** —— 直接用保存的译文检查点更新附件，不再调用 MinerU 或 LLM。
- **修复结构并补译** —— 针对跨页断句、未翻译的连接词等问题，只补译受影响的
  内容块，然后更新同一个 HTML 附件。

<!--
截图占位：工作台"整篇翻译任务"页签，最好有一个进行中的任务，
保存为 docs/images/workbench.png

![工作台](docs/images/workbench.png)
-->

### 术语表与离线词典

- 内置 483 条领域术语，可以按 Zotero 文库各自覆盖。
- 支持 CSV 导入导出，注入时按正文命中并遵守 token 预算。
- 词典内置 5 万条精简版 ECDICT；需要更全的可以在设置里下载 77 万条完整版。

### 支持的模型服务

任何 OpenAI 兼容的 `/chat/completions` 接口都可以用，设置里内置了
DeepSeek / OpenAI / OpenRouter / Ollama / Claude / 自定义 六个预设。
整篇翻译默认使用 `deepseek-v4-flash`、关闭 thinking mode、2 个并发批次。

## 常见问题

<details>
<summary><b>API Key 存在哪里？会不会被传出去？</b></summary>

存在 Zotero 本地首选项里，不会打包进插件、不会写进翻译历史、也不会进入仓库。
只有调用你自己配置的那个服务商时才会随请求发出。

</details>

<details>
<summary><b>我不想把 PDF 上传到第三方，可以吗？</b></summary>

可以。把解析模式设成 **Zotero 纯文本**，整个流程只使用 Zotero 已有的全文索引，
PDF 文件不会离开你的电脑（论文的文本内容仍然会发给你配置的 LLM）。
只有选择 MinerU 高保真解析时，PDF 才会上传到 MinerU。

</details>

<details>
<summary><b>能翻译成英文以外的语言吗？</b></summary>

目标语言在设置里可以改，默认是简体中文。提示词是围绕"英文学术文献 → 中文"
调优的，其他语言方向可以用，但效果没有专门验证过。

</details>

<details>
<summary><b>支持 EPUB 吗？支持 Zotero 7 吗？</b></summary>

都还不支持。目前只覆盖 PDF 阅读器，manifest 声明的兼容范围是 Zotero 8.0 – 9.0.\*。

</details>

<details>
<summary><b>整篇翻译跑到一半失败了怎么办？</b></summary>

不用重来。打开工作台找到那个任务，点"继续"，它会从中断的阶段接着跑，
已经译完的块不会重译。如果译文里出现跨页断句或漏译的连接词，
对已完成的任务点"修复结构并补译"。

</details>

<details>
<summary><b>可以完全离线用吗？</b></summary>

查词可以 —— 把查词模式设成"仅本地词典"即可。翻译不行，它依赖 LLM API。
如果你在本地跑 Ollama，把它配成自定义服务商也算是一种离线方案。

</details>

## 隐私与数据

- 划词翻译会把**选中文本及其上下文**发送到你配置的 LLM 服务商；整篇翻译会
  发送**论文正文**。
- 只有选择 MinerU 高保真解析时，PDF 文件本身才会上传到 MinerU；
  Zotero 纯文本模式不上传 PDF。
- 首次执行整篇翻译前会有确认提示。
- API Key 保存在 Zotero 本地首选项中，不会包含在插件包、翻译历史或公开仓库里。
- 使用第三方 API 时，其数据处理仍受对应服务商的隐私政策约束。

## 参与进来

- 问题与建议 → [GitHub Issues](https://github.com/maverickzyc/zotero-context-translate/issues)
- 开发环境、架构说明、测试方式 → [docs/development.md](docs/development.md)
- 贡献指南 → [CONTRIBUTING.md](CONTRIBUTING.md)
- 安全问题 → [SECURITY.md](SECURITY.md)
- 第三方组件与数据许可 → [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- 版本变更 → [CHANGELOG.md](CHANGELOG.md)

## License

[AGPL-3.0-or-later](LICENSE)
