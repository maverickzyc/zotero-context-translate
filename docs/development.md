# 开发说明

面向想要修改或调试这个插件的人。用户向的说明在 [README](../README.md)。

## 环境要求

- Node.js 20 或更高版本
- Zotero 8.0 – 9.0.\*；日常开发和验证使用 Zotero 9.0.6
- 一个独立的 Zotero 开发 profile（不要用日常 profile）

`.env`（不要提交）：

```
ZOTERO_PLUGIN_ZOTERO_BIN_PATH = /Applications/Zotero.app/Contents/MacOS/zotero
ZOTERO_PLUGIN_PROFILE_PATH = /path/to/zotero-dev-profile
```

## 常用命令

```bash
npm install
npm run build      # 构建 XPI → .scaffold/build/zotero-context-translate.xpi
npm run start      # 开发模式：构建 + 安装到 Zotero + 热重载（需要 .env）
npm run test:unit  # 63 个纯单元测试，几秒钟，不需要 Zotero
npm run test       # 在真实 Zotero 里跑集成测试（需要 .env）
npm run lint:check # prettier --check + eslint
npm run lint:fix
```

技术栈：TypeScript + esbuild（经 `zotero-plugin-scaffold`）+
`zotero-plugin-toolkit`，构建目标 Firefox 140，i18n 使用 Fluent。

## 目录结构

```
addon/                      插件资源，会被打包进 XPI
├── manifest.json           WebExtension manifest（strict_min 8.0 / max 9.0.*）
├── bootstrap.js            Zotero bootstrap 入口
├── prefs.js                默认首选项
├── dict/                   内置精简 ECDICT
├── content/                设置面板 XHTML、图标、论文模板
└── locale/{en-US,zh-CN}/   Fluent 语言文件

src/
├── index.ts                入口
├── addon.ts                Addon 类（状态、hooks、api）
├── hooks.ts                生命周期 + 编排
├── types.ts                共享接口
├── modules/
│   ├── context/            上下文引擎：PDF 取文、段落重建、分级、缓存、词典
│   ├── translate/          翻译层：LLM 服务、提示词、SSE 解析、术语表
│   ├── paper-translate/    整篇论文：解析、结构化、批量翻译、校验、渲染
│   └── ui/                 弹窗、工作台、历史、设置面板
└── utils/                  首选项、i18n、toolkit、window 辅助

test/                       mocha + chai 单元测试
docs/specs/                 设计文档
```

## 架构分层

1. **插件入口**（`bootstrap.js` → `hooks.ts`）注册 Reader 事件监听、管理生命周期
2. **上下文引擎**通过 `iframeWin.eval()` 从 pdf.js 取文（绕开跨 compartment
   沙箱），重建段落、自动分级上下文、按页缓存
3. **翻译层**构造带 `---` 分隔符的分级提示词，走 SSE 调用 LLM，
   按 token 预算注入术语
4. **UI 层**在 Zotero 主窗口（不是 reader iframe）里放固定定位的 div，
   以获得可靠的拖拽和消失行为

划词翻译的数据流：

```
选中文本 → renderTextSelectionPopup 事件
  → params.annotation.text 拿到选中文本
  → 查翻译缓存，命中就直接显示（带"缓存"标记）
  → 未命中：
    → iframeWin.eval() 提取页面文本
    → reconstructParagraphs() → resolveContext() 自动分级
    → lookupPhrase() 词典结果立即渲染
    → buildPrompt() 带 --- 分隔符 + 术语
    → streamTranslation() SSE 分块，按 --- 切分到译文区/解析区
    → 写入缓存和历史
```

## 关键技术决策

