# Rita Tab Groups — 开发文档（当前真相）

> **本文件描述当前产品规格**（数据模型、命令、交互、实现要点）。  
> 历史决策与歧义澄清 → [`developer-record.md`](./developer-record.md)  
> 可协作待办 → [`developer-mission-list.md`](./developer-mission-list.md)  
> 贡献入口 → [`CONTRIBUTING.md`](./CONTRIBUTING.md)  
> 用户用法 → [`README.md`](./README.md)  
> 发版说明 → [`CHANGELOG.md`](./CHANGELOG.md)

## 1. 概述

**插件名称**：Rita Tab Groups  
**扩展标识**：`Rita.rita-tab-groups`（Publisher: `Rita`，package name: `rita-tab-groups`）  
**功能**：将打开或未打开的文件组织成逻辑分组；支持手动添加、正则扫描、嵌套分组、文件标记（游标/函数/字符）、自定义快捷键与设置页 Webview、配置导入导出、一键工作集、复制为 AI 上下文、工作区 AI Skill。

**当前版本线**（勿混用）：

| 线 | 当前值（以源码为准） | 说明 |
|----|----------------------|------|
| Marketplace | `package.json` → `version` | 用户安装的扩展版本 |
| 配置 schema | `CONFIG_VERSION`（`src/data/fileEntryUtils.ts`） | `.vscode/tab-groups.json` |
| AI Skill | `AI_GUIDE_VERSION`（`src/workspace/aiGuideUtils.ts`） | 写入工作区的 Skill |

---

## 2. 数据结构设计（JSON Schema）

存储路径：`<workspaceRoot>/.vscode/tab-groups.json`  
权威类型定义：`src/data/types.ts`。下面与源码对齐；若有冲突以源码为准。

```typescript
interface BaseConfig {
  type: 'manual' | 'regex';
}
interface ManualConfig extends BaseConfig {
  type: 'manual';
}
interface RegexConfig extends BaseConfig {
  type: 'regex';
  regex: string;
}
type InlineConfig = ManualConfig | RegexConfig;

type GlobalConfig = (ManualConfig | RegexConfig) & {
  id: string;
  description?: string;
};

/** 单条标记内容（type 在 FileMarkerGroup 上） */
interface FileMarkerItem {
  label: string;
  line: number;
  column: number;
  branch?: string;
  symbolName?: string;
  symbolKind?: number;
  query?: string; // text 标记
}

interface FileMarkerGroup {
  type: 'cursor' | 'function' | 'text';
  content: FileMarkerItem[];
}

interface GroupFileEntry {
  path: string;   // 相对工作区根
  alias: string;
  branch?: string;
  markers?: FileMarkerGroup[];
}

interface Group {
  id: string;
  name: string;
  level: number;
  children: string[];      // 子分组 id
  files: GroupFileEntry[];
  config?: InlineConfig;   // 优先于 configId
  configId?: string;
  color?: string;          // 可选：预设色板 id（red/orange/…/gray）
  icon?: string;           // 可选：Codicon 白名单（folder/bookmark/star/…）
}

interface TabGroupsData {
  version?: string;        // 与 CONFIG_VERSION 对齐
  groups: Group[];
  configs: GlobalConfig[];
}
```

**解析规则**：

- 如果 `group.config` 存在 → 使用内嵌配置
- 否则如果 `group.configId` 存在 → 在 `configs` 中查找匹配的全局配置
- 否则 → 视为 `{ type: "manual" }`（默认手动分组）

**路径存储**：`files[].path` 使用相对于**所属工作区根**的路径（例如 `src/index.ts`）。多根时每个根各有一份配置，路径不带根名；保证跨平台和可移植性。

完整示例见 [`example/`](./example/) 与 [`version/tab-groups/`](./version/tab-groups/)。

### 2.1 快捷键配置

存储路径：`<workspaceRoot>/.vscode/settings.json` → `tabGroups.shortcuts`

