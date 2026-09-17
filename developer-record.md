# Tab Groups — 开发记录

> 记录各版本开发过程中人类与 AI 的**产品与实现**决策、澄清与 bugfix，供其他开发者 / AI 参考。  
> 产品需求与 API 说明见 [developer-readme.md](./developer-readme.md)。

---

## v1（MVP）

### v1 开发范围确认（2026-05）

| 项 | 决策 |
|----|------|
| 项目结构 | 代码直接放在仓库根目录，无子目录 |
| 显示名称 | Rita Tab Groups |
| 扩展标识 | `Rita.rita-tab-groups`（Publisher: Rita，package name: `rita-tab-groups`） |
| 界面语言 | 中文 |
| 交付范围 | 阶段 1–6（不含单元测试与 `vsce package` 打包） |
| 活动栏图标 | `$(list-selection)` |
| 工作区限制 | 仅单根；无工作区或多根时禁用 + 提示 |
| 删除分组 | 若全局配置无引用，弹窗询问是否删除 |
| 缺失文件 | 树视图中灰显 + 右键可移除 |
| 配置热重载 | 外部修改或保存 `tab-groups.json` 后自动 reload |
| 管理全局配置 | 直接打开 JSON 文件手动编辑，无 UI |

### 文档歧义澄清与修正

#### 歧义 1：「展开/折叠分组」的含义

**原描述（有误）**：
- readme §4.1 写「调用 TreeView 的 `reveal`…记忆展开状态」，易被理解为侧边栏树节点展开/折叠。

**实际产品语义（v1 定稿）**：
- **展开分组** = 一键**打开**该分组内所有文件（编辑器标签页）
- **折叠分组** = 一键**关闭**该分组内所有已打开的标签页
- 与侧边栏树节点的展开/折叠**无关**

**实现文件**：`src/groupEditorUtils.ts`（`openGroupFiles` / `closeGroupFiles`）

#### 歧义 2：「展开/折叠」的作用范围

**原描述（有误）**：
- 初版实现将展开/折叠放在插件顶栏（`view/title`），且作用于**所有分组**。

**实际产品语义（v1 定稿）**：
- 仅出现在**分组节点右键菜单**，只作用于**当前分组**
- 插件顶栏仅保留「新建分组」，不提供全局展开/折叠

#### 歧义 3：缺失文件的展示方式

**原描述（模糊）**：
- readme §6 写「灰显或跳过」，二选一不明确。

**v1 定稿**：灰显（禁用色图标 + 「（不存在）」描述），且保留节点、支持右键移除。

#### 歧义 4：删除分组时的全局配置

**原描述（模糊）**：
- readme §4.1 写「可询问是否删除（可选）」。

**v1 定稿**：必须弹窗询问，用户可选择「删除配置」或「保留配置」。

### 实现过程中遇到的问题

| 问题 | 原因 | 处理 |
|------|------|------|
| `tabGroups.expandAll` 报错需 `getParent` | 初版误用 `treeView.reveal()` 展开树节点 | 改为打开编辑器标签页方案，不再依赖 `reveal`；`getParent` 仍保留供树视图其他用途 |
| `uuid` 包类型冲突 | `@types/uuid` 与包自带类型冲突 | 改用 `crypto.randomUUID()` |

### v1 源码结构

```
src/
├── extension.ts          # 激活、配置监听、工作区校验
├── types.ts              # 数据类型
├── tabGroupsManager.ts   # JSON 读写与分组/配置 CRUD
├── treeProvider.ts       # 侧边栏树视图
├── commands.ts           # 全部命令
├── groupEditorUtils.ts   # 组内文件批量打开/关闭
└── workspaceUtils.ts     # 工作区与路径工具
```

配置持久化路径：`.vscode/tab-groups.json`

本地调试：在 VS Code 中打开本项目 → **F5** → 在新窗口打开单根工作区文件夹测试。

### v1 未包含（阶段 7 / v2）

- 单元测试（Mocha）
- `vsce package` 打包与 Marketplace 发布
- 文件移动/重命名自动同步路径
- 拖拽、快捷键、分组颜色等（见 readme §9）


## v1.1
在侧边栏视图工具栏添加“自定义快捷键”按钮（使用 view/title 菜单）。

实现 tabGroups.customizeShortcuts 命令：

创建一个 QuickPick 或自定义 Webview 对话框。

显示“加入分组”和“取消分组”两行，右侧显示当前快捷键（从 workspace.getConfiguration().get('tabGroups.shortcuts') 读取，若无则显示默认值）。

用户点击某行时，调用 vscode.window.showInputBox 并监听原始按键事件（通过 onDidChangeValue 无法直接获取按键组合，需要使用原生 DOM 事件？复杂。推荐使用 vscode.window.showInputBox({ prompt: '按下快捷键组合...' }) 并配合全局按键钩子？太麻烦。简单做法：弹出第二个 QuickPick 列出常用组合让用户选择，但这不符合“录入快捷键”。鉴于 API 限制，可以实现一个简化版：弹出输入框让用户输入字符串如 ctrl+shift+g，然后验证格式。这样可以满足基本需求。

验证格式合法性（正则匹配 (ctrl|cmd|shift|alt|opt)+\+[a-z0-9] 等）。

冲突检测：使用 vscode.commands.getCommands? 不准确。可以读取 keybindings.json 或使用 vscode.commands.resolveKeybinding？没有直接方法。因此简化为：提示“请确保快捷键未与其他命令冲突”，并提供一个“检查冲突”按钮，尝试执行 vscode.commands.getKeybinding（不公开 API）。或者不提供实时冲突检测，仅在用户保存时弹窗提醒。

