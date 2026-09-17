import * as vscode from 'vscode';
import { registerCommands } from './tree/commands';
import { fileExistenceCache } from './workspace/fileExistenceCache';
import { ensureWorkspaceShortcutSettings, syncKeybindingsFromSettings } from './settings/shortcutUtils';
import { initializeShortcutSettings, registerSettingsCommands } from './settings/settingsWebview';
import { TabGroupsWorkspace } from './data/tabGroupsWorkspace';
import { TabGroupsTreeProvider } from './tree/treeProvider';
import { registerSearchView } from './tree/searchView';
import { CONFIG_RELATIVE_PATH } from './data/types';
import { registerMarkerJumpHint } from './tree/fileLocationUtils';
import {
  getWorkspaceFolders,
  isValidWorkspace,
  resolveWorkspaceFolder,
  toRelativePath,
} from './workspace/workspaceUtils';
import { ensureWorkspaceAiGuides } from './workspace/aiGuideUtils';

let workspace: TabGroupsWorkspace | undefined;
let treeProvider: TabGroupsTreeProvider | undefined;
let configWatchers: vscode.FileSystemWatcher[] = [];
let workspaceFileWatchers: vscode.FileSystemWatcher[] = [];
let isReloadingFromDisk = false;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  workspace = new TabGroupsWorkspace();
  treeProvider = new TabGroupsTreeProvider(workspace);
  const sidebar = registerSearchView(context, treeProvider);

  registerMarkerJumpHint(context);
  registerCommands(context, workspace, treeProvider, sidebar);
  registerSettingsCommands(context, workspace, {
    onConfigUpgraded: () => {
      treeProvider?.refresh();
    },
    onDisplaySettingsChanged: () => {
      treeProvider?.refresh();
    },
    onImportExportDone: () => {
      treeProvider?.refresh();
    },
  });

  context.subscriptions.push(
    workspace.onDidChange(() => {
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
        await reloadFromDisk(doc.uri);
      }
    }),
    {
      dispose: () => {
        workspace?.dispose();
      },
    },
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
  disposeWatchers(configWatchers);
  configWatchers = [];
  disposeWatchers(workspaceFileWatchers);
  workspaceFileWatchers = [];
  fileExistenceCache.clear();
  workspace?.dispose();
  workspace = undefined;
  treeProvider = undefined;
}

async function reloadAll(context: vscode.ExtensionContext): Promise<void> {
  setupConfigWatchers(context);
  setupWorkspaceFileWatchers(context);

  if (!isValidWorkspace() || !workspace) {
    fileExistenceCache.clear();
    treeProvider?.refresh();
    return;
  }

  isReloadingFromDisk = true;
  try {
    await workspace.loadAll();
    await ensureWorkspaceAiGuides();
    treeProvider?.refresh();
  } finally {
    isReloadingFromDisk = false;
  }
}

async function reloadFromDisk(configUri?: vscode.Uri): Promise<void> {
  if (!workspace) {
    return;
  }

  isReloadingFromDisk = true;
  try {
    if (configUri) {
      const folder = resolveWorkspaceFolder(configUri);
      if (folder) {
        await workspace.reloadFolder(folder);
      } else {
        await workspace.loadAll();
      }
    } else {
      await workspace.loadAll();
    }
    treeProvider?.refresh();
  } finally {
    isReloadingFromDisk = false;
  }
}

function setupConfigWatchers(context: vscode.ExtensionContext): void {
  disposeWatchers(configWatchers);
  configWatchers = [];

  if (!isValidWorkspace()) {
    return;
  }

  for (const folder of getWorkspaceFolders()) {
    const pattern = new vscode.RelativePattern(folder, CONFIG_RELATIVE_PATH);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const handleExternalChange = async () => {
      await reloadFromDisk(vscode.Uri.joinPath(folder.uri, CONFIG_RELATIVE_PATH));
      vscode.window.setStatusBarMessage('标签分组配置已重新加载', 3000);
    };

    watcher.onDidChange(handleExternalChange);
    watcher.onDidCreate(handleExternalChange);
    watcher.onDidDelete(async () => {
      await workspace?.reloadFolder(folder);
      treeProvider?.refresh();
      vscode.window.setStatusBarMessage('标签分组配置文件已删除，已恢复默认结构', 3000);
    });

    configWatchers.push(watcher);
    context.subscriptions.push(watcher);
  }
}

function setupWorkspaceFileWatchers(context: vscode.ExtensionContext): void {
  disposeWatchers(workspaceFileWatchers);
  workspaceFileWatchers = [];

  if (!isValidWorkspace()) {
    return;
  }

  for (const folder of getWorkspaceFolders()) {
    const pattern = new vscode.RelativePattern(folder, '**/*');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const handlePathsChanged = (relativePaths: string[]): void => {
      if (relativePaths.length === 0 || !workspace || !treeProvider) {
        return;
      }

      fileExistenceCache.invalidateMany(
        relativePaths.map((relativePath) => ({ folder, relativePath })),
      );
      const affectsGroups = relativePaths.some((path) =>
        workspace!.containsFilePath(folder, path),
      );
      if (affectsGroups) {
        treeProvider.refresh();
      }
    };

    watcher.onDidCreate((uri) => {
      const path = toRelativePath(uri, folder);
      if (path) {
        handlePathsChanged([path]);
      }
    });

    watcher.onDidDelete((uri) => {
      const path = toRelativePath(uri, folder);
      if (path) {
        handlePathsChanged([path]);
      }
    });

    workspaceFileWatchers.push(watcher);
    context.subscriptions.push(watcher);
  }

  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles((event) => {
      const byFolder = new Map<string, { folder: vscode.WorkspaceFolder; paths: string[] }>();
      for (const { oldUri, newUri } of event.files) {
        for (const uri of [oldUri, newUri]) {
          const folder = resolveWorkspaceFolder(uri);
          const path = folder ? toRelativePath(uri, folder) : undefined;
          if (!folder || !path) {
            continue;
          }
          const key = folder.uri.toString();
          let bucket = byFolder.get(key);
          if (!bucket) {
            bucket = { folder, paths: [] };
            byFolder.set(key, bucket);
          }
          bucket.paths.push(path);
        }
      }
      for (const { folder, paths } of byFolder.values()) {
        fileExistenceCache.invalidateMany(paths.map((relativePath) => ({ folder, relativePath })));
        if (paths.some((path) => workspace?.containsFilePath(folder, path))) {
          treeProvider?.refresh();
        }
      }
    }),
  );
}

function disposeWatchers(watchers: vscode.FileSystemWatcher[]): void {
  for (const watcher of watchers) {
    watcher.dispose();
  }
}

function isConfigFile(uri: vscode.Uri): boolean {
  return uri.fsPath.endsWith('tab-groups.json') || uri.path.endsWith(CONFIG_RELATIVE_PATH);
}