```typescript
interface ShortcutSettings {
  addToGroup: string;      // 「加入分组」，默认 ctrl+shift+i
  removeFromGroup: string; // 「取消分组」，默认 ctrl+shift+o
  createGroup: string;     // 「新建分组」，默认 ctrl+shift+u
  deleteGroup: string;     // 「删除分组」，默认 ctrl+shift+p
  addCursor: string;       // 「添加游标」，默认 ctrl+shift+l
  addFunction: string;     // 「添加函数」，默认 ctrl+shift+;
  addText: string;         // 「添加字符匹配」，默认 ctrl+shift+'
  prevCursor: string;      // 「上一标记」，默认 ctrl+shift+[
  nextCursor: string;      // 「下一标记」，默认 ctrl+shift+]
  setGroupColor: string;   // 「设置分组颜色」，默认 ctrl+alt+c（需先选中分组）
  setGroupIcon: string;    // 「设置分组图标」，默认 ctrl+alt+i（需先选中分组）
}
```

**解析与同步规则**：

- 激活扩展时，若工作区缺少某条 `tabGroups.shortcuts` 字段，用默认值补全；**已写成 `""` 的表示不绑定**，不会被改回默认
- 保存时：有键则写入 keybindings；为空则写入 `-command` 覆盖扩展默认键
- 设置页录入时可用 Backspace / Delete 清除
- 实际生效的按键绑定在用户 keybindings 中；工作区 settings 为配置来源，可随项目提交

### 2.2 节点搜索配置

存储路径：`<workspaceRoot>/.vscode/settings.json` → `tabGroups.search`

```typescript
interface SearchSettings {
  mode: 'fuzzy' | 'exact'; // 默认 fuzzy
  include: string;         // 包含文件夹，逗号分隔，默认空
  exclude: string;          // 排除文件夹，逗号分隔，默认空
}
```

查询串本身不写入 settings，只在当前窗口的 `workspaceState` 中记住。

---



## 3. 用户界面与交互



### 3.1 活动栏（Activity Bar）

- 图标：`$(list-selection)`（内置 codicon）
- 点击后打开侧边栏视图



### 3.2 侧边栏树视图

**结构**：

```
标签分组                         <-- 标题栏：新建 / 设置
[ 搜索 (↑↓ 历史) ]               <-- 与分组列表同一视图
📁 我的手动分组（手动）
   📄 src/index.ts
```

**侧边栏标题栏（view/title）**：

- 新建分组（需已打开工作区；多根时先选目标文件夹，或在 scope 行上新建；创建**根级**分组）
- **设置**（始终显示，无工作区限制；打开设置页，含「通用」「快捷键」；保存快捷键/打开配置文件时需已打开工作区）
- 标题 `…` 菜单（`1_workspace`）：**从打开的标签创建分组** / **将打开的标签加入分组** / **从 Git 变更创建分组**（多根时先选目标文件夹）

**节点搜索**（与分组列表同在 `tabGroupsView` Webview 内，位于标题下方）：

- 输入框按**已有记录节点的名称**过滤下方树：分组名、文件别名（及文件名）、标记 label（函数还可匹配 `symbolName`）
- 右侧三个按钮对齐 VS Code 搜索框：**模糊查询**（默认，字符按顺序出现即可）/ **精准查询**（名称需包含完整查询串）/ **设置**
- 设置展开后可填「包含文件夹」「排除文件夹」（相对工作区的**文件夹**路径，逗号分隔；不是树里的固定节点）。只约束文件节点及其标记；分组名匹配不受文件夹限制。空查询时显示完整树，文件夹条件仅在有查询时生效。填写规则不常驻显示，鼠标停在对应输入框上才出现（对齐 VS Code「files to include」）
- 设置面板用高度动画展开/收起，列表被一起推下/收回，收起后搜索条贴住分组
- ↑ / ↓ 翻历史；Enter 写入历史（鼠标停在搜索框上提示该交互）；无匹配时显示「未找到匹配的节点」
- 匹配项会保留祖先分组并自动展开；匹配到分组名时展示该组子树中通过文件夹过滤的文件
- 模式与包含/排除写入工作区 `tabGroups.search`；查询串与历史在 `workspaceState`

**分组节点 inline 按钮（＋）**：

- 仅分组节点显示（`viewItem == group || groupRegex`）
- 点击后在当前分组下**新建子分组**（`tabGroups.createSubGroup`）
- 顶栏「＋」与快捷键 `ctrl+shift+u` 仍创建**根级**分组（`tabGroups.createGroup`）

**分组节点右键菜单**（仅作用于当前分组，不在插件顶栏提供）：

