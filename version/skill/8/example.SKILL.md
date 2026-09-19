---
name: tab-groups
description: >-
  Manages Rita Tab Groups (Rita.rita-tab-groups) by editing workspace
  .vscode/tab-groups.json and tabGroups.display / tabGroups.shortcuts.
  Use when the user asks in natural language to create, rename, delete, or nest
  file groups; add/remove files; add cursor/function/text markers; scan regex
  groups; or change Tab Groups display/shortcut settings.
---

<!-- tab-groups-ai-guide-version: 8 -->

# Rita Tab Groups — 项目 Skill

本文件由扩展 **Rita Tab Groups**（`Rita.rita-tab-groups`）在**工作区初始化/激活**时写入到：

`.cursor/skills/tab-groups/SKILL.md`

扩展升级指南版本后会自动覆盖更新（仅当版本号升高时）。

---

## 给用户：如何让 AI 用上这份 Skill

这就是一份 **Cursor Agent Skill**。装好扩展并打开本仓库后，一般无需再手动复制。

1. **确认文件存在**：看仓库里是否有 `.cursor/skills/tab-groups/SKILL.md`（没有则重载窗口或重新打开文件夹，让扩展激活一次）。
2. **直接对 AI 说话即可**，例如：
   - 「建一个叫前端的分组，把 `src/pages` 下的文件加进去」
   - 「给当前这个函数在 Tab Groups 里加个标记」
   - 「把显示设置改成分组类型只悬停显示」
3. 若 Agent 没自动选用，可在对话里 **@tab-groups** / 提到「Tab Groups skill」，或把本文件加进上下文。
4. 不要把本文件当普通笔记乱改结构；需要改行为时优先改 `.vscode/tab-groups.json` 或设置页。完整字段说明以扩展维护的本 Skill 为准。

其它编辑器（如 Copilot Chat）也可把本文件或同目录说明拖进对话，按下文直接改配置。

---

## 给 AI：原则

用户用自然语言管理「标签分组 / Tab Groups / 文件分组」时：

1. **优先直接改配置完成**，不要只教用户点侧边栏。
2. 主要改 `.vscode/tab-groups.json`；显示/快捷键改 `.vscode/settings.json` 的 `tabGroups.display` / `tabGroups.shortcuts`。
3. 保存后扩展会监听并刷新侧边栏。
4. **工作区**：单根或多根均可。多根时**每个根文件夹各自**一份 `.vscode/tab-groups.json`；同根文件路径相对**该根**、正斜杠。跨根文件写在**保存该分组的那份配置**里，并给条目加 `folder`（值为另一根的 `WorkspaceFolder.name`）。`line` / `column` 从 **0** 起算；`version` 保持 **`1.7.0`**。
5. 分组可选 `color`（预设：red/orange/yellow/green/teal/blue/purple/pink/gray）与 `icon`（Codicon 白名单，见扩展 `groupAppearanceUtils`）；缺省即默认文件夹图标、无着色。

---

## 1. 你要改哪些文件

| 文件 | 作用 |
|------|------|
| `.vscode/tab-groups.json` | 分组、文件、标记（游标/函数/字符匹配）、正则配置 |
| `.vscode/settings.json` → `tabGroups.shortcuts` | 快捷键（可选） |
| `.vscode/settings.json` → `tabGroups.display` | 显示偏好（可选） |

---

## 2. `tab-groups.json` 结构（schema `1.7.0`）

```json
{
  "version": "1.7.0",
  "groups": [],
  "configs": []
}
```

### 分组 `groups[]`（根组与子组平铺存放）

| 字段 | 说明 |
|------|------|
| `id` | 唯一字符串（可用 UUID） |
| `name` | 侧边栏显示名 |
| `level` | 根组 `0`，子组为父级 + 1 |
| `children` | 直接子分组的 `id` 列表 |
| `files` | 文件对象数组（不是纯字符串） |
| `config` | 可选，内嵌 `{ "type": "manual" }` 或 `{ "type": "regex", "regex": "..." }` |
| `configId` | 可选，引用 `configs[].id`；有 `config` 时优先用 `config` |
| `color` | 可选，预设色：`red` / `orange` / `yellow` / `green` / `teal` / `blue` / `purple` / `pink` / `gray` |
| `icon` | 可选，Codicon：`folder` / `bookmark` / `star` / `bug` / `flame` / `beaker` / `package` / `tools` / `heart` / `lightbulb` / `rocket` / `file-code` / `database` / `server` / `shield` |

无 `config` 且无 `configId` → 视为手动分组。

### 文件 `files[]`

| 字段 | 说明 |
|------|------|
| `path` | 相对路径，如 `src/index.ts`（相对 `folder` 所指根；无 `folder` 则相对配置所在根） |
| `alias` | 侧边栏显示名；默认可用文件名 |
| `folder` | 可选，多根时文件所属工作区文件夹名；省略 = 与配置同根 |
| `branch` | 可选，加入时的 Git 分支名 |
| `markers` | 可选，按类型分组的书签 |