保存用户设置：将新的快捷键组合写入 tabGroups.shortcuts 配置，并显示信息：“请手动将以下内容添加到 keybindings.json: ...”。

最终开发设置：
1、对话框形式：Webview（可做得更像设置页，开发量更大）
2、快捷键录入方式：Webview 按键捕获
3、默认快捷键：加入分组：ctrl+shift+i、取消分组ctrl+shift+o
4、保存后是否立刻生效：自动写入 keybindings.json
5、冲突检测：不做
6、配置作用域：工作区（.vscode/settings.json），存在这个文件写进去，不存在就加载插件的时候就创建，然后快捷键填默认的
7、工具栏按钮显示条件：自定义快捷是插件内部的功能，始终显示
8、配置结构：
{
  "tabGroups.shortcuts": {
    "addToGroup": "ctrl+shift+g",
    "removeFromGroup": "ctrl+shift+u"
  }
}
9、还有疑问直接问，不要自己决定

### v1.1 实现记录（2026-05）

| 项 | 决策 |
|----|------|
| 对话框 | Webview（`src/shortcutsWebview.ts` + `media/shortcuts.*`） |
| 录入方式 | Webview 按键捕获 |
| 默认快捷键 | 加入分组 `ctrl+shift+i`、取消分组 `ctrl+shift+o` |
| 配置存储 | 工作区 `.vscode/settings.json` → `tabGroups.shortcuts` |
| keybindings 同步 | 写入**用户** `keybindings.json`（VS Code 不支持工作区级 keybindings 文件） |
| 冲突检测 | 不做 |
| 工具栏按钮 | `view/title` 始终显示（无 `workspaceFolderCount` 限制） |
| 保存前置条件 | 保存时需单根工作区；无工作区时可打开 Webview 预览，但不能保存 |

**新增源码**：

```
src/shortcutUtils.ts      # 配置读写、格式校验、keybindings.json 同步
src/shortcutsWebview.ts   # Webview 面板与命令注册
media/shortcuts.css
media/shortcuts.js        # 按键捕获逻辑
```

**激活时行为**：若工作区 `.vscode/settings.json` 中无 `tabGroups.shortcuts`，写入默认值并同步到用户 `keybindings.json`。

**已知限制**：同步 `keybindings.json` 时使用 JSON 重写，文件中已有注释可能在首次同步后丢失。

### v1.1 功能优化（2026-05）

| 项 | 决策 |
|----|------|
| 取消分组 · 全部分组 | QuickPick 首项「全部分组」，一次性从所有包含该文件的分组中移除 |
| 新建 / 删除分组快捷键 | 可自定义；默认新建 `ctrl+shift+u`、删除 `ctrl+shift+p` |
| 删除分组（快捷键触发） | 无侧边栏选中时弹出 QuickPick 选择要删除的分组 |

**实现**：`TabGroupsManager.removeFileFromAllGroups()` + `tabGroups.removeFromGroup` 命令 QuickPick 扩展；`ShortcutSettings` 扩展 `createGroup` / `deleteGroup`；Webview 与 keybindings 同步一并更新。

3、有问题先问清楚再进行

### v1.1 实现记录 — 文件别名（2026-05）

| 项 | 决策 |
|----|------|
| 语义 | 仅侧边栏显示别名，不修改磁盘 |
| 数据结构 | `files: [{ path, alias }]`；默认 `alias` 为文件名 |
| 多分组同名路径 | 可各自不同；重命名时若路径存在于多个分组，询问是否同步所有组别 |
| 入口 | 文件右键 →「重命名」 |
| 展示 | `label`=alias；`description`/`tooltip`=完整相对路径 |
| 正则扫描 | 覆盖列表时保留当前组内已有路径的 alias |
| 配置版本 | `tab-groups.json` 增加 `version`；低于 1.1.0 或无版本时自动迁移并保存 |

**新增源码**：`src/fileEntryUtils.ts`（迁移、别名工具）

**未包含（留待 v1.1 下一阶段）**：嵌套分组（平行组 + level + children id 数组；新建/删除仍根级；批量打开/关闭含子组）

### v1.1 实现记录 — 嵌套分组（2026-05）

| 项 | 决策 |
|----|------|
| 存储 | 所有分组平行存放在 `groups[]`；每组含 `level`、`children`（子组 id 数组） |
| 树展示 | 根级 `level === 0`；展开时按 `children` id 加载子组，再列本层 `files` |
| 子组与文件 | 同一分组可同时有 `children` 与 `files` |
| 正则配置 | 跟随当前组，与子组无关 |
| 新建根分组 | 顶栏 / 快捷键 `createGroup` → `level: 0` |
| 新建子分组 | 分组 inline「＋」/ 右键「新建子分组」→ `level = parent.level + 1` |
| 删除 | 级联删除所有子孙组；快捷键删除仅选根级分组 |
| 批量打开/关闭 | 递归包含所有子分组内的文件 |

**新增源码**：`src/groupHierarchyUtils.ts`

**迁移**：无 `level` / `children` 的旧配置自动补 `level: 0`、`children: []` 并保存

---

### v1.1.1 实现记录 — 拖拽移动文件（2026-05）

| 项 | 决策 |
|----|------|
| 操作 | 侧边栏中将文件节点拖拽到目标分组 |
| 行为 | 从源分组移除，加入目标分组（保留 alias）；目标已有同路径则仅移除源分组中的项 |
| 多选 | 支持一次拖拽多个文件节点 |
| 放置目标 | 仅分组节点（含空分组、子分组） |