- 删除分组
- 重命名分组
- **设置分组颜色** / **设置分组图标**（预设色板 + Codicon 白名单）
- **新建子分组**
- **展开分组**（打开组内所有文件）：一键在编辑器中打开该分组 `files` 中的全部文件；不存在的文件跳过；最后一个文件获得焦点
- **折叠分组**（关闭组内所有文件）：一键关闭编辑器中属于该分组的所有已打开标签页
- **导出此分组**：导出该分组子树及被引用的全局 `configs` 为 JSON
- **复制为 AI 上下文**：复制路径列表，或路径 + 文件内容（Markdown）到剪贴板，便于粘贴 Chat / Agent
- 设置为手动
- 设置正则（内嵌）
- 引用全局配置（弹出列表选择已有全局配置）
- 管理全局配置（打开 `.vscode/tab-groups.json` 供手动编辑）
- 扫描文件（仅当分组配置为正则时有效，无论内嵌还是引用）

> **注意**：「展开/折叠分组」指的是**编辑器标签页**的批量打开/关闭，**不是**侧边栏树节点的展开/折叠。树节点仍可通过点击分组名称旁的箭头手动展开/折叠以查看文件列表。

**文件节点右键菜单**：

- 打开文件（跳转展平后的首个标记，无标记则打开文件开头）
- 从分组中移除
- 重命名
- **添加游标** / **添加函数** / **添加字符匹配**（写入对应 `type` 的 `content[]`，并记录当时 Git 分支）
- 复制路径

**标记子节点**（文件 → 类型组 → 标记）：

- 文件下先展示非空类型组：**游标** / **函数** / **匹配**（旁注条数）
- 组内为具体标记；单击按 type 跳转（函数优先符号名；字符匹配按 `query` 模糊定位；失败回退坐标）
- 跳转成功后左下角用独立 `StatusBarItem` 显示「类型：名称」；行为由 `tabGroups.display.markerJumpHintMode` 控制（`always` / `timed`+秒数 / `off`）
- 右键标记：**删除标记**、**重命名标记**



### 3.3 编辑器标签右键菜单

- **加入分组** → 弹出快速选择，列出所有分组（显示分组名），选择后当前文件路径加入该分组的 `files` 数组（去重）。
- **取消分组** → 弹出快速选择，首项为 **全部分组**（v2，一次性从所有包含该文件的分组中移除）；其余项为当前文件所属的分组，选择后从该分组中移除。



### 3.4 设置页 Webview（左分类 + 右内容）

命令：`tabGroups.openSettings`

- 侧边栏标题栏齿轮图标打开 Webview 面板「Tab Groups 设置」
- 布局：左侧设置分类，右侧当前分类内容（对齐 Cursor Settings）
- 分类：**通用**（默认选中）、**显示**、**快捷键**
- **通用**：打开 `.vscode/tab-groups.json`（`groups` / `configs`）；**配置版本更新**（比较文件 `version` 与 schema `CONFIG_VERSION`，落后则迁移写回）；**导出配置** / **导入配置**（见 §4.x 导入导出）
- **显示**：**标记左下角显示** — 下拉 `always`（一直显示，默认）/ `timed`（显示秒数，出现时长行）/ `off`（关闭）；**显示来源分支** — 开关（默认开启，侧边栏旁注/悬停）；**分组类型显示** — 下拉 `label`（名称后，默认）/ `hover`（仅悬停）/ `both`（都显示）；**改完即存** 至 `tabGroups.display`
- **快捷键** 分类：展示可绑定命令及当前快捷键；点击快捷键框后**按键捕获**录入新组合
- **保存**：显示配置自动写入；快捷键需点保存写入 `tabGroups.shortcuts` 并同步 keybindings
- **恢复默认**：显示页立即恢复并保存；快捷键页仅预览，需点保存
- 无工作区时可打开面板预览，但无法保存快捷键 / 显示配置 / 打开配置文件 / 升级配置 / 导入导出
- 三页统一 Setting Row（左标题说明、右控件；内容区 max-width）

**默认快捷键**：


| 命令     | 默认按键           | `when` 条件                                                                |
| ------ | -------------- | ------------------------------------------------------------------------ |
| 加入分组   | `ctrl+shift+i` | `workspaceFolderCount == 1 && resourceScheme == file`                    |
| 取消分组   | `ctrl+shift+o` | 同上                                                                       |
| 新建分组   | `ctrl+shift+u` | `workspaceFolderCount == 1`                                              |
| 删除分组   | `ctrl+shift+p` | 同上                                                                       |
| 添加游标   | `ctrl+shift+l` | `workspaceFolderCount == 1 && resourceScheme == file && editorTextFocus` |
| 添加函数   | `ctrl+shift+;` | 同上                                                                       |
| 添加字符匹配 | `ctrl+shift+'` | 同上                                                                       |
| 上一标记   | `ctrl+shift+[` | 同上                                                                       |
| 下一标记   | `ctrl+shift+]` | 同上                                                                       |


