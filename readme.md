# Rita Tab Groups

**English** · **中文**

> Close a tab ≠ lose the file.  
> Group by *meaning*, not by whatever happens to be open right now.

> 关掉标签 ≠ 丢掉文件。  
> 按「这件事相关」分组，而不是按「此刻打开了啥」。

[English ↓](#english) · [中文 ↓](#中文)

**Publisher:** Rita · **ID:** `Rita.rita-tab-groups` · **License:** MIT

---

<a id="english"></a>

## English

### Why this extension?

VS Code’s tab bar is great at showing *what’s open*. It’s terrible at remembering *what belongs together*.

You’re fixing a payment bug: `Checkout.tsx`, two API handlers, a shared util, a README snippet from last week — and half of them aren’t even open. Native tabs forget them the moment you close the editor. **Rita Tab Groups** keeps those files in a named group you can reopen anytime, commit to git, and hand to a teammate (or an AI).

Think of it as a **project map**, not a tab session saver.

| You want… | Rita Tab Groups |
|-----------|-----------------|
| Files that stay in a group after you close them | Yes |
| Regex auto-collect (`**/server/**/*.js`) | Yes |
| Line / function / text markers with jump | Yes |
| Config in the repo (`.vscode/tab-groups.json`) | Yes |
| Ask Cursor: “make a group and add these files” | Yes (Skill) |
| Restore split-pane layout / editor columns | No — use a layout tool for that |

### Highlights

- **Manual groups** — pick files like packing a “mission kit”
- **Regex groups** — scan the workspace; rules can be inline or shared
- **Nested subgroups** — tree structure for big features
- **Open / close all** — flood the editors or clear them in one click *(editor tabs, not tree expand/collapse)*
- **Markers** — cursor · function · text match; jump with hints; remember Git branch
- **Sidebar search** — fuzzy / exact; include / exclude folders
- **Custom shortcuts** — capture in Settings, sync to your `keybindings.json`
- **AI Skill** — writes `.cursor/skills/tab-groups/SKILL.md` so agents can edit groups for you
- **Team-friendly** — commit the JSON; everyone gets the same map
- **Import / export** — share full config or selected group subtrees as JSON files
- **Working sets** — create a group from open editors or from Git changes in one step
- **AI context copy** — copy a group’s paths (or full file bodies) as Markdown for Chat / Agent

### Quick start

1. Install **Rita Tab Groups** (`Rita.rita-tab-groups`).
2. Open a **single-folder** workspace (multi-root is not supported yet).
3. Click the activity-bar icon → **＋** to create a group.
4. Right-click an editor tab → **Add to Group**.
5. Click a file in the sidebar to open it; expand markers to jump.

On first activation the extension also drops an **AI Skill** into `.cursor/skills/tab-groups/SKILL.md`. After that you can just say: *“Create a Frontend group and add everything under `src/pages`.”*

### Sidebar at a glance

```
Rita Tab Groups              ＋  ⚙
[ Search (↑↓ history)   Fuzzy  Exact  Settings ]
📁 Payment bugfix (manual)
   📄 Checkout.tsx
   📄 api/pay.ts          ← alias / markers under the file
📁 Backend JS             (ref: backend-regex)
📁 Components             (regex)
```

- Suffix after the name = group type: **manual**, **regex**, or a shared config id
- Missing files show grey + “(missing)” — right-click to remove
- Search matches **group / file alias / marker** names; Settings expands include/exclude **workspace folders** (e.g. `src`, `dist`), not sidebar nodes
- Hover search for “Enter = save history”; ↑ / ↓ recall past queries

### Features in detail

#### Groups

| Action | How |
|--------|-----|
| New group | Title **＋**, empty-area context menu, or shortcut |
| From open editors | Command Palette / sidebar **…** → **Create Group from Open Editors** |
| Add open editors to a group | Sidebar **…** → **Add Open Editors to Group** |
| From Git changes | Sidebar **…** → **Create Group from Git Changes** (pick nested repos if needed) |
| Nested subgroup | Right-click a group → **New Subgroup** |
| Rename / delete | Context menu (delete also has a shortcut) |
| Open all files | Context → **Open All Files in Group** |
| Close all open tabs of that group | Context → **Close All Files in Group** |
| Export this group | Context → **Export this group** (subtree + referenced shared configs) |
| Copy as AI context | Context → **Copy as AI Context** (paths only, or paths + file bodies) |
| Manual / inline regex / shared config | Context menu |
| Scan | Regex groups only — rescans workspace and **replaces** the file list |
| Manage shared configs | Opens `.vscode/tab-groups.json` |

#### Files & markers

| Action | How |
|--------|-----|
| Open | Click; if markers exist, jumps to the first one |
| Alias | Rename display name without moving the file |
| Remove / copy path | Context menu |
| Add cursor / function / text match | Context menu or shortcuts |
| Prev / next marker | Shortcuts; status-bar hint is configurable |
| Source branch | Hover (toggle in Settings → Display) |

Closing an editor tab **does not** remove the file from the group. Use **Remove from Group** (sidebar) or **Ungroup** (tab menu). Same file can live in multiple groups; **Ungroup → All groups** clears every membership at once.

#### Editor tab menu

- **Add to Group**
- **Ungroup** (optional: all groups)

#### Settings (gear)

- **General** — open `tab-groups.json`; migrate schema when outdated; **Export** / **Import** config (full or selected groups; merge or replace)
- **Display** — marker hint (always / timed / off); show source branch; where to show group type (label / hover / both)
- **Shortcuts** — click a field, press keys, Save → workspace `tabGroups.shortcuts` + user `keybindings.json`

You can also right-click a group → **Export this group** (subtree + referenced shared configs).

Default shortcuts (customize anytime):

| Action | Default |
|--------|---------|
| Add to group | `Ctrl+Shift+I` |
| Ungroup | `Ctrl+Shift+O` |
| New group | `Ctrl+Shift+U` |
| Delete group | `Ctrl+Shift+P` *may conflict with Command Palette — rebind if needed* |
| Add cursor | `Ctrl+Shift+L` |
| Add function | `Ctrl+Shift+;` |
| Text match | `Ctrl+Shift+'` |
| Prev / next marker | `Ctrl+Shift+[` / `]` |

Saving shortcuts needs a single-root workspace. You can open Settings without a folder, but Save stays disabled.

### Three ways to build a group

**1. Manual** — curated list for a feature, a PR, a “don’t forget these”.

**2. Inline regex** — right-click → **Set Regex (inline)** → **Scan**. Example: all `.tsx` under `components`:

```
.*/components/.*\.tsx$
```

**3. Shared config** — define once under `configs` in JSON, **Reference Global Config** on many groups.

```json
{
  "version": "1.5.0",
  "groups": [
    {
      "id": "group-1",
      "name": "My manual group",
      "level": 0,
      "children": [],
      "files": [
        { "path": "src/index.ts", "alias": "entry" }
      ]
    },
    {
      "id": "group-2",
      "name": "Backend",
      "level": 0,
      "children": [],
      "files": [],
      "configId": "backend-regex"
    }
  ],
  "configs": [
    {
      "id": "backend-regex",
      "type": "regex",
      "regex": ".*/server/.*\\.js$",
      "description": "Backend JS"
    }
  ]
}
```

Save the file → the sidebar reloads automatically. See `example/` in the repo for a fuller sample.

### Limits & tips

| Topic | Note |
|-------|------|
| Workspace | **Single root** only |
| Moves / renames | Paths are relative; broken entries show as missing |
| Regex scan | **Overwrites** that group’s file list; long scans show progress / cancel |
| Delete group | Unused shared configs may prompt for cleanup |
| Keybindings sync | May strip JSON comments in user `keybindings.json` |

### FAQ

**Where is data stored?**  
`.vscode/tab-groups.json`. Preferences: `tabGroups.shortcuts` / `display` / `search` in `.vscode/settings.json`.

**Can the team share groups?**  
Yes — commit those files. Each developer’s Save still writes their own machine `keybindings.json`.

**Conflict with VS Code “Tab Groups”?**  
No. Ours = logical file sets. VS Code’s = editor layout groups.

**Invalid regex?**  
Validated on save; watch escaping (`.` → `\.`).

### Links

- Marketplace ID: `Rita.rita-tab-groups`
- Repository: [github.com/ritaAccount/vscode-Tab-Groups](https://github.com/ritaAccount/vscode-Tab-Groups)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)

---

<a id="中文"></a>

## 中文

### 它解决什么问题？

编辑器标签栏很擅长展示「此刻打开了什么」，却很健忘：「哪些文件其实是同一件事」。

修支付 bug 时，你可能需要：`Checkout.tsx`、两个接口、一个公共工具、上周 README 里的一段说明——其中一半根本没打开。一关标签，原生标签栏就把它们忘了。**Rita Tab Groups** 把这些文件收进一个有名字的分组：随时批量打开、写进 git、交给同事，也可以让 AI 帮你改。

更像一份**项目地图**，而不是「保存当前标签布局」的会话工具。

| 你想要… | Rita Tab Groups |
|---------|-----------------|
| 关掉标签后，文件仍在分组里 | 有 |
| 正则自动收集（如 `**/server/**/*.js`） | 有 |
| 游标 / 函数 / 字符匹配标记并跳转 | 有 |
| 配置进仓库（`.vscode/tab-groups.json`） | 有 |
| 对 Cursor 说：「建个分组，把这些文件加进去」 | 有（Skill） |
| 还原分屏、多列编辑器布局 | 没有——请用专门的布局类扩展 |

### 亮点速览

- **手动分组** — 像给任务打「出差行李包」
- **正则分组** — 扫描整个工作区；规则可内嵌，也可多组共用
- **嵌套子分组** — 大功能拆成树
- **一键打开 / 关闭** — 组内文件批量出现在编辑器，或清掉已打开的标签（说的是**标签页**，不是树节点展开折叠）
- **三种标记** — 游标 · 函数 · 字符匹配；跳转有提示；可记 Git 分支
- **侧边栏搜索** — 模糊 / 精准；按文件夹包含 / 排除
- **自定义快捷键** — 设置页按一下就录入，同步到本机 `keybindings.json`
- **AI Skill** — 激活时写入 `.cursor/skills/tab-groups/SKILL.md`，让 Agent 直接改配置
- **可协作** — JSON 进版本库，全队同一张地图
- **导入 / 导出** — 整份或所选分组子树，另存为 JSON 再导入
- **一键工作集** — 从当前打开的标签，或从 Git 变更，一键收成分组
- **复制为 AI 上下文** — 把整组路径或文件内容复制成 Markdown，粘贴给 Chat / Agent

### 五分钟上手

1. 安装 **Rita Tab Groups**（`Rita.rita-tab-groups`）
2. 用 VS Code **打开一个文件夹**（目前仅支持**单根**工作区）
3. 点左侧活动栏图标 → **＋** 新建分组
4. 在编辑器**标签上右键** → **加入分组**
5. 在侧边栏点文件名打开；展开标记可跳转到具体位置

首次激活还会写入 **AI Skill**（`.cursor/skills/tab-groups/SKILL.md`）。之后可以直接说：「建一个叫前端的分组，把 `src/pages` 下的文件加进去。」

### 界面长这样

```
标签分组                    ＋  ⚙
[ 搜索 (↑↓ 历史)     模糊 精准 设置 ]
📁 支付 bugfix（手动）
   📄 Checkout.tsx
   📄 api/pay.ts          ← 别名 / 标记挂在文件下
📁 后端逻辑（引用：backend-regex）
📁 前端组件（正则）
```

- 名称后的括号 = 分组类型：**手动**、**正则**，或引用的全局配置名
- 文件没了会灰显并标「（不存在）」，右键可移除
- 搜索匹配的是**分组名 / 文件别名 / 标记名**；设置里的包含/排除填的是项目里的**文件夹路径**（如 `src`、`dist`），不是侧边栏节点
- 鼠标停在搜索框：提示 Enter 写入历史；↑ / ↓ 翻历史

### 功能一览

#### 分组

| 操作 | 怎么做 |
|------|--------|
| 新建分组 | 标题栏 **＋**、空白处右键，或快捷键 |
| 从打开的标签创建分组 | 命令面板，或侧边栏标题 **…** → **从打开的标签创建分组** |
| 将打开的标签加入分组 | 侧边栏 **…** → **将打开的标签加入分组** |
| 从 Git 变更创建分组 | 侧边栏 **…** → **从 Git 变更创建分组**（含未提交 / 未跟踪；若有多个子仓库会让你选择） |
| 新建子分组 | 右键分组 → **新建子分组** |
| 重命名 / 删除 | 右键（删除也有快捷键） |
| 打开组内所有文件 | 右键 → **打开组内所有文件** |
| 关闭组内已打开标签 | 右键 → **关闭组内所有文件** |
| 导出此分组 | 右键 → **导出此分组**（含子分组与引用的全局规则） |
| 复制为 AI 上下文 | 右键 → **复制为 AI 上下文**（仅路径，或路径+文件内容，粘贴到 Chat） |
| 手动 / 内嵌正则 / 引用全局配置 | 右键菜单 |
| 扫描文件 | 仅正则分组——重新扫描并**覆盖**当前文件列表 |
| 管理全局配置 | 打开 `.vscode/tab-groups.json` |

#### 文件与标记

| 操作 | 怎么做 |
|------|--------|
| 打开 | 单击；有标记时跳到第一条 |
| 重命名（别名） | 改侧边栏显示名，不动真实路径 |
| 移除 / 复制路径 | 右键 |
| 添加游标 / 函数 / 字符匹配 | 右键或快捷键 |
| 上一 / 下一标记 | 快捷键；左下角提示可在设置里调 |
| 来源分支 | 悬停查看（设置 → 显示 可关） |

关掉编辑器标签**不会**把文件踢出分组。要从组里拿掉，请用侧边栏 **从分组中移除**，或标签菜单 **取消分组**。同一文件可以进多个组；取消时选 **全部分组** 可一次清光。

#### 标签页右键

- **加入分组**
- **取消分组**（可选「全部分组」）

#### 设置（齿轮）

- **通用** — 打开 `tab-groups.json`；配置 schema 落后时可一键升级；**导出配置** / **导入配置**（全部或所选分组；导入可合并或整文件替换）
- **显示** — 标记提示（一直 / 按秒 / 关）；是否显示来源分支；分组类型显示在名称后 / 仅悬停 / 两者都要
- **快捷键** — 点输入框再按键，保存后写入工作区 `tabGroups.shortcuts` 并同步本机 keybindings

分组也可右键 **导出此分组**（该子树 + 引用到的全局规则）。

**默认快捷键**（随时可改）：

| 功能 | 默认 |
|------|------|
| 加入分组 | `Ctrl+Shift+I` |
| 取消分组 | `Ctrl+Shift+O` |
| 新建分组 | `Ctrl+Shift+U` |
| 删除分组 | `Ctrl+Shift+P` *可能与命令面板冲突，建议改绑* |
| 添加游标 | `Ctrl+Shift+L` |
| 添加函数 | `Ctrl+Shift+;` |
| 字符匹配 | `Ctrl+Shift+'` |
| 上一 / 下一标记 | `Ctrl+Shift+[` / `]` |

保存快捷键需要已打开单根工作区；无文件夹时仍可预览设置页，但不能保存。

### 三种建组方式

**1. 手动** — 精挑细选：某个功能、某次 PR、「别忘了这几个」。

**2. 内嵌正则** — 右键 → **设置正则（内嵌）** → **扫描文件**。例如 `components` 下所有 `.tsx`：

```
.*/components/.*\.tsx$
```

**3. 全局配置** — 在 JSON 的 `configs` 里写一次，多个分组 **引用全局配置**。

```json
{
  "version": "1.5.0",
  "groups": [
    {
      "id": "group-1",
      "name": "我的手动分组",
      "level": 0,
      "children": [],
      "files": [
        { "path": "src/index.ts", "alias": "入口" }
      ]
    },
    {
      "id": "group-2",
      "name": "后端逻辑",
      "level": 0,
      "children": [],
      "files": [],
      "configId": "backend-regex"
    }
  ],
  "configs": [
    {
      "id": "backend-regex",
      "type": "regex",
      "regex": ".*/server/.*\\.js$",
      "description": "后端 JS 文件"
    }
  ]
}
```

保存后侧边栏会自动刷新。仓库 `example/` 里有更完整的对照示例与字段说明。

### 限制与提示

| 情况 | 说明 |
|------|------|
| 工作区 | 目前仅**单根**（一个文件夹） |
| 移动 / 重命名 | 存的是相对路径，路径变了会显示不存在 |
| 正则扫描 | **覆盖**该组文件列表；量大时有进度，可取消 |
| 删除分组 | 若全局配置已无引用，会询问是否一并删掉 |
| 同步快捷键 | 可能去掉用户 `keybindings.json` 里的 JSON 注释 |

### 常见问题

**分组数据存在哪？**  
`.vscode/tab-groups.json`。偏好在 `.vscode/settings.json` 的 `tabGroups.shortcuts` / `display` / `search`。

**换电脑或同事能共用吗？**  
可以——把上述文件纳入版本控制即可。每人点保存快捷键时仍会写各自本机的 keybindings。

**和 VS Code 自带的 Tab Groups 冲突吗？**  
不冲突。本扩展管的是「文件逻辑分组」；自带的是编辑器窗口布局分组。

**正则写错了？**  
保存前会校验；注意转义（`.` 写成 `\.`）。

### 链接

- Marketplace：`Rita.rita-tab-groups`
- 仓库：[github.com/ritaAccount/vscode-Tab-Groups](https://github.com/ritaAccount/vscode-Tab-Groups)
- 更新说明：[CHANGELOG.md](./CHANGELOG.md)
- 参与开发：[CONTRIBUTING.md](./CONTRIBUTING.md)