**实现**：`TreeDragAndDropController` + `TabGroupsManager.moveFilesToGroup()`

### v1.1.1 实现记录 — 拖拽移动分组（2026-08）

| 项 | 决策 |
|----|------|
| 操作 | 侧边栏中将分组节点拖拽到目标分组 |
| 行为 | 整棵子树 reparent（含子孙组与组内文件）；从旧父 `children` 移除，加入新父 `children`，递归更新 `level` |
| 防环 | 禁止拖入自身或自身子孙；已是目标直接子组则无操作 |
| 多选 | 支持一次拖拽多个分组节点 |
| 放置目标 | 仅分组节点 |

**实现**：`GROUP_DRAG_MIME` + `TabGroupsManager.moveGroupToParent()` + `groupHierarchyUtils.updateGroupLevels()`

### v1.1.1 Bugfix 记录（2026-08）

| Bug | 根因 | 修复 |
|-----|------|------|
| 文件夹无法拖到另一文件夹 | v1.1.1 仅实现文件拖放；`handleDrag` 过滤掉 `GroupTreeItem`，拖拽数据未写入 `DataTransfer`；`TabGroupsManager` 缺少 reparent API | 新增 `GROUP_DRAG_MIME`、`moveGroupToParent()`、`updateGroupLevels()` / `isDescendantOf()`；整棵子树随被拖分组迁移 |
| 分组 inline「＋」创建根分组 | `package.json` inline 菜单误绑 `tabGroups.createGroup` 且无 `viewItem` 限制；`createGroup` 命令无树节点上下文，始终 `level: 0` | inline 改绑 `tabGroups.createSubGroup`，限 `group` / `groupRegex`；顶栏与快捷键仍用 `createGroup` |

**涉及文件**：`src/treeProvider.ts`、`src/tabGroupsManager.ts`、`src/groupHierarchyUtils.ts`、`package.json`

### v1.1.1 实现记录 — 文件存在性缓存（2026-08）

| 项 | 决策 |
|----|------|
| 背景 | 树展开时对组内每个文件串行 `stat`；全量 `refresh()` 后已展开分组会重复检查，分组/文件量大时变慢 |
| 方案 | 内存缓存（方案 B）：同一路径在失效前只 `stat` 一次 |
| 并行 | 单组内多文件用 `Promise.all` 并行查询（与缓存叠加） |
| 接入点 | `treeProvider.getChildren`（树灰显）、`groupEditorUtils.openGroupFiles`（批量打开） |
| 失效 · 全量 | 工作区切换、`deactivate`、无效工作区时 `clear()` |
| 失效 · 按路径 | 监听工作区 `create` / `delete` / `rename`，对变更路径 `invalidate` |
| 刷新策略 | `treeProvider.refresh()` / 配置热重载**不清缓存**（磁盘未变则复用）；仅当变更路径出现在分组配置中时才 `refresh()` 更新灰显 |
| 无关文件变更 | 工作区其他文件增删改只失效缓存项，不触发整树刷新 |

**新增源码**：`src/fileExistenceCache.ts`（`FileExistenceCache` + 单例 `fileExistenceCache`）

**改动文件**：`src/extension.ts`（`setupWorkspaceFileWatcher`）、`src/tabGroupsManager.ts`（`containsFilePath()`）、`src/treeProvider.ts`、`src/groupEditorUtils.ts`

**未包含（留待后续）**：拖放/单组变更时的局部 `fire(element)` 刷新；工作区全量文件索引（方案 C）

### v1.1.1 杂项修复（2026-08）

| 项 | 说明 |
|----|------|
| `extension.ts` 激活错误提示 | `showErrorMessage` 第二参数不能传 `error` 对象；改为将 `Error.message` 拼入提示字符串 |

### v1.1.1 Bugfix 记录 — 子分组内文件无法拖放（2026-08）

| Bug | 根因 | 修复 |
|-----|------|------|
| 子分组内文件无法拖放 | 拖放仅用自定义 JSON MIME，未注册 VS Code 官方 `application/vnd.code.tree.tabgroupsview`；嵌套树节点拖放需通过 `DataTransferItem.value` 保留 `TreeElement` 实例；`handleDrop` 仅接受 `GroupTreeItem` 为目标，拖到文件行上无效 | 改用官方 tree MIME + `text/uri-list`；`handleDrag` 写入源节点数组；`handleDrop` 从 `transferItem.value` 解析 `FileTreeItem` / `GroupTreeItem`；支持以 `FileTreeItem` 为放置目标（解析为其所属分组）；`FileTreeItem` 设置 `resourceUri`；视图开启 `canSelectMany` |

**涉及文件**：`src/treeProvider.ts`、`package.json`

### v1.1.2 实现记录 — 添加游标（2026-08）

| 项 | 决策 |
|----|------|
| 入口 | 侧边栏文件右键「添加游标」；编辑器内快捷键（默认可在设置页「快捷键」中配置，默认 `ctrl+shift+l`） |
| 前置条件 | 文件已在分组中；编辑器打开该文件且光标在目标行（树节点触发时同理） |
| 多分组 | 同一文件在多个分组时，快捷键触发 QuickPick 选择目标分组 |
| 记录内容 | 保存 `line` / `column`（0-based） |
| 打开行为 | 单击文件 / 展开分组批量打开时跳转到记录行 |
| 展示 | `description` / `tooltip` 追加 `· L42` |
| 数据结构 | `GroupFileEntry` 扩展 `line?`、`column?`；配置版本 `1.2.0` |

**新增源码**：`src/fileLocationUtils.ts`

### v1.1.2 Bugfix 记录 — 文件拖放仍无效（2026-08）