---



## 4. 核心功能详解



### 4.1 分组管理


| 操作   | 实现说明                                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| 新建分组 | 弹出输入框获取名称，生成新 `id`，创建空 `files` 数组，默认无 config 和 configId（即手动分组）。保存 JSON。支持快捷键触发（v2）。                                              |
| 从打开的标签创建 | `tabGroups.createGroupFromOpenEditors`：收集当前 `tabGroups` 中工作区文件 → 命名 → 新建手动组并批量加入。 |
| 将打开的标签加入 | `tabGroups.addOpenEditorsToGroup`：同上采集 → QuickPick 目标分组 → `addFilesToGroup`（已存在跳过）。 |
| 从 Git 变更创建 | `tabGroups.createGroupFromGitChanges`：发现工作区根及嵌套仓库（可多选）→ `git status --porcelain` → 路径映射到工作区根 → 命名（默认带分支或多仓数）→ 新建手动组。 |
| 删除分组 | 从 `groups` 中移除；若该分组引用的全局配置不再被任何分组使用，**弹窗询问**是否一并删除该全局配置。快捷键触发时，若侧边栏未选中分组，弹出 QuickPick 选择目标分组（v2）。                                |
| 重命名  | 直接修改 `group.name`。                                                                                                               |
| 展开分组 | 遍历该分组 `files`，调用 `vscode.window.showTextDocument` 依次打开；跳过不存在或无法打开的文件；非最后一个文件使用 `preserveFocus: true` 在后台打开。                      |
| 折叠分组 | 遍历 `vscode.window.tabGroups.all`，匹配属于该分组相对路径的标签页（含 `TabInputText` / `TabInputTextDiff`），调用 `vscode.window.tabGroups.close` 批量关闭。 |




### 4.2 配置管理


| 场景        | 行为                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------- |
| 设置为手动     | 删除 `group.config` 和 `group.configId`（即无配置）。                                                           |
| 设置正则（内嵌）  | 弹出输入框输入正则，设置 `group.config = { type: "regex", regex: "..." }`，删除 `configId`。                          |
| 引用全局配置    | 弹出快速选择列表（来自 `configs` 数组），选择后设置 `group.configId = selectedId`，删除 `group.config`。如果无可用全局配置，提示先创建。      |
| 管理全局配置    | 直接打开 `.vscode/tab-groups.json`，并滚动定位到 `configs` 区域，供用户手动编辑 JSON（v1 不提供增删改 UI）。                        |
| 从正则配置扫描文件 | 获取分组有效正则（内嵌或引用），调用 `vscode.workspace.findFiles('**/*')`，过滤匹配的文件路径，更新 `group.files`（**覆盖**原有列表）。显示进度条。 |




### 4.3 文件操作

- **加入分组**：将当前活动标签的 URI 转换为相对路径，添加到目标分组的 `files` 数组（避免重复）。
- **添加游标 / 函数 / 字符匹配**：写入 `markers: [{ type, content: [...] }]`（`cursor` / `function` / `text`）；每条 content 与文件条目可带 `branch`（添加时 Git 分支）；单击文件打开跳展平后首个标记；上一/下一标记按行循环跳转；上述跳转均会短暂提示标记名称。
- **取消分组**：从指定分组的 `files` 中移除该路径；选 **全部分组** 时调用 `removeFileFromAllGroups()` 一次性移除（v2）。
- **单击树视图文件**：调用 `vscode.window.showTextDocument` 打开。
- **关闭标签不影响分组**：分组中的文件路径不会因为标签关闭而删除。用户必须显式取消分组或从树视图右键移除。



### 4.4 拖放操作（v1.1.1）


| 拖放类型    | 行为                                                                             |
| ------- | ------------------------------------------------------------------------------ |
| 文件 → 分组 | 从源分组 `files` 移除，加入目标分组（保留 `alias`）；目标已有同路径则仅移除源项；支持多选                          |
| 分组 → 分组 | 整棵子树 reparent 到目标分组下（含子孙组与组内文件）；从旧父 `children` 移除并加入新父 `children`，递归更新 `level` |
| 无效放置    | 拖入自身、拖入自身子孙、已是目标直接子组 → 无操作                                                     |
| 放置目标    | 分组节点，或分组内文件节点（解析为所属分组）                                                         |


