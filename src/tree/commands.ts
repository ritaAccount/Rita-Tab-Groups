import * as vscode from 'vscode';
import { closeGroupFiles, openGroupFiles } from './groupEditorUtils';
import { getMatchingActiveEditor, openFileAtMarker, openFileEntry, resolveEnclosingFunctionSymbol, revealMarkerInEditor } from './fileLocationUtils';
import { TabGroupsManager } from '../data/tabGroupsManager';
import { TabGroupsWorkspace } from '../data/tabGroupsWorkspace';
import { FileTreeItem, GroupTreeItem, MarkerTreeItem, MarkerTypeTreeItem, TabGroupsTreeProvider, TreeElement, WorkspaceFolderTreeItem } from './treeProvider';
import { sortFlatMarkersByLine, flattenMarkers, countMarkers } from '../data/fileEntryUtils';

type TabGroupsTreeElement = TreeElement;
import {
  ensureValidWorkspace,
  formatEntryDisplayPath,
  resolveEntryFolder,
  resolveWorkspaceFolder,
  toRelativePath,
} from '../workspace/workspaceUtils';
import {
  collectGitChangesWithRepoPick,
  collectOpenEditorFileRefs,
  defaultGitChangesGroupName,
  defaultOpenEditorsGroupName,
  getGitBranchAt,
} from '../workspace/workingSetUtils';
import {
  AI_CONTEXT_WARN_TOTAL_CHARS,
  buildAiContextContentsMarkdown,
  buildAiContextPathsMarkdown,
  AiContextMode,
} from '../workspace/aiContextUtils';
import { TabGroupsSearchViewProvider } from './searchView';
import { runExportTabGroups } from '../settings/importExportCommands';
import { GROUP_COLOR_OPTIONS, GROUP_ICON_OPTIONS } from '../data/groupAppearanceUtils';