| Bug | 根因 | 修复 |
|-----|------|------|
| 文件拖到分组仍无效 | 树 MIME 写错为 `tabgroupsview`（应为 `tabGroupsView`）；`resourceUri` 被移除后无法启动拖放；`DataTransferItem` 用 JSON 字符串在同树拖放中丢失 | 修正 MIME 大小写；恢复 `resourceUri`（不设 `text/uri-list`）；文件 payload 用对象 `value` 传递；树节点 `id` 改为 `file:<groupId>::<path>` 便于解析；`getTreeTransferItem` 遍历所有 tree MIME |

**涉及文件**：`src/treeProvider.ts`

---
### v1.1.1 实现记录 — 设置页（左分类 + 右内容）

| 项 | 决策 |
|----|------|
| 入口 | 侧边栏标题栏改为「设置」齿轮图标（`tabGroups.openSettings`），替换原「自定义快捷键」键盘按钮 |
| 布局 | Cursor Settings 风格：左侧分类列表，右侧当前分类内容 |
| 分类 | 「通用」（默认）+「快捷键」；通用可打开 `tab-groups.json` 的 groups / configs |
| 快捷键 pane | 复用原 Webview 录入/保存/恢复默认逻辑与 `media/shortcuts.*` 按键捕获 |
| 命令 | 删除 `tabGroups.customizeShortcuts`，统一走 `tabGroups.openSettings` |

**新增源码**：`src/settingsWebview.ts`、`media/settings.css`、`media/settings.js`

**删除源码**：`src/shortcutsWebview.ts`（逻辑迁入 `settingsWebview.ts`）

---

### v1.1.3 实现记录 — 多游标 cursors[]（2026-09）

| 项 | 决策 |
|----|------|
| 存储 | `cursors: [{ line, column, label }]`；去掉顶层 `line`/`column`；配置 schema `1.3.0` |
| 迁移 | 旧单点 `line`/`column` → 一条 cursor（label 默认 `L{n}`） |
| 内存 | 直接改数组，保存写回 JSON（不做链表） |
| 树 | 文件可展开为游标子节点；单击文件跳 `cursors[0]`；单击游标跳该条 |
| 添加 | 追加；删除/重命名在游标节点右键 |
| 快捷键 | `prevCursor`/`nextCursor` 默认 `ctrl+shift+[` / `]`；设置页可改 |
| 通用设置 | 「配置版本更新」：比较 `tab-groups.json` 的 `version` 与 `CONFIG_VERSION`，落后则 `upgradeConfigIfNeeded` |

**涉及文件**：`types.ts`、`fileEntryUtils.ts`、`fileLocationUtils.ts`、`tabGroupsManager.ts`、`treeProvider.ts`、`commands.ts`、`shortcutUtils.ts`、`settingsWebview.ts`、`package.json`、`media/*`

---

### v1.1.4 实现记录 — markers 统一书签（2026-09）

| 项 | 决策 |
|----|------|
| 存储（修订后） | `markers: [{ type, content: [{ line, column, label, ... }] }]`；schema 仍为 `1.4.0`（覆盖示例，不升版） |
| type | `cursor` \| `function` \| `text`（字符匹配 / 模糊定位） |
| content 字段 | 公共：`line`/`column`/`label`；`function` 另有 `symbolName`/`symbolKind`；`text` 另有 `query` |
| 迁移 | 旧扁平 `markers[{type,line,...}]`、`cursors[]`、单点 line → 分组 `content[]` |
| 树 | 文件 → 类型组（游标/函数/匹配）→ 标记；`MarkerTypeTreeItem` + `MarkerTreeItem`；删/重命名按 `type + contentIndex` |
| 添加 | `addCursor` / `addFunction` / `addText`（选区或词 → query，跳转含模糊子序列） |
| 上一/下一 | 展平全部 content 后按 line 循环 |
| 跳转提示 | 独立 `StatusBarItem`；设置页「显示」可配：一直显示（默认）/ 显示秒数 / 关闭（`tabGroups.display`） |
| 快捷键 | `addText` 默认 `ctrl+shift+'` |

**涉及文件**：`types.ts`、`displaySettingsUtils.ts`、`fileEntryUtils.ts`、`fileLocationUtils.ts`、`extension.ts`、`tabGroupsManager.ts`、`treeProvider.ts`、`commands.ts`、`shortcutUtils.ts`、`settingsWebview.ts`、`package.json`、`media/settings.*`、`media/shortcuts.*`、`version-backup.json`、`README.md`、`developer-readme.md`

---

### 显示配置 — 标记左下角提示（2026-09）

| 项 | 决策 |
|----|------|
| 设置页 | 左侧分类「显示」；三页统一 Setting Row（左文右控，`pane-inner` max-width） |
| 交互 | 下拉选模式；仅 `timed` 时出现「显示时长」行；**改完即存**；恢复默认立即写回 |
| 项 | 「标记左下角显示」：一直显示 / 显示秒数 / 关闭；「显示来源分支」（默认开，见 schema 1.5.0 记录） |
| 默认 | `always`（一直显示） |
| 存储 | 工作区 `.vscode/settings.json` → `tabGroups.display` |
| 实现 | `displaySettingsUtils.ts`；跳转读配置；保存 `off` 时立即隐藏状态栏项 |

---

### 示例目录补全（2026-09）

| 项 | 决策 |
|----|------|
| 目的 | `example/` 对照安装/激活后产生的配置，便于对照字段，不作为运行时读取路径 |
| 文件 | `explain.md`（路径对照 + 字段说明）；`tab-groups.json`（schema 1.4.0 完整示例）；`settings.json`（shortcuts + display 默认值）；`keybindings.json`（扩展写入用户 keybindings 的条目） |
| 与 bk | `tab-groups.json` 内容对齐 `version-backup.json` 的 `1.4.0`，不另升 schema |