**实现**：`application/vnd.code.tree.tabGroupsView`（分组，MIME 与 view id 大小写一致）+ `application/vnd.tabgroups.file`（文件对象 payload）；文件节点设 `resourceUri` 以启用拖放，但不写入 `text/uri-list`

**实现文件**：`src/tree/treeProvider.ts`（`TreeDragAndDropController`）、`src/data/tabGroupsManager.ts`（`moveFilesToGroup` / `moveGroupToParent`）、`src/data/groupHierarchyUtils.ts`（`updateGroupLevels` / `isDescendantOf`）

### 4.5 快捷键管理（v2）


| 场景             | 行为                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| 打开设置页          | `tabGroups.openSettings`，左分类右内容；默认选中「通用」                                                                     |
| 导出 / 导入配置     | `tabGroups.exportConfig` / `tabGroups.importConfig`；分组右键 `tabGroups.exportGroup`                                      |
| 录入快捷键          | Webview 内按键捕获；Backspace/Delete 清除为不绑定；非空须修饰键+主键 |
| 保存             | `workspace.getConfiguration().update('tabGroups.shortcuts', …, Workspace)` + `syncKeybindingsFromSettings()` |
| 激活时初始化         | `ensureWorkspaceShortcutSettings()`：仅补全**缺失字段**；已有 `""` 保留 |
| keybindings 同步 | 移除本扩展托管命令（含 `-command`），再写入绑定；空值写 `-command` 覆盖 package 默认键 |
| 冲突检测           | 不做（v2 定稿）                                                                                                    |


**实现文件**：`src/settings/shortcutUtils.ts`、`src/settings/settingsWebview.ts`、`media/settings.`*、`media/shortcuts.*`

### 4.6 节点搜索（v1.1.1）


| 场景 | 行为 |
| ---- | ---- |
| 空查询 | 树显示全部节点；不应用包含/排除 |
| 模糊 | 名称转为小写后，查询字符按顺序出现即可（不必连续） |
| 精准 | 名称小写后需包含完整查询串 |
| 包含文件夹 | 仅文件路径等于或位于这些文件夹下的文件/标记可出现在结果中；留空不限制 |
| 排除文件夹 | 这些文件夹下的文件/标记不出现；分组名命中仍显示该分组 |
| 浏览 | `showOpenDialog` 选工作区内文件夹，写入相对路径 |
| 搜索条交互 | 搜索与分组同视图；设置用 max-height 动画推开列表；说明用悬停提示 |

**实现文件**：`src/tree/searchView.ts`、`src/tree/searchFilter.ts`、`src/tree/treeProvider.ts`、`src/tree/fileIconTheme.ts`、`src/settings/searchSettingsUtils.ts`、`media/search.*`、`media/codicons/*`

### 4.7 配置导入 / 导出（v1.1.3）

| 场景 | 行为 |
| ---- | ---- |
| 导出全部 | `tabGroups.exportConfig` →「导出全部」→ 另存 JSON（全部 `groups` / `configs`） |
| 导出部分 | 多选分组；自动含子树；只带被引用的全局 `configs`；父未选中时选中节点升为导出包根级 |
| 导出此分组 | 分组右键 `tabGroups.exportGroup`，导出该子树 |
| 导入合并 | 新 UUID，作为新根级并入当前配置 |
| 导入替换 | 二次确认后整文件覆盖 |
| 格式 | 与工作区 `tab-groups.json` 同构；导入时 normalize files / hierarchy |

**实现文件**：`src/data/importExportUtils.ts`、`src/data/tabGroupsManager.ts`、`src/settings/importExportCommands.ts`、`src/settings/settingsWebview.ts`、`media/settings.js`、`src/tree/commands.ts`

### 4.8 一键工作集（v1.1.4）

| 场景 | 行为 |
| ---- | ---- |
| 从打开的标签创建 | 命令面板或侧边栏 `…` → 收集已打开工作区文件 → 输入名称（默认带时间）→ 新建手动分组 |
| 将打开的标签加入 | 选择已有分组，批量加入；路径已存在则跳过 |
| 从 Git 变更创建 | `git status --porcelain`（含未跟踪）；支持嵌套多仓库选择；默认名带当前分支 |
| 过滤 | 仅 `file` scheme 且落在目标工作区根内；Diff 取 modified；Notebook 计入 |