### 标记 `markers[]`

```json
{
  "type": "cursor",
  "content": [
    { "line": 10, "column": 0, "label": "L11", "branch": "main" }
  ]
}
```

| `type` | 含义 | content 额外字段 |
|--------|------|------------------|
| `cursor` | 游标 | — |
| `function` | 函数 | `symbolName`、`symbolKind`（可选） |
| `text` | 字符匹配 | `query`（跳转用） |

同类型多条放在同一 `type` 的 `content` 数组里。

### 全局配置 `configs[]`

```json
{
  "id": "backend-regex",
  "type": "regex",
  "regex": ".*/server/.*\\.js$",
  "description": "后端 JS"
}
```

---

## 3. 常见操作（直接改 JSON）

### 新建根分组

```json
{
  "id": "<uuid>",
  "name": "分组名",
  "level": 0,
  "children": [],
  "files": []
}
```

### 新建子分组

1. 追加 `level = 父.level + 1` 的分组  
2. 把新 `id` 加进父分组的 `children`

### 删除分组

1. 从父的 `children` 去掉该 `id`（若有父）  
2. 递归删掉该组及其子孙  
3. 从 `groups` 数组移除

### 重命名分组

改对应 `group.name`。

### 添加文件到分组

同组内 `path` 去重后追加：

```json
{
  "path": "src/foo.ts",
  "alias": "foo.ts",
  "branch": "<当前分支，可知则填>"
}
```

### 从分组移除文件 / 改别名

从 `files` 删除对应项，或只改 `alias`。

### 添加游标 / 函数 / 字符匹配

在对应文件的 `markers` 里找到或新建该 `type` 的组，向 `content` 追加（可知则写 `branch`）。

### 删除 / 重命名标记

在对应 `content` 里删元素或改 `label`；某类型空了就去掉该组；`markers` 空了可删字段。

### 设为手动 / 内嵌正则 / 引用全局配置

- 手动：删掉 `config` 与 `configId`，或 `config: { "type": "manual" }`  
- 内嵌正则：`config: { "type": "regex", "regex": "..." }`，并去掉 `configId`  
- 引用：设 `configId`，去掉 `config`；确保 `configs` 里有对应 `id`

### 「扫描」正则分组

按该组 `regex` 找出工作区相对路径，写入 `files`（保留已有 `alias`/`markers`/`branch`，新路径补默认 `alias`）。

### 显示与快捷键

```json
{
  "tabGroups.display": {
    "markerJumpHintMode": "always",
    "markerJumpHintSeconds": 1,
    "showSourceBranch": true,
    "groupTypeDisplayMode": "label"
  },
  "tabGroups.shortcuts": {
    "addToGroup": "ctrl+shift+i",
    "removeFromGroup": "ctrl+shift+o",
    "createGroup": "ctrl+shift+u",
    "deleteGroup": "ctrl+shift+p",
    "addCursor": "ctrl+shift+l",
    "addFunction": "ctrl+shift+;",
    "addText": "ctrl+shift+'",
    "prevCursor": "ctrl+shift+[",
    "nextCursor": "ctrl+shift+]",
    "setGroupColor": "ctrl+alt+c",
    "setGroupIcon": "ctrl+alt+i"
  }
}
```

| `groupTypeDisplayMode` | 含义 |
|------------------------|------|
| `label` | 「手动/正则」显示在分组名后（默认） |
| `hover` | 仅悬停显示 |
| `both` | 名称后与悬停都显示 |

快捷键写入 settings 后，用户若要立刻全局生效，可能还需在扩展设置页保存一次以同步本机 `keybindings.json`；改 settings 本身即可完成配置层面修改。某键写成 `""` 表示**不绑定**（并解除扩展默认键）。

---

## 4. 可选：执行扩展命令

支持 `executeCommand` 时可调用（需已打开至少一个工作区文件夹），例如：

- `tabGroups.createGroup` / `tabGroups.createSubGroup` / `tabGroups.deleteGroup` / `tabGroups.renameGroup`
- `tabGroups.setGroupColor` / `tabGroups.setGroupIcon`
- `tabGroups.addToGroup` / `tabGroups.removeFromGroup`
- `tabGroups.addCursor` / `tabGroups.addFunction` / `tabGroups.addText`
- `tabGroups.scanFiles` / `tabGroups.openSettings`
- `tabGroups.expandAll` / `tabGroups.collapseAll`

多数批量整理场景，**改 JSON 更稳、可复查**。

---

## 5. 对用户说话时的原则

1. 用户说「建个分组把这些文件放进去」「给这个函数加个标记」→ 直接改 `tab-groups.json`。  
2. 改前读现有 JSON，保持 `id` / `children` / `level` 一致，避免重复 `path`。  
3. `version` 保持与扩展一致（当前 `1.7.0`）；不要擅自降级。  
4. 不要把示例路径当成用户仓库里一定存在的文件。