**涉及文件**：`example/*`、`developer-readme.md`、`README.md`

---

### 源码按功能分目录（2026-09）

纯重构，不改产品行为。`src/` 由平铺改为功能目录；`extension.ts` 留在 `src/` 根，避免改 `package.json` 的 `main`。

| 目录 | 职责 | 文件 |
|------|------|------|
| `src/` | 扩展入口 | `extension.ts` |
| `src/data/` | 类型、JSON 持久化、文件条目 / 嵌套分组 | `types.ts`、`tabGroupsManager.ts`、`fileEntryUtils.ts`、`groupHierarchyUtils.ts` |
| `src/workspace/` | 单根工作区与文件存在性缓存 | `workspaceUtils.ts`、`fileExistenceCache.ts` |
| `src/tree/` | 侧边栏树、命令、批量打开/关闭、标记跳转 | `treeProvider.ts`、`commands.ts`、`groupEditorUtils.ts`、`fileLocationUtils.ts` |
| `src/settings/` | 设置页、快捷键、显示配置 | `settingsWebview.ts`、`shortcutUtils.ts`、`displaySettingsUtils.ts` |

历史记录中的旧路径（如 `src/treeProvider.ts`）保持原样，指当时文件位置。目录约定见 `src/explain.md`。

**`explain.md` 同步（同日补充）**：改某个文件夹里的文件时，若该文件夹已有 `explain.md`，必须更新到与现状一致；改 `src/` 划分时还要更新 `src/explain.md`。没有则不必强行新建；新建功能文件夹时一并写上。

**涉及文件**：`src/explain.md`、`src/**`、`developer-readme.md`、`.cursor/rules/tab-groups.mdc`、`.cursor/rules/docs-maintenance.mdc`、`CLAUDE.md`、`AGENTS.md`

---

### v1.1.1 — 来源分支记录（schema 1.5.0）（2026-09）

| 项 | 决策 |
|----|------|
| 动机 | 同一行在不同分支内容可能不同；记录添加时的分支，便于对照 |
| schema | `CONFIG_VERSION` → `1.5.0`；`version-backup.json` **追加** `1.5.0`（不改旧 bk） |
| 存储 | 文件条目 `GroupFileEntry.branch?`；标记 `FileMarkerItem.branch?`（可选；旧数据无此字段仍可读） |
| 写入时机 | 加入文件、扫描新增文件、添加游标/函数/字符匹配时读取当前 Git 分支并写入 |
| 分支来源 | 优先 `vscode.git` API，失败回退 `git rev-parse`（`workspace/gitBranchUtils.ts`） |
| 显示设置 | `tabGroups.display.showSourceBranch`，默认 `true`；设置页「显示」开关，改完即存 |
| 侧边栏 | 开启时 description 前缀截断分支名；tooltip 首行完整「分支：…」 |
| 右键 | 不单独提供「来源分支」菜单项（悬停树节点即可查看） |
| 升级 | 旧配置缺 `branch` 不补写；仅升 `version` |

**涉及文件**：`types.ts`、`fileEntryUtils.ts`、`tabGroupsManager.ts`、`gitBranchUtils.ts`、`displaySettingsUtils.ts`、`treeProvider.ts`、`commands.ts`、`settingsWebview.ts`、`extension.ts`、`package.json`、`media/settings.*`、`version-backup.json`、`example/*`、`README.md`、`developer-readme.md`、`src/explain.md`

---

### 来源分支交互调整 — 去掉右键菜单项（2026-09）

| 项 | 决策 |
|----|------|
| 原因 | 悬停/旁注已能看到分支，右键「来源分支」重复 |
| 行为 | 删除 `tabGroups.showSourceBranch` 命令与菜单；保留记录 `branch` 与侧边栏显示开关 |

**涉及文件**：`package.json`、`commands.ts`、`treeProvider.ts`、`displaySettingsUtils.ts`、`settingsWebview.ts`、`extension.ts`、删除 `sourceBranchMenuUtils.ts`、文档

---

### 显示配置 — 分组类型显示位置（2026-09）

| 项 | 决策 |
|----|------|
| 设置 | `tabGroups.display.groupTypeDisplayMode`：`label`（名称后，默认）/ `hover`（仅悬停）/ `both`（都显示） |
| 内容 | 「手动」「正则」「引用：…」等 `getGroupLabelSuffix` 文案 |
| 交互 | 设置页「显示」下拉，改完即存；改后刷新侧边栏树 |

**涉及文件**：`types.ts`、`displaySettingsUtils.ts`、`treeProvider.ts`、`settingsWebview.ts`、`media/settings.js`、`package.json`、`example/settings.json`、文档

---

### 激活时写入 AI Skill（2026-09）

| 项 | 决策 |
|----|------|
| 目的 | 用户可用自然语言让 Agent 完成几乎全部 Tab Groups 操作（改 JSON / settings） |
| 产物 | `.cursor/skills/tab-groups/SKILL.md`（标准 Cursor 项目 Skill） |
| 模板 | `media/tab-groups.skill.md`；文首「给用户」说明如何启用，后文「给 AI」操作手册 |
| 版本 | 注释 `tab-groups-ai-guide-version`；仅当工作区文件缺失或版本落后时覆盖；变更见 `version/skill/<n>/changes.json` |
| 时机 | `initializeShortcutSettings`（激活与切换工作区时） |
| 不再写 | `.cursor/rules/tab-groups.mdc`、`.vscode/tab-groups-ai.md`（改以 Skill 为单一入口） |

