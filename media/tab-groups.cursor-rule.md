---
description: Tab Groups 标签分组 — 用户要用自然语言管理文件分组、标记时遵循
alwaysApply: true
---

<!-- tab-groups-ai-guide-version: 1 -->

# Tab Groups（AI 操作）

用户可用自然语言请你管理「标签分组 / Tab Groups / 文件分组」。**优先直接改配置完成**，不要只教用户点侧边栏。

1. **必读**工作区 `.vscode/tab-groups-ai.md`（完整操作手册，由扩展维护）。
2. 主要改 `.vscode/tab-groups.json`；显示/快捷键改 `.vscode/settings.json` 的 `tabGroups.display` / `tabGroups.shortcuts`。
3. 保存后扩展会自动刷新侧边栏。
4. 单根工作区；路径用相对根目录；`line`/`column` 从 0 起算；schema `version` 保持 `1.5.0`。