**实现文件**：`src/workspace/workingSetUtils.ts`、`workingSetParseUtils.ts`、`src/data/tabGroupsManager.ts`（`addFilesToGroup`）、`src/tree/commands.ts`

### 4.9 复制分组为 AI 上下文（v1.1.5）

| 场景 | 行为 |
| ---- | ---- |
| 入口 | 分组右键 / 命令 `tabGroups.copyGroupAsAiContext` |
| 仅路径 | Markdown 列表，相对工作区根 |
| 路径 + 内容 | 每个文件一节 + 围栏代码块；按扩展名猜语言 |
| 范围 | 子树去重文件 |
| 保护 | 缺失 / >200KB / 二进制跳过并注明；总长 ≥400KB 状态栏提醒 |

**实现文件**：`src/workspace/aiContextFormatUtils.ts`、`aiContextUtils.ts`、`src/tree/commands.ts`

### 4.10 数据持久化与同步

- 任何修改（增删改分组、文件、配置）都立即写回 JSON 文件。
- 启动插件时读取 JSON 文件，若文件不存在则创建空结构 `{ groups: [], configs: [] }`。
- **外部修改自动重载（v1 已实现）**：
  - 监听 `vscode.workspace.createFileSystemWatcher` 监控配置文件变更；
  - 监听 `vscode.workspace.onDidSaveTextDocument`，当用户保存 `tab-groups.json` 时重新加载。
- 监听 `vscode.workspace.onDidChangeWorkspaceFolders` 在工作区切换时重新加载。

---



## 5. VSCode API 使用清单


| 用途                | API                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------- |
| 注册命令              | `vscode.commands.registerCommand`                                                           |
| 侧边栏列表             | `tabGroupsView` Webview 渲染分组树（数据仍由 `TabGroupsTreeProvider` 提供）                     |
| 右键菜单贡献            | `package.json` 的 `contributes.menus`                                                        |
| 快速选择              | `vscode.window.showQuickPick`                                                               |
| 输入框               | `vscode.window.showInputBox`                                                                |
| 获取当前文件 URI        | `vscode.window.activeTextEditor.document.uri`                                               |
| 打开/关闭组内文件         | `vscode.window.showTextDocument` / `vscode.window.tabGroups.close`                          |
| 遍历工作区文件           | `vscode.workspace.findFiles`                                                                |
| 文件读写              | `vscode.workspace.fs` 或 Node.js `fs` (需 `@types/node`)                                      |
| 进度条               | `vscode.window.withProgress`                                                                |
| 工作区事件             | `vscode.workspace.onDidChangeWorkspaceFolders`                                              |
| 状态栏消息             | `vscode.window.setStatusBarMessage`（一般操作反馈）                                                 |
| 标记跳转提示            | 独立 `StatusBarItem`（`registerMarkerJumpHint` / `showMarkerJumpHint`）；配置见 `tabGroups.display` |
| 工作区配置             | `vscode.workspace.getConfiguration` / `ConfigurationTarget.Workspace`                       |
| Webview 面板        | `vscode.window.createWebviewPanel`                                                          |
| 侧边栏                 | `registerWebviewViewProvider`（`tabGroupsView`：搜索条 + 分组列表）                          |
| 用户 keybindings 读写 | Node.js `fs` + JSONC 简易解析                                                                   |


---



## 6. 开发环境与语言

- **语言**：TypeScript
- **构建**：`tsc` 编译至 `out/`
- **依赖**：`@types/vscode`、`@types/node`
- **ID 生成**：Node.js 内置 `crypto.randomUUID()`（v1 未引入 `uuid` 包）
- **界面语言**：中文
- **项目路径**：仓库根目录（无子目录嵌套）

**当前源码结构**（按功能分目录，规则见 `src/explain.md`；入口仍在 `src/extension.ts`，对应 `package.json` 的 `./out/extension.js`）：

