# Contributing

感谢你改进 Zotero Context Translate。

## 开发环境

- Node.js 20 或更高版本
- Zotero 8.0–9.0.x；集成测试主要使用 Zotero 9.0.6

```bash
npm install
npm run lint:check
npm run build
npm test
```

`npm test` 会启动并连接本地 Zotero 测试实例，因此需要在 `.env` 中设置自己的
Zotero 可执行文件与测试 profile。不要提交 `.env`、API Key、访问令牌、个人
Zotero 数据或包含版权内容的测试论文。

## 提交变更

请先创建 Issue 描述问题或建议。Pull Request 应保持范围清晰，包含必要测试，
并说明对 Zotero 8/9 兼容性、网络请求和用户数据的影响。提交信息建议使用
`feat:`、`fix:`、`docs:`、`test:`、`refactor:` 或 `chore:` 前缀。

提交代码即表示你同意按本项目的 AGPL-3.0-or-later 许可证提供贡献。