**涉及文件**：`media/tab-groups.skill.md`、`workspace/aiGuideUtils.ts`、`settingsWebview.ts`、`src/explain.md`、`README.md`、`developer-readme.md`、`example/explain.md`、`example/tab-groups.SKILL.md`

---

### version/ 备份命名与 Skill 快照（2026-09）

| 项 | 决策 |
|----|------|
| 目录 | 统一放在 `version/` |
| 改名 | `version-backup.json` → `version/tab-groups-backup.json`（内容只搬迁，不改已有 schema key） |
| Skill bk | 新增 `version/tab-groups-skill-backup.json`；key = `AI_GUIDE_VERSION`（`1` 为旧手册+rule，`2` 为 Cursor Skill） |
| 约定 | `version/explain.md`；`AGENTS.md` / `CLAUDE.md` / docs-maintenance 规则同步 |

**涉及文件**：`version/*`、`AGENTS.md`、`CLAUDE.md`、`.cursor/rules/docs-maintenance.mdc`、`src/explain.md`、`developer-readme.md`

---

### version/ 改为每版本独立文件夹（2026-09）

| 项 | 决策 |
|----|------|
| 说明 | 版本约定集中在 `version/explain.md` |
| 结构 | `version/tab-groups/<semver>/`、`version/skill/<n>/`；去掉整包 `*-backup.json` |
| 每版必有 | `changes.json`（相对上一版变动）**与**完整 `example`（tab-groups 用 `example.json`；skill 用索引 + 正文文件） |
| 规则 | 只追加新文件夹；不改已有版本目录内容 |

**涉及文件**：`version/**`、`AGENTS.md`、`CLAUDE.md`、`.cursor/rules/docs-maintenance.mdc`、`src/explain.md`、`developer-readme.md`

---

### 侧边栏节点搜索（2026-09）

| 项 | 决策 |
|----|------|
| 目标 | 按已有记录节点的**名称**快速查找（分组 / 文件别名与文件名 / 标记） |
| 位置 | 「标签分组」标题下方搜索条（`tabGroupsSearchView` Webview）；树视图改名为「分组」 |
| 交互 | 对齐 VS Code 搜索框：输入框 + 右侧 **模糊** / **精准** / **设置**；设置展开包含/排除文件夹（相对工作区的文件夹，不是树节点） |
| 匹配 | 模糊：小写后字符按顺序出现；精准：小写后包含完整查询串；不区分大小写 |
| 文件夹过滤 | 仅有查询词时生效；约束文件节点及其标记；分组名命中仍显示该组，子文件仍过文件夹过滤 |
| 持久化 | `tabGroups.search`（mode / include / exclude）写入工作区 settings；查询与历史在 `workspaceState` |
| 空结果 | 树视图 `message`：「未找到匹配的节点」 |

### 搜索条交互（2026-09-08）

| 项 | 决策 |
|----|------|
| 收起留白 | 搜索与分组放进同一个 `tabGroupsView` Webview，不再用第二条视图「分组」；收起设置后面板高度为 0，列表贴住搜索条 |
| 展开动画 | 设置用 `max-height` 过渡，完整露出包含/排除行，同时把下方分组列表推开 |
| 搜索框提示 | 占位仍为「搜索 (↑↓ 历史)」；鼠标停在框上（或聚焦）提示 Enter 写入历史 |
| 文件夹规则 | 「只搜索这些文件夹…」等说明改为输入框悬停提示，对齐 VS Code files to include |
| 树缩进 | 层级左边距不能用行内 `style`（Webview CSP 会丢掉）；改用 `data-depth` + CSS，每层 16px |
| 树图标 | 分组/标记用 Codicon；文件走当前 `workbench.iconTheme`（Seti 等），与资源管理器同类图标 |

**涉及文件**：`package.json`、`src/tree/searchView.ts`、`src/tree/searchFilter.ts`、`src/tree/treeProvider.ts`、`src/settings/searchSettingsUtils.ts`、`src/extension.ts`、`src/data/types.ts`、`media/search.*`、`example/settings.json`、文档

---

### `.vscodeignore` 打包排除（2026-09-16）

| 项 | 决策 |
|----|------|
| 保留 | `README.md`、`package.json`、编译产物 `out/**`、运行时 `media/**`（含 `tab-groups.skill.md`） |
| 排除 | 源码与 TS 配置、`example/`、`version/`、开发文档（`developer-*`、`AGENTS.md`、`CLAUDE.md`）、`.cursor/`、`.git/`、`node_modules` 等 |

**涉及文件**：`.vscodeignore`

### 发布：README 相对链接与 repository（2026-09-16）

| 项 | 决策 |
|----|------|
| 原因 | `vsce publish` 因 README 中 `./developer-readme.md` 等相对链接且无法解析仓库而失败；这些开发文档也不进 VSIX |
| 处理 | 用户 `README.md` 去掉「开发者文档」一节；`package.json` 增加 `repository.url`（GitHub HTTPS） |

**涉及文件**：`README.md`、`package.json`

### MIT 许可证（2026-09-16）

| 项 | 决策 |
|----|------|
| 许可 | MIT；根目录 `LICENSE`，`package.json` 字段 `"license": "MIT"` |
| 版权 | Copyright (c) 2026 Rita（与 Marketplace 发布者一致） |

**涉及文件**：`LICENSE`、`package.json`

### Marketplace 改名：Rita Tab Groups（2026-09-16）

