# `version/` — 版本信息

本目录记录 **Tab Groups 配置 schema** 与 **AI Skill 指南** 的版本演进。  
**不参与扩展运行时读取**；给开发 / AI 做迁移对照与变更追溯。

## 目录结构

```
version/
├── explain.md                 ← 本文件：版本约定总说明
├── tab-groups/                ← .vscode/tab-groups.json 的 schema 版本
│   ├── 1.0.0/
│   │   ├── changes.json       ← 相对上一版的字段/行为变动（必有）
│   │   └── example.json       ← 该版本完整示例（必有）
│   ├── 1.1.0/
│   └── …
└── skill/                     ← AI 指南 / Skill 版本（AI_GUIDE_VERSION）
    ├── 1/
    │   ├── changes.json
    │   ├── example.json                 ← 元信息（format / targets / 文件索引）
    │   ├── example-tab-groups-ai.md     ← 当时完整手册
    │   └── example-tab-groups.cursor-rule.md
    ├── 2/
    │   ├── changes.json
    │   ├── example.json                 ← 元信息（format / target / file）
    │   └── example.SKILL.md             ← 当时完整 Skill 正文
    └── 3/
        ├── changes.json
        ├── example.json
        └── example.SKILL.md             ← 扩展 ID 改为 Rita.rita-tab-groups
```

| 线 | 版本号来源 | 文件夹 | 当前版本 |
|----|------------|--------|----------|
| 配置 schema | `src/data/fileEntryUtils.ts` → `CONFIG_VERSION` | `tab-groups/<semver>/` | 与 `CONFIG_VERSION` 一致 |
| AI Skill | `src/workspace/aiGuideUtils.ts` → `AI_GUIDE_VERSION`；模板注释 `tab-groups-ai-guide-version` | `skill/<整数>/` | 与 `AI_GUIDE_VERSION` 一致 |

每个版本文件夹**必须同时有** `changes.json` 与完整 `example`（tab-groups 用 `example.json`；skill 用 `example.json` 索引 + 完整正文文件）。

## `changes.json` 写什么

记录**这一版相对上一版**的小更新（不是整仓 changelog）。推荐字段：

| 字段 | 含义 |
|------|------|
| `version` | 本版版本号 |
| `kind` | `tab-groups` 或 `skill` |
| `from` | 上一版版本号；首版为 `null` |
| `summary` | 一句话摘要 |
| `changes` | 字符串数组：本版新增/删除/变更的要点 |
| `targets` | （仅 skill）本版写入工作区的路径列表 |

## `example` 写什么

| 线 | 内容 |
|----|------|
| `tab-groups/<ver>/example.json` | 该 schema 下**完整**的 `tab-groups.json` 示例（覆盖当时全部字段） |
| `skill/<ver>/example.json` | 该版形态元信息：`format`、`target(s)`、正文文件名 |
| `skill/<ver>/example*.md` | 当时会写入工作区的**完整正文**（手册 / Skill / rule） |

## 规则（只追加）

1. **不改、不删**已有版本文件夹里的历史内容。
2. `CONFIG_VERSION` 升高，或 `tab-groups.json` 字段结构变了 → **新建** `tab-groups/<新版本>/`，写入 `changes.json` **和** `example.json`。
3. `AI_GUIDE_VERSION` 升高，或 `media/tab-groups.skill.md` 约定变了 → **新建** `skill/<新版本>/`，写入 `changes.json` **和** 完整 example（`example.json` + 正文文件）。
4. 做迁移时：对比源/目标的 example，并阅读目标版的 `changes.json`；不要凭记忆猜字段。

## 与其它文档的关系

- 产品决策与实现过程写在 `developer-record.md`（公开）。
- 维护者本机敏感操作（PAT、发版脚本等）写在 `developer-record.private.md`（gitignore，不提交）。
- 用户用法写在 `README.md`。
- 本目录只回答：「某一版相对上一版改了什么」以及「该版完整长什么样」。
