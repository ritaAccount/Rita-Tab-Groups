<!-- tab-groups-ai-guide-version: 1 -->
# Tab Groups — AI 操作手册

本文件由扩展 **Tab Groups**（`Rita.tab-groups`）在激活时写入/更新。  
面向 **Cursor / Copilot / 其它 Agent**：用户用自然语言说需求时，**直接改配置完成**，不要只教用户点 UI。

---

## 1. 你要改哪些文件

| 文件 | 作用 |
|------|------|
| `.vscode/tab-groups.json` | 分组、文件、标记（游标/函数/字符匹配）、正则配置 |
| `.vscode/settings.json` → `tabGroups.shortcuts` | 快捷键（可选） |
| `.vscode/settings.json` → `tabGroups.display` | 显示偏好（可选） |

扩展会监听 `tab-groups.json` 的保存并刷新侧边栏。改完保存即可。

**约束**：当前仅支持**单根工作区**（一个文件夹打开）。`path` 一律为相对工作区根的路径（正斜杠）。

---

## 2. `tab-groups.json` 结构（schema `1.5.0`）

```json
{
  "version": "1.5.0",
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

无 `config` 且无 `configId` → 视为手动分组。

### 文件 `files[]`

| 字段 | 说明 |
|------|------|
| `path` | 相对路径，如 `src/index.ts` |
| `alias` | 侧边栏显示名；默认可用文件名 |
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
| `text` | 字符匹配 | `query`（跳转用，必填语义上） |

`line` / `column` 从 **0** 起算。同类型多条放在同一 `type` 的 `content` 数组里。

### 全局配置 `configs[]`

供多个分组 `configId` 引用，例如：

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

向 `groups` 追加：

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
2. 递归删掉该组及其子孙（含它们在别人 `children` 里的引用）  
3. 从 `groups` 数组移除

### 重命名分组

改对应 `group.name`。

### 添加文件到分组

向该组 `files` 追加（同组内 `path` 去重）：

```json
{
  "path": "src/foo.ts",
  "alias": "foo.ts",
  "branch": "<当前分支，可知则填>"
}
```

### 从分组移除文件 / 改别名

从 `files` 删掉对应项；或只改 `alias`。

### 添加游标 / 函数 / 字符匹配

在对应文件的 `markers` 里找到或新建该 `type` 的组，向 `content` 追加一项（记得 `branch` 若可知）。

### 删除 / 重命名标记

在对应 `content` 里删元素或改 `label`；某类型 `content` 空了就去掉该 `type` 组；`markers` 空了可删掉 `markers` 字段。

### 设为手动 / 内嵌正则 / 引用全局配置

- 手动：删掉 `config` 与 `configId`，或 `config: { "type": "manual" }`  
- 内嵌正则：`config: { "type": "regex", "regex": "你的正则" }`，并去掉 `configId`  
- 引用：设 `configId`，去掉 `config`；确保 `configs` 里有对应 `id`

### 「扫描」正则分组

扩展的「扫描文件」命令会按正则扫磁盘。你也可以：在工作区找出匹配 `regex` 的相对路径，写入该组 `files`（保留已有条目的 `alias`/`markers`/`branch`，新路径补默认 `alias`，可知则写 `branch`）。

### 显示与快捷键

改 `.vscode/settings.json`：

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
    "nextCursor": "ctrl+shift+]"
  }
}
```

| `groupTypeDisplayMode` | 含义 |
|------------------------|------|
| `label` | 「手动/正则」显示在分组名后（默认） |
| `hover` | 仅悬停显示 |
| `both` | 名称后与悬停都显示 |

快捷键写入 settings 后，用户若要立刻生效，可能还需在扩展设置页保存一次以同步到本机 `keybindings.json`；你改 settings 本身即可完成「配置层面」的修改。

---

## 4. 可选：执行扩展命令

在支持 `executeCommand` 的环境里也可调用（需单根工作区），例如：

- `tabGroups.createGroup` / `tabGroups.createSubGroup` / `tabGroups.deleteGroup` / `tabGroups.renameGroup`
- `tabGroups.addToGroup` / `tabGroups.removeFromGroup`
- `tabGroups.addCursor` / `tabGroups.addFunction` / `tabGroups.addText`
- `tabGroups.scanFiles` / `tabGroups.openSettings`
- `tabGroups.expandAll` / `tabGroups.collapseAll`（打开/关闭组内编辑器标签）

多数批量整理场景，**改 JSON 更稳、可复查**。

---

## 5. 对用户说话时的原则

1. 用户说「建个分组把这些文件放进去」「给这个函数加个标记」→ 直接改 `tab-groups.json`。  
2. 改前读现有 JSON，保持 `id` / `children` / `level` 一致，避免重复 `path`。  
3. `version` 保持与扩展一致（当前 `1.5.0`）；不要擅自降级。  
4. 不要把本手册里的示例路径当成用户仓库里一定存在的文件。