| 项 | 决策 |
|----|------|
| 原因 | `name`/`displayName` 须全局唯一；`tab-groups` / 「Tab Groups」已被 `usama8800.tab-groups` 占用 |
| name | `rita-tab-groups` → 扩展 ID `Rita.rita-tab-groups` |
| displayName | `Rita Tab Groups`（活动栏 / 设置分类同名） |
| Skill | `AI_GUIDE_VERSION` → `3`；新建 `version/skill/3/` |

**涉及文件**：`package.json`、`package-lock.json`、`aiGuideUtils.ts`、`media/tab-groups.skill.md`、`example/tab-groups.SKILL.md`、`version/skill/3/`、`version/explain.md`、`README.md`、`developer-readme.md`

### 用户 README 双语重写（2026-09-16）

| 项 | 决策 |
|----|------|
| 结构 | 同一 `README.md`：顶部短引 + 锚点切换；完整 **English** 与 **中文** 两节 |
| 文风 | 强调「关标签≠丢文件 / 项目地图 vs 布局会话」；功能表写全（嵌套、标记、搜索、设置、Skill、限制、FAQ） |
| Marketplace | `package.json` `description` 改为更贴卖点的一句英文 |

**涉及文件**：`README.md`、`package.json`

### Marketplace 扩展图标（2026-09-16）

| 项 | 决策 |
|----|------|
| 文件 | `media/icon.png`（用户提供的 1024 JPG 转成 **256×256 PNG**） |
| 声明 | `package.json` → `"icon": "media/icon.png"`；`galleryBanner` 深色 `#1a1d21` |
| 发布 | 无需单独网页上传；`vsce publish` 打进 VSIX 后 Marketplace 自动显示 |
| 注意 | 须 PNG（勿 SVG）；勿被 `.vscodeignore` 排除；活动栏 Codicon 与 Marketplace 图标无关 |

### 图标四角倒圆（2026-09-16）

| 项 | 决策 |
|----|------|
| 处理 | 从原 1024 JPG 导出透明 PNG，圆角半径约 **26%** 边长；四角透明 |
| 产物 | 覆盖 `media/icon.png`（**256×256** PNG） |

**涉及文件**：`media/icon.png`

**涉及文件**：`media/icon.png`、`package.json`

---

### 配置导入 / 导出（2026-09-16）

| 项 | 决策 |
|----|------|
| 目标 | 跨项目 / 备份分享分组配置；支持部分分组 |
| 入口 | 设置「通用」导出/导入；命令 `tabGroups.exportConfig` / `importConfig`；分组右键 `exportGroup` |
| 导出 | 全部，或多选分组（自动含子树 + 被引用的 `configs`）；右键仅当前子树 |
| 部分导出 | 父未入选时，选中分组在导出包内升为根级并重算 `level` |
| 文件格式 | 与 `.vscode/tab-groups.json` 同构（`version` / `groups` / `configs`） |
| 导入 | **合并**（默认）：新 UUID，作为新根级加入；**替换**：确认后整文件覆盖 |
| schema | 不升高 `CONFIG_VERSION`（仍为 `1.5.0`）；扩展版本 `1.1.3` |

**涉及文件**：`src/data/importExportUtils.ts`、`tabGroupsManager.ts`、`src/settings/importExportCommands.ts`、`settingsWebview.ts`、`media/settings.js`、`src/tree/commands.ts`、`package.json`、文档

---

### 一键工作集（2026-09-17）

| 项 | 决策 |
|----|------|
| 产品依据 | 对照 CodeGroup / vs-tab-groups：缺「把当前打开标签 / Git 变更收成地图」 |
| 命令 | `createGroupFromOpenEditors` / `addOpenEditorsToGroup` / `createGroupFromGitChanges` |
| 入口 | 命令面板；侧边栏标题 `…` 菜单（`view/title` → `1_workspace`） |
| 打开标签 | `tabGroups` 中 `TabInputText` / Diff 的 modified / Notebook；仅工作区 `file`；去重保序 |
| Git 变更 | `git status --porcelain --untracked-files=all`；rename 取新路径 |
| 命名 | 打开标签默认「打开的标签 MM-DD HH:mm」；Git 默认「Git 变更 \<branch\>」 |
| 批量写入 | `TabGroupsManager.addFilesToGroup` 一次写盘 |
| 版本 | 扩展 `1.1.4`；schema 仍 `1.5.0` |

**涉及文件**：`src/workspace/workingSetUtils.ts`、`workingSetParseUtils.ts`、`tabGroupsManager.ts`、`commands.ts`、`package.json`、`src/explain.md`、文档

---

### 复制分组为 AI 上下文（2026-09-17）

