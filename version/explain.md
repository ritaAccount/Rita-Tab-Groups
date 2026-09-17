# `version/` — 版本信息

本目录记录 **Tab Groups 配置 schema**、**AI Skill 指南** 的演进，以及 **Marketplace 扩展发版 ↔ schema/Skill** 对照。  
**不参与扩展运行时读取**；给开发 / AI 做迁移对照、发版追溯与回滚查阅。

## 目录结构

```
version/
├── explain.md                 ← 本文件：版本约定总说明
├── releases.json              ← 扩展发版号 → configVersion / skillVersion（回滚必查）
├── tab-groups/                ← .vscode/tab-groups.json 的 schema 版本
│   ├── 1.0.0/
│   │   ├── changes.json
│   │   └── example.json
│   └── …
└── skill/                     ← AI 指南 / Skill 版本（AI_GUIDE_VERSION）
    ├── 1/
    └── …
```

| 线 | 版本号来源 | 文件夹 / 文件 | 当前版本 |
|----|------------|---------------|----------|
| 配置 schema | `src/data/fileEntryUtils.ts` → `CONFIG_VERSION` | `tab-groups/<semver>/` | 与 `CONFIG_VERSION` 一致 |
| AI Skill | `src/workspace/aiGuideUtils.ts` → `AI_GUIDE_VERSION` | `skill/<整数>/` | 与 `AI_GUIDE_VERSION` 一致 |
| 扩展发版 | `package.json` → `version`（仅 publish 时 bump） | `releases.json` 每条 `extension` | 与 Marketplace 已发版一致 |

每个 schema / Skill 版本文件夹**必须同时有** `changes.json` 与完整 `example`。

## 回滚 / 对照怎么查

1. 打开 **`version/releases.json`**，按 Marketplace 版本号（如 `1.1.2`）找到那一行。  
2. 看 `configVersion` → 打开 `version/tab-groups/<configVersion>/example.json` 与 `changes.json`。  
3. 看 `skillVersion` → 打开 `version/skill/<skillVersion>/` 下的 example 正文。  
4. **不要**用「第几次功能 commit」猜 schema；也**不要**假定 `package.json` 与 `CONFIG_VERSION` 同号。

## `releases.json` 写什么

| 字段 | 含义 |
|------|------|
| `extension` | Marketplace / `package.json` 版本 |
| `configVersion` | 该发版打进包时的 `CONFIG_VERSION` |
| `skillVersion` | 该发版打进包时的 `AI_GUIDE_VERSION` |
| `note` | 可选说明 |

**规则**：只追加新发版行；不改、不删已有行。维护者发版脚本在 **publish 成功后** 自动写入；手工发版也必须补记。

## `changes.json` 写什么

记录**这一 schema/Skill 版相对上一版**的变动（不是整仓 changelog，也不是发版列表）。

| 字段 | 含义 |
|------|------|
| `version` | 本版版本号 |
| `kind` | `tab-groups` 或 `skill` |
| `from` | 上一版版本号；首版为 `null` |
| `summary` | 一句话摘要 |
| `changes` | 字符串数组：本版要点 |
| `targets` | （仅 skill）写入工作区的路径列表 |

## `example` 写什么

| 线 | 内容 |
|----|------|
| `tab-groups/<ver>/example.json` | 该 schema 下**完整**的 `tab-groups.json` 示例 |
| `skill/<ver>/example.json` | 形态元信息 + 正文文件名 |
| `skill/<ver>/example*.md` | 当时写入工作区的**完整正文** |

## 规则（只追加）

1. **不改、不删**已有版本文件夹内容；**不改、不删** `releases.json` 已有发版行。  
2. `CONFIG_VERSION` 升高或 `tab-groups.json` 字段结构变了 → **新建** `tab-groups/<新版本>/`。  
3. `AI_GUIDE_VERSION` 升高或 Skill 约定变了 → **新建** `skill/<新版本>/`。  
4. Marketplace **成功发版后** → `releases.json` **追加**一行。  
5. 迁移或回滚：先查 `releases.json`，再读对应 example / `changes.json`。

## 与其它文档的关系

- 产品决策：`developer-record.md`  
- 用户用法：`README.md`；用户可见发版说明：`CHANGELOG.md`（列功能，**不替代** `releases.json`）  
- 贡献：`CONTRIBUTING.md`  
- 本目录回答：schema/Skill 相对上一版改了什么、完整长什么样、**某次 Marketplace 发版当时捆的是哪套结构**。