| 决策                                        | 原因                                                              |
| ------------------------------------------- | ----------------------------------------------------------------- |
| 用 `iframeWin.eval()` 取 PDF 文本           | 跨 compartment 沙箱阻止直接访问 pdf.js API（"Permission denied"） |
| 用 `params.annotation.text` 取选中文本      | Zotero 9 里 `getSelectedText(reader)` 返回 `[object Object]`      |
| 弹窗放在主窗口 document                     | reader iframe 的鼠标事件不会传播到 div 覆盖层                     |
| 提示词里用 `---` 分隔                       | 一次 LLM 调用即可在流中切分出译文区和解析区                       |
| 用 `mozInnerScreenX` 换算 `screenX/screenY` | 把 reader iframe 坐标转成主窗口 fixed 定位                        |
| Web API 从统一 scope 解析                   | 见下方 `runtime.ts` 说明                                          |

## 已知坑

1. **`text-extractor.ts` 使用未公开 API** ——
   `reader._iframeWindow.wrappedJSObject._reader._primaryView._iframeWindow.eval()`。
   Zotero 升级可能失效；官方 API 见 zotero/zotero#3373。

2. **跨 compartment 沙箱** —— pdf.js 在 content compartment，插件在特权
   compartment。`page.getTextContent()` 能调用，但结果无法跨边界返回。
   解决办法是把提取代码 eval 进 iframe，返回 JSON 字符串。

3. **弹窗拖拽** —— XUL `<panel backdrag>` 和 reader-doc 覆盖层都试过，不行。
   现在的方案是主窗口里的 fixed div + 坐标换算。

4. **SSE 重复回调** —— 收到 `[DONE]` 后 `SSEParser.finish()` 会二次调用
   `onDone`，用 `finished` 标志位挡掉。

5. **词典下载** —— ECDICT 源是 GitHub 上 65MB 的 CSV，插件下载后本地转 JSON。
   国内走 jsDelivr `fastly.` 子域作为 CDN 备用。

6. **设置面板 XHTML** —— 根节点必须是 `<vbox>`（不能是 `<html>`），标签用
   `value=""` 属性而不是 `data-l10n-id`，否则会报 "not well-formed XML"。

7. **`runtime.ts` 的 Web API 解析** —— Zotero 在不同平台和不同插件作用域里
   暴露 `fetch` / `AbortController` / `TextDecoder` 的方式不一致。两条规则：
   探测候选作用域时**绝不能抛异常**（`Services.appShell.hiddenDOMWindow`
   在没有隐藏窗口的平台上会抛 NS_ERROR_NOT_AVAILABLE，而不是返回 undefined），
   并且三个 API **要尽量来自同一个 realm**（一个 realm 创建的 AbortSignal
   会被另一个 realm 的 fetch 拒绝）。

## 测试

- `npm run test:unit` —— 63 个纯单测（段落检测、上下文分级、SSE 解析、
  术语表、提示词构造、论文结构化 / 校验 / 渲染、工作台模型等），不需要 Zotero。
- `npm run test` —— 在真实 Zotero 里跑 75 个测试，包含上面这些加上
  `test/startup.test.ts` 里的运行时集成用例（菜单注册、弹窗拖拽、首选项读写、
  模板 CSS 结构、运行时 Web API 等）。

CI 里 `unit` 任务是快速阻塞信号；`zotero` 任务下载的是 **Linux beta 频道**的
Zotero，既不是多数用户的平台也不是多数用户的构建，看它的失败时要先考虑
环境差异。

> 写集成测试时注意：scaffold 的上报会把失败对象 JSON 序列化，而
> `Error.prototype.message` 是不可枚举属性 —— 直接 `throw new Error(...)`
> 在 CI 里只会显示 `undefined`。请统一用 chai 断言，并把原始错误的
> name / message / stack 折进断言消息里。

## 发布

推送 `v*` 标签会触发 `Release` workflow：构建 XPI、创建 GitHub Release、
并把 `update.json` / `update-beta.json` 更新到 `release` 这个 pre-release 上，
Zotero 的自动更新就是读的这个清单。

## 提交约定

`feat:` | `fix:` | `refactor:` | `test:` | `docs:` | `chore:` | `release:`

代码和注释用英文；用户向文档用中文，技术文档用英文。所有 Zotero 内部 API
调用集中在 `text-extractor.ts`；DOM 元素一律用
`createElementNS("http://www.w3.org/1999/xhtml", tag)` 在主窗口上下文中创建。
