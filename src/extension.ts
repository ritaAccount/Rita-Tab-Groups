import * as vscode from 'vscode';
import { registerCommands } from './tree/commands';
import { fileExistenceCache } from './workspace/fileExistenceCache';
import { ensureWorkspaceShortcutSettings, syncKeybindingsFromSettings } from './settings/shortcutUtils';
import { initializeShortcutSettings, registerSettingsCommands } from './settings/settingsWebview';
import { TabGroupsManager } from './data/tabGroupsManager';
import { TabGroupsTreeProvider } from './tree/treeProvider';
import { registerSearchView } from './tree/searchView';
import { CONFIG_RELATIVE_PATH } from './data/types';
import { registerMarkerJumpHint } from './tree/fileLocationUtils';
import { isValidWorkspace, toRelativePath } from './workspace/workspaceUtils';

let manager: TabGroupsManager | undefined;
let treeProvider: TabGroupsTreeProvider | undefined;
let configWatcher: vscode.FileSystemWatcher | undefined;
let workspaceFileWatcher: vscode.FileSystemWatcher | undefined;
let isReloadingFromDisk = false;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  manager = new TabGroupsManager();
  treeProvider = new TabGroupsTreeProvider(manager);
  const sidebar = registerSearchView(context, treeProvider);

  registerMarkerJumpHint(context);
  registerCommands(context, manager, treeProvider, sidebar);
  registerSettingsCommands(context, manager, {
    onConfigUpgraded: () => {
      treeProvider?.refresh();
    },
    onDisplaySettingsChanged: () => {
      treeProvider?.refresh();
    },
  });

  context.subscriptions.push(
    manager.onDidChange(() => {
      if (!isReloadingFromDisk) {
        treeProvider?.refresh();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      fileExistenceCache.clear();
      await reloadAll(context);
      await initializeShortcutSettings();
      await syncKeybindingsFromSettings();
    }),
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (isConfigFile(doc.uri)) {
        await reloadFromDisk();
      }
    }),
  );

  await reloadAll(context);
  await initializeShortcutSettings();
  try {
    await syncKeybindingsFromSettings();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Tab Groups: 同步 keybindings.json 失败：${detail}`);
  }
}

export function deactivate(): void {
  configWatcher?.dispose();
  configWatcher = undefined;
  workspaceFileWatcher?.dispose();
  workspaceFileWatcher = undefined;
  fileExistenceCache.clear();
  manager = undefined;
  treeProvider = undefined;
}

async function reloadAll(context: vscode.ExtensionContext): Promise<void> {
  setupConfigWatcher(context);
  setupWorkspaceFileWatcher(context);

  if (!isValidWorkspace()) {
    fileExistenceCache.clear();
    treeProvider?.refresh();
    return;
  }

  await reloadFromDisk();
}

async function reloadFromDisk(): Promise<void> {
  if (!manager) {
    return;
  }

  isReloadingFromDisk = true;
  try {
    await manager.load();
    treeProvider?.refresh();
  } finally {
    isReloadingFromDisk = false;
  }
}

function setupConfigWatcher(context: vscode.ExtensionContext): void {
  configWatcher?.dispose();
  configWatcher = undefined;

  if (!isValidWorkspace()) {
    return;
  }

  const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders![0], CONFIG_RELATIVE_PATH);
  configWatcher = vscode.workspace.createFileSystemWatcher(pattern);

  const handleExternalChange = async () => {
    await reloadFromDisk();
    vscode.window.setStatusBarMessage('标签分组配置已重新加载', 3000);
  };

  configWatcher.onDidChange(handleExternalChange);
  configWatcher.onDidCreate(handleExternalChange);
  configWatcher.onDidDelete(async () => {
    if (manager) {
      await manager.load();
      treeProvider?.refresh();
      vscode.window.setStatusBarMessage('标签分组配置文件已删除，已恢复默认结构', 3000);
    }
  });

  context.subscriptions.push(configWatcher);
}

function setupWorkspaceFileWatcher(context: vscode.ExtensionContext): void {
  workspaceFileWatcher?.dispose();
  workspaceFileWatcher = undefined;

  if (!isValidWorkspace()) {
    return;
  }

  const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders![0], '**/*');
  workspaceFileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

  const handlePathsChanged = (paths: string[]): void => {
    if (paths.length === 0 || !manager || !treeProvider) {
      return;
    }

    fileExistenceCache.invalidateMany(paths);
    const affectsGroups = paths.some((path) => manager!.containsFilePath(path));
    if (affectsGroups) {
      treeProvider.refresh();
    }
  };

  workspaceFileWatcher.onDidCreate((uri) => {
    const path = toRelativePath(uri);
    if (path) {
      handlePathsChanged([path]);
    }
  });

  workspaceFileWatcher.onDidDelete((uri) => {
    const path = toRelativePath(uri);
    if (path) {
      handlePathsChanged([path]);
    }
  });

  context.subscriptions.push(
    workspaceFileWatcher,
    vscode.workspace.onDidRenameFiles((event) => {
      const paths: string[] = [];
      for (const { oldUri, newUri } of event.files) {
        const oldPath = toRelativePath(oldUri);
        const newPath = toRelativePath(newUri);
        if (oldPath) {
          paths.push(oldPath);
        }
        if (newPath) {
          paths.push(newPath);
        }
      }
      handlePathsChanged(paths);
    }),
  );
}

function isConfigFile(uri: vscode.Uri): boolean {
  return uri.fsPath.endsWith('tab-groups.json') || uri.path.endsWith(CONFIG_RELATIVE_PATH);
}
