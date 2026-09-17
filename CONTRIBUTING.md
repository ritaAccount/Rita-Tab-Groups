# 贡献指南

感谢参与 **Rita Tab Groups**。本仓库面向公众开发者：可 fork / 开分支开发功能并提 PR。

**本仓成功标准**：PR 能独立合入且不踩雷（文档按类型更新、不碰密钥与版本号抢跑）。

## 本仓边界

本仓只放：源码、产品行为说明、可协作 backlog、用户文档。

以下内容**不要**出现在本仓或 PR / Issue 中：

- Marketplace PAT、账号凭证
- 本机发版脚本与密钥文件
- 维护者未公开的内部优先级稿

发版与 `package.json` version bump 由维护者统一处理；PR 默认**不要改** version。

## 开发

```bash
npm install
npm run compile
```

在 VS Code / Cursor 中按 `F5` 打开 Extension Development Host 调试。

## 先读哪里（少踩雷）

| 你要… | 读 |
|-------|-----|
| 当前数据模型 / 命令 / 交互 | [`developer-readme.md`](./developer-readme.md) |
| 某行为为何这样定 | [`developer-record.md`](./developer-record.md) |
| 可认领的公开任务 | [`developer-mission-list.md`](./developer-mission-list.md) |
| schema / Skill 何时升版 | [`version/explain.md`](./version/explain.md) |
| 用户怎么用 | [`README.md`](./README.md) |
| 发了哪些版 | [`CHANGELOG.md`](./CHANGELOG.md) |

## 文档约定（按改动类型）

| 改动类型 | 需要更新 |
|----------|----------|
| 用户可见行为 | `README.md` + `developer-record.md` |
| 数据模型 / 命令 / 交互规格 | `developer-readme.md` + `developer-record.md` |
| `tab-groups.json` 结构或 `CONFIG_VERSION` | `version/tab-groups/<新版本>/` |
| AI Skill 约定或 `AI_GUIDE_VERSION` | `version/skill/<新版本>/` |
| 仅重构 / 排错 | `developer-record.md` 一行即可 |
| 认领并完成公开待办 | 从 `developer-mission-list.md` **删除**该条 |

三种版本线不要混用：`package.json`（Marketplace）≠ `CONFIG_VERSION`（配置 schema，当前见源码）≠ `AI_GUIDE_VERSION`（Skill）。细节见 `version/explain.md`。

## 提 PR

1. 基于最新 `main` 开分支（建议 `feature/...` 或 `fix/...`）。  
2. 说明动机与行为变化；附简短自测步骤。  
3. 按上表同步文档；不要提交密钥或本机发版相关文件。  
4. 不要在 PR 里升 Marketplace 版本号（除非维护者明确要求）。
