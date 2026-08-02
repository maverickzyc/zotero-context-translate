<!--
提交前请先跑一遍：
  npm run lint:check
  npm run test:unit
如果改动涉及 Zotero 运行时（菜单、弹窗、首选项、附件写入等），
请另外在本地 Zotero 上跑 npm run test。
-->

## 这个 PR 做了什么

<!-- 一两句话说明改动和动机。修了 issue 的话写上 Closes #123。 -->

## 影响面

- [ ] 改动了发往 LLM 的请求内容或提示词
- [ ] 改动了会上传到第三方（MinerU / LLM）的数据范围
- [ ] 改动了用户数据的存储格式（历史、任务检查点、术语表、首选项）
- [ ] 改动了 Zotero 8 / 9 兼容性相关的 API 调用
- [ ] 以上都没有

## 验证方式

<!--
写清楚你怎么确认它是对的：加了哪些测试、在哪个 Zotero 版本上手动验证了什么。
"跑通了"这种描述帮不上审阅者。
-->

- [ ] `npm run lint:check`
- [ ] `npm run test:unit`
- [ ] `npm run test`（Zotero 版本：）
- [ ] 手动验证（说明步骤：）
