import * as vscode from 'vscode';
import { TabGroupsManager } from '../data/tabGroupsManager';
import { getGroupPathLabel } from '../data/groupHierarchyUtils';
import { ensureValidWorkspace } from '../workspace/workspaceUtils';

/** 设置页 / 命令：导出全部或所选分组；成功写入文件返回 true */
export async function runExportTabGroups(
  manager: TabGroupsManager,
  presetGroupIds?: string[],
): Promise<boolean> {
  const folder = await ensureValidWorkspace();
  if (!folder) {
    return false;
  }

  let selectedIds = presetGroupIds;

  if (!selectedIds) {
    const mode = await vscode.window.showQuickPick(
      [
        { label: '导出全部配置', description: '所有分组与全局规则', mode: 'all' as const },
        { label: '选择分组导出', description: '可多选；含子树与引用的全局规则', mode: 'partial' as const },
      ],
      { placeHolder: '选择导出范围' },
    );
    if (!mode) {
      return false;
    }

    if (mode.mode === 'partial') {
      const groups = manager.getGroups();
      if (groups.length === 0) {
        await vscode.window.showInformationMessage('当前没有可导出的分组。');
        return false;
      }

      const picked = await vscode.window.showQuickPick(
        groups.map((group) => ({
          label: getGroupPathLabel(groups, group.id),
          description: group.id.slice(0, 8),
          groupId: group.id,
        })),
        {
          placeHolder: '选择要导出的分组（可多选，自动包含子分组）',
          canPickMany: true,
        },
      );
      if (!picked || picked.length === 0) {
        return false;
      }
      selectedIds = picked.map((item) => item.groupId);
    }
  }

  const pkg = manager.buildExportPackage(selectedIds);
  if (pkg.groups.length === 0) {
    await vscode.window.showInformationMessage('没有可导出的分组。');
    return false;
  }

  const defaultName = selectedIds?.length
    ? 'tab-groups-partial.json'
    : 'tab-groups-export.json';

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(folder.uri, defaultName),
    filters: { JSON: ['json'] },
    saveLabel: '导出',
  });
  if (!uri) {
    return false;
  }

  const content = Buffer.from(JSON.stringify(pkg, null, 2), 'utf8');
  await vscode.workspace.fs.writeFile(uri, content);
  vscode.window.setStatusBarMessage(
    `已导出 ${pkg.groups.length} 个分组、${pkg.configs.length} 条全局规则`,
    4000,
  );
  return true;
}

/** 设置页 / 命令：从 JSON 文件导入；成功写入返回 true */
export async function runImportTabGroups(manager: TabGroupsManager): Promise<boolean> {
  const folder = await ensureValidWorkspace();
  if (!folder) {
    return false;
  }

  const pickedFiles = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: '导入',
    filters: { JSON: ['json'] },
    defaultUri: folder.uri,
  });
  if (!pickedFiles || pickedFiles.length === 0) {
    return false;
  }

  let raw: unknown;
  try {
    const bytes = await vscode.workspace.fs.readFile(pickedFiles[0]);
    raw = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await vscode.window.showErrorMessage(`读取导入文件失败：${message}`);
    return false;
  }

  let pkg;
  try {
    pkg = manager.parseImportPackage(raw);
  } catch {
    await vscode.window.showErrorMessage('导入文件格式无效，需要包含 groups 数组的 JSON。');
    return false;
  }

  if (pkg.groups.length === 0) {
    await vscode.window.showInformationMessage('导入文件中没有分组。');
    return false;
  }

  const modePick = await vscode.window.showQuickPick(
    [
      {
        label: '合并到当前配置',
        description: '分配新 ID，作为新的根级分组加入（推荐）',
        mode: 'merge' as const,
      },
      {
        label: '替换全部配置',
        description: '用导入内容覆盖当前全部 grouping 数据',
        mode: 'replace' as const,
      },
    ],
    { placeHolder: '选择导入方式' },
  );
  if (!modePick) {
    return false;
  }

  if (modePick.mode === 'replace') {
    const confirm = await vscode.window.showWarningMessage(
      `确定用导入文件替换全部配置吗？当前 ${manager.getGroups().length} 个分组将被覆盖。`,
      { modal: true },
      '替换',
    );
    if (confirm !== '替换') {
      return false;
    }
  }

  const result = await manager.importPackage(pkg, modePick.mode);
  const action = modePick.mode === 'merge' ? '合并导入' : '替换导入';
  vscode.window.setStatusBarMessage(
    `${action}完成：分组 ${result.groupsAdded}，全局规则 ${result.configsAdded}`,
    4000,
  );
  return true;
}