| 项 | 决策 |
|----|------|
| 产品依据 | VirtualTabs 等「一键 LLM 上下文」；人把整组贴进 Chat，少漏文件 |
| 命令 | `tabGroups.copyGroupAsAiContext` |
| 入口 | 分组右键；命令面板（需先选中分组） |
| 模式 | QuickPick：**路径 + 文件内容**（推荐）/ **仅路径列表** |
| 范围 | 分组子树去重文件（同打开组内文件） |
| 格式 | Markdown；内容模式按扩展名围栏语言；内容含 \`\`\` 时自动加长围栏 |
| 保护 | 单文件 >200KB / 二进制 / 缺失 → 跳过并注明；总长 ≥400KB 状态栏提醒 |
| 版本 | 扩展 `1.1.5`；schema 仍 `1.5.0` |

**涉及文件**：`src/workspace/aiContextFormatUtils.ts`、`aiContextUtils.ts`、`commands.ts`、`package.json`、文档

---

### 嵌套 Git 仓库选择（2026-09-17）

| 项 | 决策 |
|----|------|
| 问题 | 父目录打开、前后端各有 `.git` 时，在父根 `git status` 失败 |
| 发现 | 优先 VS Code Git 扩展 `repositories`；否则检测工作区根 + 浅层扫描子目录（深 2，跳过 node_modules 等） |
| 选择 | 多个仓库 QuickPick 可多选；单个直接用 |
| 路径 | 各仓 porcelain 路径经 `mapRepoPathToWorkspace` 转为相对工作区根 |
| 提示 | 无仓库 / 无变更 / 取消 分开文案 |
| 版本 | 扩展 `1.1.6` |

**涉及文件**：`gitRepoPathUtils.ts`、`gitRepoUtils.ts`、`workingSetUtils.ts`、`commands.ts`、`package.json`、文档

---

### 维护者敏感材料迁出（2026-09-17）

| 项 | 决策 |
|----|------|
| 本仓 | 不保留 PAT、本机发版脚本；公开文档不具名引用维护者仓外材料的路径或仓库名 |
| 发版 | 由维护者在仓外流程完成；贡献者 PR 不负责 Marketplace 发布 |

**涉及文件**：`.gitignore`、公开文档去掉凭证与发版脚本引用

### 工程边界 P0（2026-09-17）

| 项 | 决策 |
|----|------|
| 贡献入口 | 本仓新增 `CONTRIBUTING.md`（本仓边界、文档按类型更新、PR 不抢 version） |
| mission-list | 删除「已完成」节，只保留未完成可协作待办 |

**涉及文件**：`CONTRIBUTING.md`、`developer-mission-list.md`

### 工程边界续（2026-09-17）

| 项 | 决策 |
|----|------|
| 成功标准（本仓） | PR 可独立合入且不踩雷 |
| 知情隔离 | 公开文档不写维护者仓外仓库名、私有文件名或 secrets 路径 |
| 文档规则 | `docs-maintenance` 按改动类型勾选，不再默认全量同步 |
| 当前真相 | `developer-readme` 抬头为规格入口，§2 与 `types.ts` 对齐 |
| 发版说明 | 本仓新增 `CHANGELOG.md`；README / CONTRIBUTING 互链 |
| mission-list | 只留可协作项；探索性 idea 不放公开待办 |

**涉及文件**：`CONTRIBUTING`、`CHANGELOG`、`developer-readme`、`developer-mission-list`、`README`、本机 `.cursor/rules`



## 多根工作区（2026-09）

| 项 | 决策 |
|----|------|
| 配置 | 每个 `WorkspaceFolder` 各自 `.vscode/tab-groups.json`；路径仍相对本根；**不升** `CONFIG_VERSION` |
| 树 UI | 多根顶层按文件夹分区（scope）；单根不额外加层 |
| 操作 | 按文件 uri / 选中 scope 归属目标根；禁止跨根拖放分组/文件 |
| when | `workspaceFolderCount >= 1` |
| Skill | `AI_GUIDE_VERSION` → 4；每根各写一份 Skill |

**涉及**：`workspaceUtils`、`tabGroupsWorkspace`、`tabGroupsManager`、`treeProvider`、`commands`、`extension`、`package.json`、`version/skill/4/`



## 分组颜色 / 图标（2026-09）

| 项 | 决策 |
|----|------|
| schema | `CONFIG_VERSION` → `1.6.0`；`Group.color` / `Group.icon` 可选 |
| 色板 | 固定 id：red/orange/yellow/green/teal/blue/purple/pink/gray |
| 图标 | Codicon 白名单（folder/bookmark/star/bug/…），非任意字符串 |
| UI | 分组右键「设置分组颜色 / 图标」；侧边栏 Codicon 着色 |
| Skill | `AI_GUIDE_VERSION` → 5 |

**涉及**：`groupAppearanceUtils`、`types`、`tabGroupsManager`、`treeProvider`、`commands`、`package.json`、`version/tab-groups/1.6.0/`、`version/skill/5/`

## 分组颜色 / 图标快捷键（2026-09）

| 项 | 决策 |
|----|------|
| 配置项 | `tabGroups.shortcuts.setGroupColor` / `setGroupIcon` |
| 默认 | `ctrl+alt+c` / `ctrl+alt+i`；设置页可改并同步 keybindings |
| when | `workspaceFolderCount >= 1`；需先在侧边栏选中分组 |

**涉及**：`types`、`shortcutUtils`、`settingsWebview`、`shortcuts.js`、`package.json`

## 快捷键可清空（2026-09）

| 项 | 决策 |
|----|------|
| 空字符串 | 表示不绑定；不会被 ensure 当成缺失而写回默认 |
| 同步 | 空值向 keybindings 写入 `-command`，覆盖 package.json 默认键 |
| UI | 设置页 Backspace/Delete 清除，显示「未设置」 |

**涉及**：`shortcutUtils`、`shortcuts.js` / `.css`、`settingsWebview`、`developer-readme`

---

### `version/releases.json`：发版 ↔ schema 对照（2026-09-17）

| 项 | 决策 |
|----|------|
| 问题 | 仅有 schema 目录无法对应「某次 Marketplace 发版当时的结构」，回滚难查 |
| 做法 | 新增 `version/releases.json`：`extension` → `configVersion` + `skillVersion`；只追加 |
| 写入 | 维护者发版脚本在 publish **成功后**自动追加；查阅见 `version/explain.md` |

**涉及文件**：`version/releases.json`、`version/explain.md`、`CONTRIBUTING.md`、`CHANGELOG.md`、仓外发版脚本