export function registerCommands(
  context: vscode.ExtensionContext,
  workspace: TabGroupsWorkspace,
  treeProvider: TabGroupsTreeProvider,
  sidebar: TabGroupsSearchViewProvider,
): void {
  const register = (command: string, callback: (...args: any[]) => any) => {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));
  };

  const managerForGroup = (groupId: string): TabGroupsManager | undefined =>
    workspace.findManagerByGroupId(groupId);

  const requireFolders = async (): Promise<boolean> => {
    return !!(await ensureValidWorkspace());
  };

  register('tabGroups.createGroup', async (item?: WorkspaceFolderTreeItem | GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const preferred =
      item instanceof WorkspaceFolderTreeItem
        ? item.folder
        : item instanceof GroupTreeItem
          ? item.folder
          : undefined;
    const manager = await workspace.resolveTargetManager(
      preferred,
      '选择要新建分组的工作区文件夹',
    );
    if (!manager) {
      return;
    }

    const name = await vscode.window.showInputBox({
      prompt: '请输入分组名称',
      placeHolder: '例如：我的手动分组',
      validateInput: (value) => (value.trim() ? undefined : '分组名称不能为空'),
    });
    if (!name) {
      return;
    }

    await manager.createGroup(name.trim());
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已创建分组「${name.trim()}」`, 3000);
  });

  register('tabGroups.createGroupFromOpenEditors', async () => {
    if (!(await requireFolders())) {
      return;
    }

    const manager = await workspace.resolveTargetManager(
      undefined,
      '选择保存分组配置的工作区文件夹',
    );
    if (!manager) {
      return;
    }

    const refs = collectOpenEditorFileRefs();
    if (refs.length === 0) {
      await vscode.window.showInformationMessage('当前没有可加入的已打开工作区文件。');
      return;
    }

    const name = await vscode.window.showInputBox({
      prompt: `将 ${refs.length} 个已打开文件建成新分组`,
      value: defaultOpenEditorsGroupName(),
      validateInput: (value) => (value.trim() ? undefined : '分组名称不能为空'),
    });
    if (!name) {
      return;
    }

    const group = await manager.createGroup(name.trim());
    const result = await manager.addFilesToGroup(
      group.id,
      refs.map((ref) => ({ path: ref.path, folder: ref.folder.name })),
    );
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(
      `已创建「${group.name}」：加入 ${result.added} 个文件` +
        (result.skipped ? `，跳过 ${result.skipped}` : ''),
      4000,
    );
  });

  register('tabGroups.addOpenEditorsToGroup', async () => {
    if (!(await requireFolders())) {
      return;
    }

    const refs = collectOpenEditorFileRefs();
    if (refs.length === 0) {
      await vscode.window.showInformationMessage('当前没有可加入的已打开工作区文件。');
      return;
    }

    const picks = workspace.listAllGroupsForPick();
    if (picks.length === 0) {
      await vscode.window.showInformationMessage('暂无分组，请先新建分组或使用「从打开的标签创建分组」。');
      return;
    }

    const picked = await vscode.window.showQuickPick(picks, {
      placeHolder: `选择要加入的分组（将添加 ${refs.length} 个已打开文件）`,
    });
    if (!picked) {
      return;
    }

    const result = await picked.manager.addFilesToGroup(
      picked.groupId,
      refs.map((ref) => ({ path: ref.path, folder: ref.folder.name })),
    );
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(
      `已加入「${picked.label}」：新增 ${result.added}` +
        (result.skipped ? `，已存在跳过 ${result.skipped}` : ''),
      4000,
    );
  });

  register('tabGroups.createGroupFromGitChanges', async () => {
    if (!(await requireFolders())) {
      return;
    }

    const manager = await workspace.resolveTargetManager(
      undefined,
      '选择要收集 Git 变更的工作区文件夹',
    );
    if (!manager) {
      return;
    }

    const collected = await collectGitChangesWithRepoPick(manager.folder);
    if (!collected.ok) {
      if (collected.reason === 'cancelled') {
        return;
      }
      if (collected.reason === 'no-repos') {
        await vscode.window.showInformationMessage(
          '当前工作区文件夹未找到 Git 仓库。若前后端是独立仓库，请确认它们位于该文件夹子目录内。',
        );
        return;
      }
      if (collected.reason === 'no-changes') {
        await vscode.window.showInformationMessage(
          '所选 Git 仓库没有未提交变更（含未跟踪文件）。',
        );
        return;
      }
      return;
    }

    const { paths, repos } = collected;
    let branchHint: string | undefined;
    if (repos.length === 1) {
      branchHint = await getGitBranchAt(repos[0].rootFsPath);
    } else {
      branchHint = `${repos.length} 个仓库`;
    }

    const name = await vscode.window.showInputBox({
      prompt: `将 ${paths.length} 个 Git 变更文件建成新分组`,
      value: defaultGitChangesGroupName(branchHint),
      validateInput: (value) => (value.trim() ? undefined : '分组名称不能为空'),
    });
    if (!name) {
      return;
    }

    const group = await manager.createGroup(name.trim());
    const result = await manager.addFilesToGroup(group.id, paths);
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(
      `已创建「${group.name}」：加入 ${result.added} 个变更文件` +
        (result.skipped ? `，跳过 ${result.skipped}` : ''),
      4000,
    );
  });

  register('tabGroups.exportGroup', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const groupItem = resolveGroupItem(item, sidebar);
    const group = groupItem?.group;
    if (!group || !groupItem) {
      await vscode.window.showWarningMessage('请先在侧边栏选中一个分组。');
      return;
    }

    const manager = managerForGroup(group.id);
    if (!manager) {
      return;
    }

    await runExportTabGroups(manager, [group.id]);
  });

  register('tabGroups.copyGroupAsAiContext', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const groupItem = resolveGroupItem(item, sidebar);
    const group = groupItem?.group;
    if (!group || !groupItem) {
      await vscode.window.showWarningMessage('请先在侧边栏选中一个分组。');
      return;
    }

    const manager = managerForGroup(group.id);
    if (!manager) {
      return;
    }

    const entries = manager.getGroupFileEntriesRecursive(group.id);
    if (entries.length === 0) {
      await vscode.window.showInformationMessage(`分组「${group.name}」中没有文件。`);
      return;
    }

    const modePick = await vscode.window.showQuickPick(
      [
        {
          label: '路径 + 文件内容',
          description: 'Markdown，适合粘贴到 Chat / Agent（推荐）',
          mode: 'contents' as AiContextMode,
        },
        {
          label: '仅路径列表',
          description: '轻量，方便自己 @ 文件或核对范围',
          mode: 'paths' as AiContextMode,
        },
      ],
      { placeHolder: `复制「${group.name}」为 AI 上下文（${entries.length} 个文件）` },
    );
    if (!modePick) {
      return;
    }

    const displayPaths = entries.map((entry) =>
      formatEntryDisplayPath(entry, manager.folder.name),
    );
    const result =
      modePick.mode === 'paths'
        ? buildAiContextPathsMarkdown(group.name, displayPaths)
        : await buildAiContextContentsMarkdown(group.name, entries, manager.folder);

    await vscode.env.clipboard.writeText(result.text);

    const parts = [`已复制「${group.name}」`];
    if (modePick.mode === 'contents') {
      parts.push(`内容 ${result.included} 个`);
      if (result.skippedMissing) {
        parts.push(`缺失 ${result.skippedMissing}`);
      }
      if (result.skippedLarge) {
        parts.push(`跳过 ${result.skippedLarge}`);
      }
    } else {
      parts.push(`路径 ${result.included} 条`);
    }
    if (result.totalChars >= AI_CONTEXT_WARN_TOTAL_CHARS) {
      parts.push('上下文较长，粘贴前请留意模型窗口');
    }
    vscode.window.setStatusBarMessage(parts.join(' · '), 5000);
  });

  register('tabGroups.deleteGroup', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    let groupItem = resolveGroupItem(item, sidebar);
    let group = groupItem?.group;
    let manager = group ? managerForGroup(group.id) : undefined;
    if (!group || !manager) {
      const targetManager = await workspace.resolveTargetManager(
        undefined,
        '选择要删除分组的工作区文件夹',
      );
      if (!targetManager) {
        return;
      }
      manager = targetManager;
      const rootGroups = manager.getRootGroups();
      if (rootGroups.length === 0) {
        await vscode.window.showInformationMessage('暂无分组可删除。');
        return;
      }

      const picked = await vscode.window.showQuickPick(
        rootGroups.map((entry) => ({
          label: entry.name,
          group: entry,
        })),
        { placeHolder: '选择要删除的根级分组' },
      );
      if (!picked) {
        return;
      }
      group = picked.group;
    }

    const hasChildren = group.children.length > 0;
    const confirmMessage = hasChildren
      ? `确定要删除分组「${group.name}」吗？其所有子分组也将一并删除。`
      : `确定要删除分组「${group.name}」吗？`;

    const confirm = await vscode.window.showWarningMessage(
      confirmMessage,
      { modal: true },
      '删除',
    );
    if (confirm !== '删除') {
      return;
    }

    const descendantIds = manager.getDescendantIds(group.id);
    const configIds = await manager.deleteGroup(group.id);
    for (const id of descendantIds) {
      treeProvider.rememberCollapsed(id);
    }

    const uniqueConfigIds = [...new Set(configIds)];
    for (const configId of uniqueConfigIds) {
      if (!manager.isConfigReferenced(configId)) {
        const globalConfig = manager.getConfig(configId);
        const configLabel = globalConfig?.description ?? configId;
        const deleteConfig = await vscode.window.showWarningMessage(
          `全局配置「${configLabel}」不再被任何分组引用，是否一并删除？`,
          '删除配置',
          '保留配置',
        );
        if (deleteConfig === '删除配置') {
          await manager.deleteGlobalConfig(configId);
        }
      }
    }

    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已删除分组「${group.name}」`, 3000);
  });

  register('tabGroups.createSubGroup', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const groupItem = resolveGroupItem(item, sidebar);
    if (!groupItem) {
      return;
    }

    const manager = managerForGroup(groupItem.group.id);
    if (!manager) {
      return;
    }

    const name = await vscode.window.showInputBox({
      prompt: `在「${groupItem.group.name}」下新建子分组`,
      placeHolder: '例如：组件',
      validateInput: (value) => (value.trim() ? undefined : '分组名称不能为空'),
    });
    if (!name) {
      return;
    }

    await manager.createSubGroup(groupItem.group.id, name.trim());
    treeProvider.rememberExpanded(groupItem.group.id);
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已在「${groupItem.group.name}」下创建子分组「${name.trim()}」`, 3000);
  });

  register('tabGroups.renameGroup', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const groupItem = resolveGroupItem(item, sidebar);
    if (!groupItem) {
      return;
    }

    const manager = managerForGroup(groupItem.group.id);
    if (!manager) {
      return;
    }

    const newName = await vscode.window.showInputBox({
      prompt: '请输入新的分组名称',
      value: groupItem.group.name,
      validateInput: (value) => (value.trim() ? undefined : '分组名称不能为空'),
    });
    if (!newName) {
      return;
    }

    await manager.renameGroup(groupItem.group.id, newName.trim());
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`分组已重命名为「${newName.trim()}」`, 3000);
  });

  register('tabGroups.setGroupColor', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const groupItem = resolveGroupItem(item, sidebar);
    if (!groupItem) {
      await vscode.window.showWarningMessage('请先在侧边栏选中一个分组。');
      return;
    }

    const manager = managerForGroup(groupItem.group.id);
    if (!manager) {
      return;
    }

    const picked = await vscode.window.showQuickPick(
      [
        {
          label: '默认（无颜色）',
          description: groupItem.group.color ? '清除当前颜色' : '当前',
          colorId: undefined as string | undefined,
        },
        ...GROUP_COLOR_OPTIONS.map((option) => ({
          label: `$(circle-filled) ${option.label}`,
          description: option.id === groupItem.group.color ? '当前' : option.id,
          colorId: option.id as string | undefined,
        })),
      ],
      { placeHolder: `为「${groupItem.group.name}」选择颜色` },
    );
    if (!picked) {
      return;
    }

    const ok = await manager.setGroupColor(groupItem.group.id, picked.colorId);
    if (!ok) {
      return;
    }
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(
      picked.colorId
        ? `分组「${groupItem.group.name}」颜色已设为 ${picked.colorId}`
        : `分组「${groupItem.group.name}」已恢复默认颜色`,
      3000,
    );
  });

  register('tabGroups.setGroupIcon', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const groupItem = resolveGroupItem(item, sidebar);
    if (!groupItem) {
      await vscode.window.showWarningMessage('请先在侧边栏选中一个分组。');
      return;
    }

    const manager = managerForGroup(groupItem.group.id);
    if (!manager) {
      return;
    }

    const picked = await vscode.window.showQuickPick(
      [
        {
          label: '默认（文件夹）',
          description: groupItem.group.icon ? '清除自定义图标' : '当前',
          iconId: undefined as string | undefined,
        },
        ...GROUP_ICON_OPTIONS.map((option) => ({
          label: `$(${option.id}) ${option.label}`,
          description: option.id === groupItem.group.icon ? '当前' : option.id,
          iconId: option.id as string | undefined,
        })),
      ],
      { placeHolder: `为「${groupItem.group.name}」选择图标` },
    );
    if (!picked) {
      return;
    }

    const ok = await manager.setGroupIcon(groupItem.group.id, picked.iconId);
    if (!ok) {
      return;
    }
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(
      picked.iconId
        ? `分组「${groupItem.group.name}」图标已设为 ${picked.iconId}`
        : `分组「${groupItem.group.name}」已恢复默认图标`,
      3000,
    );
  });

  register('tabGroups.expandAll', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const groupItem = resolveGroupItem(item, sidebar);
    if (!groupItem) {
      return;
    }

    const manager = managerForGroup(groupItem.group.id);
    if (!manager) {
      return;
    }

    const { name } = groupItem.group;
    const fileEntries = manager.getGroupFileEntriesRecursive(groupItem.group.id);
    if (fileEntries.length === 0) {
      await vscode.window.showInformationMessage(`分组「${name}」中没有文件。`);
      return;
    }

    const { opened, skipped } = await openGroupFiles(groupItem.folder, fileEntries);
    if (opened === 0) {
      await vscode.window.showWarningMessage(`分组「${name}」中没有可打开的文件。`);
      return;
    }

    const skipHint = skipped > 0 ? `，跳过 ${skipped} 个不可用文件` : '';
    vscode.window.setStatusBarMessage(`已打开分组「${name}」中的 ${opened} 个文件${skipHint}`, 3000);
  });

  register('tabGroups.collapseAll', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const groupItem = resolveGroupItem(item, sidebar);
    if (!groupItem) {
      return;
    }

    const manager = managerForGroup(groupItem.group.id);
    if (!manager) {
      return;
    }

    const { name } = groupItem.group;
    const fileEntries = manager.getGroupFileEntriesRecursive(groupItem.group.id);
    if (fileEntries.length === 0) {
      await vscode.window.showInformationMessage(`分组「${name}」中没有文件。`);
      return;
    }

    const closed = await closeGroupFiles(groupItem.folder, fileEntries);
    if (closed === 0) {
      await vscode.window.showInformationMessage(`分组「${name}」中没有已打开的标签页。`);
      return;
    }

    vscode.window.setStatusBarMessage(`已关闭分组「${name}」中的 ${closed} 个标签页`, 3000);
  });

  register('tabGroups.setManual', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const groupItem = resolveGroupItem(item, sidebar);
    if (!groupItem) {
      return;
    }

    const manager = managerForGroup(groupItem.group.id);
    if (!manager) {
      return;
    }

    await manager.clearGroupConfig(groupItem.group.id);
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`分组「${groupItem.group.name}」已设置为手动模式`, 3000);
  });

  register('tabGroups.setRegex', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const groupItem = resolveGroupItem(item, sidebar);
    if (!groupItem) {
      return;
    }

    const manager = managerForGroup(groupItem.group.id);
    if (!manager) {
      return;
    }

    const regex = await vscode.window.showInputBox({
      prompt: '请输入正则表达式（匹配文件相对路径）',
      placeHolder: String.raw`.*/components/.*\.tsx$`,
      value: manager.getRegexPattern(groupItem.group) ?? '',
      validateInput: (value) => {
        if (!value.trim()) {
          return '正则表达式不能为空';
        }
        return manager.validateRegex(value.trim()) ? undefined : '无效的正则表达式';
      },
    });
    if (!regex) {
      return;
    }

    await manager.setGroupConfig(groupItem.group.id, { type: 'regex', regex: regex.trim() });
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`分组「${groupItem.group.name}」已设置内嵌正则配置`, 3000);
  });

  register('tabGroups.setGlobalConfig', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const groupItem = resolveGroupItem(item, sidebar);
    if (!groupItem) {
      return;
    }

    const manager = managerForGroup(groupItem.group.id);
    if (!manager) {
      return;
    }

    const configs = manager.getConfigs();
    if (configs.length === 0) {
      await vscode.window.showInformationMessage('暂无全局配置，请先通过「管理全局配置」创建。');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      configs.map((config) => ({
        label: config.id,
        description: config.description ?? (config.type === 'regex' ? config.regex : '手动'),
        configId: config.id,
      })),
      { placeHolder: '选择要引用的全局配置' },
    );
    if (!picked) {
      return;
    }

    await manager.setGroupConfigId(groupItem.group.id, picked.configId);
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`分组「${groupItem.group.name}」已引用全局配置「${picked.configId}」`, 3000);
  });

  register('tabGroups.manageGlobalConfigs', async () => {
    if (!(await requireFolders())) {
      return;
    }

    const manager = await workspace.resolveTargetManager(
      undefined,
      '选择要编辑全局配置的工作区文件夹',
    );
    if (!manager) {
      return;
    }

    const configUri = manager.getConfigFileUri();
    if (!configUri) {
      return;
    }

    const doc = await vscode.workspace.openTextDocument(configUri);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });

    const text = doc.getText();
    const configsIndex = text.indexOf('"configs"');
    if (configsIndex >= 0) {
      const position = doc.positionAt(configsIndex);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
  });

  register('tabGroups.scanFiles', async (item?: GroupTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const groupItem = resolveGroupItem(item, sidebar);
    if (!groupItem) {
      return;
    }

    const manager = managerForGroup(groupItem.group.id);
    if (!manager) {
      return;
    }

    const pattern = manager.getRegexPattern(groupItem.group);
    if (!pattern) {
      await vscode.window.showWarningMessage('当前分组未配置有效的正则表达式。');
      return;
    }

    const regex = manager.validateRegex(pattern);
    if (!regex) {
      await vscode.window.showErrorMessage('正则表达式无效，请重新设置。');
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `正在扫描分组「${groupItem.group.name}」`,
        cancellable: true,
      },
      async (progress, token) => {
        progress.report({ message: '正在查找工作区文件...' });

        const uris = await vscode.workspace.findFiles(
          new vscode.RelativePattern(manager.folder, '**/*'),
          '**/node_modules/**',
        );
        if (token.isCancellationRequested) {
          return;
        }

        const matched: string[] = [];
        for (const uri of uris) {
          if (token.isCancellationRequested) {
            return;
          }
          const relativePath = toRelativePath(uri, manager.folder);
          if (relativePath && regex.test(relativePath)) {
            matched.push(relativePath);
          }
        }

        matched.sort();
        await manager.updateGroupFiles(groupItem.group.id, matched);
        treeProvider.refresh();
        vscode.window.setStatusBarMessage(
          `分组「${groupItem.group.name}」扫描完成，共 ${matched.length} 个文件`,
          3000,
        );
      },
    );
  });

  register('tabGroups.openFile', async (item?: FileTreeItem) => {
    item = resolveFileItem(item, sidebar);
    if (!item) {
      return;
    }

    const success = await openFileEntry(item.folder, item.fileEntry);
    if (!success) {
      await vscode.window.showErrorMessage(`无法打开文件：${item.relativePath}`);
    }
  });

  register('tabGroups.openMarker', async (item?: MarkerTreeItem) => {
    item = item instanceof MarkerTreeItem ? item : asMarker(sidebar.getSelection());
    if (!item) {
      return;
    }

    const manager = managerForGroup(item.groupId);
    const entry = manager?.getFileEntry(
      item.groupId,
      item.relativePath,
      item.entryFolder,
    );
    if (!manager || !entry) {
      return;
    }

    const success = await openFileAtMarker(item.folder, entry, item.marker);
    if (!success) {
      await vscode.window.showErrorMessage(`无法打开文件：${item.relativePath}`);
    }
  });

  // 兼容旧命令 id
  register('tabGroups.openCursor', async (item?: MarkerTreeItem) => {
    await vscode.commands.executeCommand('tabGroups.openMarker', item);
  });

  register('tabGroups.addCursor', async (item?: FileTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const resolved = await resolveAddMarkerTarget(item, workspace, sidebar);
    if (!resolved) {
      return;
    }
    const { target, manager } = resolved;

    const sourceFolder =
      resolveEntryFolder(manager.folder, { folder: target.entryFolder }) ?? manager.folder;
    const editor = getMatchingActiveEditor(sourceFolder, target.relativePath);
    if (!editor) {
      await vscode.window.showWarningMessage(`请打开「${target.relativePath}」并将光标置于目标行。`);
      return;
    }

    const { line, character } = editor.selection.active;
    const updated = await manager.addMarker(
      target.groupId,
      target.relativePath,
      {
        type: 'cursor',
        line,
        column: character,
      },
      target.entryFolder,
    );
    if (!updated) {
      return;
    }

    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已为「${target.alias}」添加游标 L${line + 1}`, 3000);
  });

  register('tabGroups.addFunction', async (item?: FileTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const resolved = await resolveAddMarkerTarget(item, workspace, sidebar);
    if (!resolved) {
      return;
    }
    const { target, manager } = resolved;

    const sourceFolder =
      resolveEntryFolder(manager.folder, { folder: target.entryFolder }) ?? manager.folder;
    const editor = getMatchingActiveEditor(sourceFolder, target.relativePath);
    if (!editor) {
      await vscode.window.showWarningMessage(`请打开「${target.relativePath}」并将光标置于函数内。`);
      return;
    }

    const enclosing = await resolveEnclosingFunctionSymbol(
      editor.document,
      editor.selection.active,
    );
    if (!enclosing) {
      await vscode.window.showWarningMessage('当前位置未检测到函数/方法符号。');
      return;
    }

    const { line, character } = enclosing.range.start;
    const updated = await manager.addMarker(
      target.groupId,
      target.relativePath,
      {
        type: 'function',
        line,
        column: character,
        label: enclosing.name,
        symbolName: enclosing.name,
        symbolKind: enclosing.kind,
      },
      target.entryFolder,
    );
    if (!updated) {
      return;
    }

    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已为「${target.alias}」添加函数标记「${enclosing.name}」`, 3000);
  });

  register('tabGroups.addText', async (item?: FileTreeItem) => {
    if (!(await requireFolders())) {
      return;
    }

    const resolved = await resolveAddMarkerTarget(item, workspace, sidebar);
    if (!resolved) {
      return;
    }
    const { target, manager } = resolved;

    const sourceFolder =
      resolveEntryFolder(manager.folder, { folder: target.entryFolder }) ?? manager.folder;
    const editor = getMatchingActiveEditor(sourceFolder, target.relativePath);
    if (!editor) {
      await vscode.window.showWarningMessage(`请打开「${target.relativePath}」并选中或定位要匹配的文本。`);
      return;
    }

    const selection = editor.selection;
    let query = editor.document.getText(selection).trim();
    if (!query) {
      const wordRange = editor.document.getWordRangeAtPosition(
        selection.active,
        /[A-Za-z0-9_$.\-\u4e00-\u9fff]+/,
      );
      query = wordRange ? editor.document.getText(wordRange).trim() : '';
    }
    if (!query) {
      const typed = await vscode.window.showInputBox({
        prompt: '请输入要匹配的字符（支持模糊定位）',
        validateInput: (value) => (value.trim() ? undefined : '不能为空'),
      });
      if (!typed) {
        return;
      }
      query = typed.trim();
    }

    const { line, character } = selection.active;
    const updated = await manager.addMarker(
      target.groupId,
      target.relativePath,
      {
        type: 'text',
        line,
        column: character,
        query,
        label: query.length > 24 ? `${query.slice(0, 24)}…` : query,
      },
      target.entryFolder,
    );
    if (!updated) {
      return;
    }

    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已为「${target.alias}」添加字符匹配「${query}」`, 3000);
  });

  register('tabGroups.deleteMarker', async (item?: MarkerTreeItem) => {
    item = item instanceof MarkerTreeItem ? item : asMarker(sidebar.getSelection());
    if (!item) {
      return;
    }

    const manager = managerForGroup(item.groupId);
    if (!manager) {
      return;
    }

    const removed = await manager.removeMarker(
      item.groupId,
      item.relativePath,
      item.marker.type,
      item.marker.contentIndex,
      item.entryFolder,
    );
    if (!removed) {
      return;
    }

    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已删除标记「${item.marker.item.label}」`, 3000);
  });

  register('tabGroups.deleteCursor', async (item?: MarkerTreeItem) => {
    await vscode.commands.executeCommand('tabGroups.deleteMarker', item);
  });

  register('tabGroups.renameMarker', async (item?: MarkerTreeItem) => {
    item = item instanceof MarkerTreeItem ? item : asMarker(sidebar.getSelection());
    if (!item) {
      return;
    }

    const manager = managerForGroup(item.groupId);
    if (!manager) {
      return;
    }

    const newLabel = await vscode.window.showInputBox({
      prompt: '请输入标记名称',
      value: item.marker.item.label,
      validateInput: (value) => (value.trim() ? undefined : '名称不能为空'),
    });
    if (!newLabel) {
      return;
    }

    const renamed = await manager.renameMarker(
      item.groupId,
      item.relativePath,
      item.marker.type,
      item.marker.contentIndex,
      newLabel.trim(),
      item.entryFolder,
    );
    if (!renamed) {
      return;
    }

    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`标记已重命名为「${newLabel.trim()}」`, 3000);
  });

  register('tabGroups.renameCursor', async (item?: MarkerTreeItem) => {
    await vscode.commands.executeCommand('tabGroups.renameMarker', item);
  });

  register('tabGroups.prevCursor', async () => {
    await jumpMarker(workspace, 'prev');
  });

  register('tabGroups.nextCursor', async () => {
    await jumpMarker(workspace, 'next');
  });

  register('tabGroups.removeFile', async (item?: FileTreeItem) => {
    item = resolveFileItem(item, sidebar);
    if (!item) {
      return;
    }

    const manager = managerForGroup(item.groupId);
    if (!manager) {
      return;
    }

    await manager.removeFileFromGroup(item.groupId, item.relativePath, item.entryFolder);
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已从分组中移除 ${item.relativePath}`, 3000);
  });

  register('tabGroups.copyPath', async (item?: FileTreeItem) => {
    item = resolveFileItem(item, sidebar);
    if (!item) {
      return;
    }

    const display = formatEntryDisplayPath(item.fileEntry, item.folder.name);
    await vscode.env.clipboard.writeText(display);
    vscode.window.setStatusBarMessage(`已复制路径：${display}`, 3000);
  });

  register('tabGroups.renameFile', async (item?: FileTreeItem) => {
    item = resolveFileItem(item, sidebar);
    if (!item) {
      return;
    }

    const manager = managerForGroup(item.groupId);
    if (!manager) {
      return;
    }

    const currentEntry = manager.getFileEntry(
      item.groupId,
      item.relativePath,
      item.entryFolder,
    );
    if (!currentEntry) {
      return;
    }

    const newAlias = await vscode.window.showInputBox({
      prompt: '请输入显示名称（仅影响侧边栏展示，不修改磁盘文件）',
      value: currentEntry.alias,
      validateInput: (value) => (value.trim() ? undefined : '显示名称不能为空'),
    });
    if (!newAlias) {
      return;
    }

    let applyToAllGroups = false;
    if (manager.countGroupsContainingFile(item.relativePath, item.entryFolder) > 1) {
      const choice = await vscode.window.showInformationMessage(
        '是否要修改所有组别里的别名？',
        '是',
        '否',
      );
      if (!choice) {
        return;
      }
      applyToAllGroups = choice === '是';
    }

    await manager.renameFileAlias(
      item.groupId,
      item.relativePath,
      newAlias.trim(),
      applyToAllGroups,
      item.entryFolder,
    );
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已将 ${item.relativePath} 的显示名称改为「${newAlias.trim()}」`, 3000);
  });

  register('tabGroups.addToGroup', async (uri?: vscode.Uri) => {
    if (!(await requireFolders())) {
      return;
    }

    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) {
      await vscode.window.showWarningMessage('没有可加入分组的文件。');
      return;
    }

    const fileFolder = resolveWorkspaceFolder(targetUri);
    const relativePath = toRelativePath(targetUri, fileFolder);
    if (!fileFolder || !relativePath) {
      await vscode.window.showWarningMessage('只能将工作区内的文件加入分组。');
      return;
    }

    const picks = workspace.listAllGroupsForPick();
    if (picks.length === 0) {
      await vscode.window.showInformationMessage('暂无分组，请先在侧边栏创建分组。');
      return;
    }

    const picked = await vscode.window.showQuickPick(picks, {
      placeHolder: '选择要加入的分组（可跨工作区文件夹）',
    });
    if (!picked) {
      return;
    }

    const added = await picked.manager.addFileToGroup(
      picked.groupId,
      relativePath,
      fileFolder.name,
    );
    treeProvider.refresh();
    if (added) {
      vscode.window.setStatusBarMessage(`已将 ${relativePath} 加入分组「${picked.label}」`, 3000);
    } else {
      vscode.window.setStatusBarMessage(`文件已在分组「${picked.label}」中`, 3000);
    }
  });

  register('tabGroups.removeFromGroup', async (uri?: vscode.Uri) => {
    if (!(await requireFolders())) {
      return;
    }

    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) {
      await vscode.window.showWarningMessage('没有可取消分组的文件。');
      return;
    }

    const fileFolder = resolveWorkspaceFolder(targetUri);
    const relativePath = toRelativePath(targetUri, fileFolder);
    if (!fileFolder || !relativePath) {
      await vscode.window.showWarningMessage('只能操作工作区内的文件。');
      return;
    }

    const hits = workspace.findGroupsContainingFile(fileFolder, relativePath);
    if (hits.length === 0) {
      await vscode.window.showInformationMessage('当前文件不属于任何分组。');
      return;
    }

    const multi = workspace.isMultiRoot();
    const picked = await vscode.window.showQuickPick(
      [
        {
          label: '全部分组',
          description: '一次性从所有分组中移除',
          groupId: '__all__',
          manager: undefined as TabGroupsManager | undefined,
        },
        ...hits.map(({ manager, group }) => ({
          label: multi
            ? `${manager.folder.name} / ${manager.getGroupPathLabel(group.id)}`
            : manager.getGroupPathLabel(group.id),
          groupId: group.id,
          manager: manager as TabGroupsManager | undefined,
        })),
      ],
      { placeHolder: '选择要退出的分组' },
    );
    if (!picked) {
      return;
    }

    if (picked.groupId === '__all__') {
      let count = 0;
      for (const { manager } of hits) {
        count += await manager.removeFileFromAllGroups(relativePath, fileFolder.name);
      }
      treeProvider.refresh();
      vscode.window.setStatusBarMessage(`已将 ${relativePath} 从 ${count} 个分组中移除`, 3000);
      return;
    }

    if (!picked.manager) {
      return;
    }
    await picked.manager.removeFileFromGroup(
      picked.groupId,
      relativePath,
      fileFolder.name,
    );
    treeProvider.refresh();
    vscode.window.setStatusBarMessage(`已将 ${relativePath} 从分组「${picked.label}」中移除`, 3000);
  });
}

function resolveGroupItem(
  item: GroupTreeItem | undefined,
  sidebar: TabGroupsSearchViewProvider,
): GroupTreeItem | undefined {
  if (item instanceof GroupTreeItem) {
    return item;
  }
  const selection = sidebar.getSelection();
  if (selection instanceof GroupTreeItem) {
    return selection;
  }
  return undefined;
}

interface AddMarkerTarget {
  groupId: string;
  relativePath: string;
  alias: string;
  entryFolder?: string;
}

async function resolveAddMarkerTarget(
  item: FileTreeItem | undefined,
  workspace: TabGroupsWorkspace,
  sidebar: TabGroupsSearchViewProvider,
): Promise<{ target: AddMarkerTarget; manager: TabGroupsManager } | undefined> {
  const fileItem = resolveFileItem(item, sidebar);
  if (fileItem) {
    const manager = workspace.findManagerByGroupId(fileItem.groupId);
    if (!manager) {
      return undefined;
    }
    return {
      manager,
      target: {
        groupId: fileItem.groupId,
        relativePath: fileItem.relativePath,
        alias: fileItem.fileEntry.alias,
        entryFolder: fileItem.entryFolder,
      },
    };
  }

  const targetUri = vscode.window.activeTextEditor?.document.uri;
  if (!targetUri) {
    await vscode.window.showWarningMessage('请先在编辑器中打开文件，或在侧边栏选中文件节点。');
    return undefined;
  }

  const fileFolder = resolveWorkspaceFolder(targetUri);
  const relativePath = toRelativePath(targetUri, fileFolder);
  if (!fileFolder || !relativePath) {
    await vscode.window.showWarningMessage('只能为工作区内的文件添加标记。');
    return undefined;
  }

  const hits = workspace.findGroupsContainingFile(fileFolder, relativePath);
  if (hits.length === 0) {
    await vscode.window.showWarningMessage('当前文件不在任何分组中，请先加入分组。');
    return undefined;
  }

  const multi = workspace.isMultiRoot();
  if (hits.length === 1) {
    const { manager, group } = hits[0];
    const entry = manager.getFileEntry(group.id, relativePath, fileFolder.name);
    return {
      manager,
      target: {
        groupId: group.id,
        relativePath,
        alias: entry?.alias ?? relativePath.split('/').pop() ?? relativePath,
        entryFolder: entry?.folder,
      },
    };
  }

  const picked = await vscode.window.showQuickPick(
    hits.map(({ manager, group }) => ({
      label: multi
        ? `${manager.folder.name} / ${manager.getGroupPathLabel(group.id)}`
        : manager.getGroupPathLabel(group.id),
      groupId: group.id,
      manager,
    })),
    { placeHolder: '选择要添加标记的分组' },
  );
  if (!picked) {
    return undefined;
  }

  const entry = picked.manager.getFileEntry(picked.groupId, relativePath, fileFolder.name);
  return {
    manager: picked.manager,
    target: {
      groupId: picked.groupId,
      relativePath,
      alias: entry?.alias ?? relativePath.split('/').pop() ?? relativePath,
      entryFolder: entry?.folder,
    },
  };
}

function resolveFileItem(
  item: FileTreeItem | undefined,
  sidebar: TabGroupsSearchViewProvider,
): FileTreeItem | undefined {
  if (item instanceof FileTreeItem) {
    return item;
  }
  const selection = sidebar.getSelection();
  if (selection instanceof FileTreeItem) {
    return selection;
  }
  return undefined;
}

function asMarker(item: TreeElement | undefined): MarkerTreeItem | undefined {
  return item instanceof MarkerTreeItem ? item : undefined;
}

async function jumpMarker(workspace: TabGroupsWorkspace, direction: 'prev' | 'next'): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await vscode.window.showWarningMessage('请先在编辑器中打开文件。');
    return;
  }

  const fileFolder = resolveWorkspaceFolder(editor.document.uri);
  const relativePath = toRelativePath(editor.document.uri, fileFolder);
  if (!fileFolder || !relativePath) {
    await vscode.window.showWarningMessage('只能在工作区内的文件中跳转标记。');
    return;
  }

  const hits = workspace
    .findGroupsContainingFile(fileFolder, relativePath)
    .filter(({ manager, group }) => {
      const entry = manager.getFileEntry(group.id, relativePath, fileFolder.name);
      return countMarkers(entry?.markers) > 0;
    });

  if (hits.length === 0) {
    await vscode.window.showWarningMessage('当前文件没有已保存的标记。');
    return;
  }

  let manager = hits[0].manager;
  let groupId = hits[0].group.id;
  if (hits.length > 1) {
    const multi = workspace.isMultiRoot();
    const picked = await vscode.window.showQuickPick(
      hits.map((hit) => ({
        label: multi
          ? `${hit.manager.folder.name} / ${hit.manager.getGroupPathLabel(hit.group.id)}`
          : hit.manager.getGroupPathLabel(hit.group.id),
        groupId: hit.group.id,
        manager: hit.manager,
      })),
      { placeHolder: '选择要跳转标记的分组' },
    );
    if (!picked) {
      return;
    }
    groupId = picked.groupId;
    manager = picked.manager;
  }

  const entry = manager.getFileEntry(groupId, relativePath, fileFolder.name);
  const markers = flattenMarkers(entry?.markers);
  if (markers.length === 0) {
    return;
  }

  const ordered = sortFlatMarkersByLine(markers);
  const current = editor.selection.active;
  let index = ordered.findIndex(
    (marker) =>
      marker.item.line > current.line ||
      (marker.item.line === current.line && marker.item.column >= current.character),
  );

  if (direction === 'next') {
    if (index < 0) {
      index = 0;
    } else if (
      ordered[index].item.line === current.line &&
      ordered[index].item.column === current.character
    ) {
      index = (index + 1) % ordered.length;
    }
  } else {
    if (index < 0) {
      index = ordered.length - 1;
    } else if (
      ordered[index].item.line === current.line &&
      ordered[index].item.column === current.character
    ) {
      index = (index - 1 + ordered.length) % ordered.length;
    } else {
      index = (index - 1 + ordered.length) % ordered.length;
    }
  }

  await revealMarkerInEditor(editor, ordered[index]);
}