```
src/
├── explain.md                   # 目录规则（不参与编译）
├── extension.ts                 # 激活、配置监听、工作区校验
├── data/                        # 分组数据与持久化
│   ├── types.ts
│   ├── tabGroupsManager.ts
│   ├── tabGroupsWorkspace.ts
│   ├── groupAppearanceUtils.ts
│   ├── fileEntryUtils.ts        # CONFIG_VERSION、别名与 markers / branch 迁移
│   ├── groupHierarchyUtils.ts
│   └── importExportUtils.ts     # 导出打包 / 导入合并与替换
├── workspace/                   # 工作区路径、文件存在性、Git 分支、AI Skill
│   ├── workspaceUtils.ts
│   ├── fileExistenceCache.ts
│   ├── gitBranchUtils.ts
│   ├── gitRepoUtils.ts          # 嵌套仓库发现 / 分支
│   ├── gitRepoPathUtils.ts      # 仓库路径映射纯函数
│   ├── aiGuideUtils.ts          # 激活时写入 .cursor/skills/tab-groups/SKILL.md
│   ├── workingSetUtils.ts       # 打开标签 / Git 变更 → 相对路径
│   ├── workingSetParseUtils.ts  # porcelain 解析与默认分组名（无 vscode 依赖）
│   ├── aiContextUtils.ts        # 读盘组装「路径+内容」Markdown
│   └── aiContextFormatUtils.ts  # 路径列表 / 语言围栏等纯函数
├── tree/                        # 侧边栏、命令、编辑器打开 / 标记跳转
│   ├── treeProvider.ts
│   ├── commands.ts
│   ├── groupEditorUtils.ts
│   ├── fileLocationUtils.ts
│   ├── searchView.ts            # 侧边栏 Webview（搜索条 + 分组列表）
│   ├── searchFilter.ts          # 名称模糊/精准 + 文件夹过滤
│   └── fileIconTheme.ts         # 文件图标主题（与资源管理器一致）
└── settings/                    # 设置页、快捷键、显示 / 搜索配置
    ├── settingsWebview.ts
    ├── importExportCommands.ts  # 导入导出对话框流程
    ├── shortcutUtils.ts
    ├── displaySettingsUtils.ts
    └── searchSettingsUtils.ts  # tabGroups.search

media/
├── settings.css / settings.js
├── shortcuts.css / shortcuts.js # 快捷键 pane：按键捕获
├── search.css / search.js      # 侧边栏搜索条
└── tab-groups.skill.md          # 激活时写入工作区 `.cursor/skills/tab-groups/SKILL.md`

version/                         # 版本信息（不参与运行时）；约定见 explain.md
├── explain.md
├── tab-groups/<semver>/         # changes.json + example.json
└── skill/<n>/                   # changes.json + example（正文）
```

---



## 7. 实现步骤（MVP）



### 阶段 1：项目骨架

- [x] 生成 VSCode 插件项目
- [x] 配置 `package.json`：`activationEvents`、`contributes.viewsContainers`、`contributes.views`、`contributes.commands`、`contributes.menus`
- [x] 创建 `src/data/types.ts` 定义接口



### 阶段 2：数据管理模块

- [x] 实现 `TabGroupsManager` 类：
  - `load()`、`save()`
  - `getGroups()`、`getConfigs()`
  - `createGroup(name)`、`deleteGroup(id)`、`renameGroup(id, newName)`
  - `addFileToGroup(groupId, filePath)`、`removeFileFromGroup(groupId, filePath)`
  - `setGroupConfig(groupId, config)`、`setGroupConfigId(groupId, configId)`、`clearGroupConfig(groupId)`
  - `createGlobalConfig(config)`、`deleteGlobalConfig(id)`
  - `getEffectiveConfig(group)` 返回解析后的配置对象



### 阶段 3：树视图实现

- [x] 实现 `TreeDataProvider`：`getChildren`、`getTreeItem`、`getParent`
- [x] 分组节点和文件节点使用不同 `TreeItem`，设置 `contextValue` 以便右键菜单区分
- [x] 刷新方法：调用 `onDidChangeTreeData` 事件



### 阶段 4：命令实现

- [x] 所有分组操作命令（新建、删除、重命名、展开/折叠）
- [x] 标签页右键命令：`addToGroup`、`removeFromGroup`
- [x] 树视图内右键命令：打开文件、从分组移除文件、扫描文件（正则分组）、设置配置等



### 阶段 5：正则扫描功能

- [x] 实现 `scanGroupWithRegex(group)`：获取有效正则，调用 `findFiles`，过滤，更新 `group.files`



### 阶段 6：错误处理与优化

- [x] 工作区未打开时禁用功能并提示；多根按文件夹分区启用
- [x] JSON 解析失败时的回退与提示
- [x] 文件路径不存在时在树视图中灰显，且可右键移除
- [x] 添加状态栏消息提示成功/失败
- [x] 外部修改配置文件后自动重新加载



### 阶段 7：测试与打包

- [ ] 编写单元测试（Mocha）
- [x] 本地打包 / Marketplace 发布（由维护者仓外完成；本仓不文档化凭证）



### 阶段 8：快捷键（v2）

- [x] `tabGroups.openSettings` 命令与 `view/title`「设置」按钮（左分类右内容；「通用」「快捷键」）
- [x] 配置导入 / 导出（设置通用 + 分组右键导出子树；合并 / 替换）
- [x] 一键工作集：从打开的标签创建/加入；从 Git 变更创建
- [x] 复制分组为 AI 上下文（路径 / 路径+内容）
- [x] Webview 按键捕获与格式校验
- [x] 工作区 `tabGroups.shortcuts` 读写与激活时默认值补全
- [x] 同步用户 `keybindings.json`
- [x] 五条默认可绑定命令（加入/取消分组、添加游标、新建/删除分组）
- [x] 取消分组 QuickPick 增加「全部分组」
- [x] 删除分组快捷键无树选中时 QuickPick 选分组

---



## 8. 边界情况与注意事项

1. **多根工作区**：每个 `WorkspaceFolder` 各自维护 `.vscode/tab-groups.json`；路径相对**该根**。侧边栏多根时顶层按文件夹分区（scope），单根不额外加层。无工作区文件夹时禁用并提示。不支持把文件跨根加入另一根的分组。
2. **文件被移动/重命名**：分组中存储的相对路径会失效，树视图中灰显并标注「（不存在）」，可右键移除（已监听 `onDidRenameFiles` 刷新存在性）。
3. **正则表达式转义**：用户输入的正则需经过 `new RegExp()` 验证，无效时提示错误。
4. **性能**：扫描大量文件时使用 `withProgress` 并支持取消；扫描范围限于目标根。
5. **配置文件热重载**：外部修改或编辑器内保存各根 `.vscode/tab-groups.json` 后自动重新加载。
6. **快捷键同步（v2）**：同步 `keybindings.json` 时整文件 JSON 重写，原有注释可能丢失；`ctrl+shift+p` 与 VS Code 命令面板默认快捷键冲突，需用户自行改绑。
7. **设置页快捷键保存**：需已打开工作区；无工作区时 Webview 可预览不可保存。
8. **节点搜索**：只过滤侧边栏已记录的节点，不扫描磁盘；包含/排除是相对各根的文件夹路径，不是分组节点。

---



## 9. 后续迭代计划

公开可认领任务见 **[`developer-mission-list.md`](./developer-mission-list.md)**（做完删除对应条目）。  
维护者未公开优先级不在本仓。

历史曾列、现已交付的能力（导入导出、工作集、AI 上下文、嵌套 Git 等）见 [`CHANGELOG.md`](./CHANGELOG.md) 与 [`developer-record.md`](./developer-record.md)。

---



## 10. 附录：示例配置文件

完整、带字段说明的示例见 **[example/](./example/)**（`explain.md` + 当前 schema 的 JSON）。


| 示例文件                       | 对应实际路径                                                                   |
| -------------------------- | ------------------------------------------------------------------------ |
| `example/tab-groups.json`  | 工作区 `.vscode/tab-groups.json`（schema `1.6.0`：嵌套分组、别名、`markers`、`branch`、可选 `color`/`icon`） |
| `example/settings.json`    | 工作区 `.vscode/settings.json`（`tabGroups.shortcuts` + `tabGroups.display` + `tabGroups.search`） |
| `example/keybindings.json` | 用户 `User/keybindings.json`（保存快捷键时同步，非工作区文件）                              |


---



## 11. 相关文档

| 文档 | 用途 |
|------|------|
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | 贡献与双仓边界 |
| [`developer-record.md`](./developer-record.md) | 决策与 bugfix |
| [`developer-mission-list.md`](./developer-mission-list.md) | 公开待办 |
| [`CHANGELOG.md`](./CHANGELOG.md) | 用户可见发版说明 |
| [`README.md`](./README.md) | 终端用户用法 |
| [`example/`](./example/) | 安装后配置对照示例 |
