import * as vscode from 'vscode';
import { TabGroupsManager } from './tabGroupsManager';
import {
  getWorkspaceFolders,
  isMultiRootWorkspace,
  pickWorkspaceFolder,
  resolveWorkspaceFolder,
} from '../workspace/workspaceUtils';

/**
 * 多根工作区下的分组数据门面：每个 WorkspaceFolder 对应一个 TabGroupsManager。
 */
export class TabGroupsWorkspace {
  private readonly managers = new Map<string, TabGroupsManager>();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private readonly managerSubscriptions: vscode.Disposable[] = [];

  /** 按当前 workspaceFolders 重建 manager 并全部 load。 */
  async loadAll(): Promise<void> {
    this.disposeManagers();
    for (const folder of getWorkspaceFolders()) {
      const manager = new TabGroupsManager(folder);
      this.managers.set(folderKey(folder), manager);
      this.managerSubscriptions.push(
        manager.onDidChange(() => this.onDidChangeEmitter.fire()),
      );
    }
    await Promise.all([...this.managers.values()].map((m) => m.load()));
  }

  /** 仅重新加载某一根的配置（不重建实例）。 */
  async reloadFolder(folder: vscode.WorkspaceFolder): Promise<void> {
    const manager = this.getManager(folder);
    if (manager) {
      await manager.load();
    }
  }

  getManagers(): TabGroupsManager[] {
    return getWorkspaceFolders()
      .map((folder) => this.managers.get(folderKey(folder)))
      .filter((m): m is TabGroupsManager => m !== undefined);
  }

  getManager(folder: vscode.WorkspaceFolder): TabGroupsManager | undefined {
    return this.managers.get(folderKey(folder));
  }

  getManagerByFolderUri(folderUri: vscode.Uri): TabGroupsManager | undefined {
    return this.managers.get(folderUri.toString());
  }

  findManagerByGroupId(groupId: string): TabGroupsManager | undefined {
    for (const manager of this.managers.values()) {
      if (manager.getGroup(groupId)) {
        return manager;
      }
    }
    return undefined;
  }

  findManagerByUri(uri: vscode.Uri): TabGroupsManager | undefined {
    const folder = resolveWorkspaceFolder(uri);
    return folder ? this.getManager(folder) : undefined;
  }

  containsFilePath(folder: vscode.WorkspaceFolder, relativePath: string): boolean {
    return this.getManager(folder)?.containsFilePath(relativePath) ?? false;
  }

  isMultiRoot(): boolean {
    return isMultiRootWorkspace();
  }

  /**
   * 解析写操作目标根：优先传入的 folder；否则多根 QuickPick；单根直接返回。
   */
  async resolveTargetManager(
    preferred?: vscode.WorkspaceFolder,
    placeHolder = '选择要操作的工作区文件夹',
  ): Promise<TabGroupsManager | undefined> {
    if (preferred) {
      return this.getManager(preferred);
    }
    const folder = await pickWorkspaceFolder(placeHolder);
    return folder ? this.getManager(folder) : undefined;
  }

  dispose(): void {
    this.disposeManagers();
    this.onDidChangeEmitter.dispose();
  }

  private disposeManagers(): void {
    for (const sub of this.managerSubscriptions) {
      sub.dispose();
    }
    this.managerSubscriptions.length = 0;
    this.managers.clear();
  }
}

function folderKey(folder: vscode.WorkspaceFolder): string {
  return folder.uri.toString();
}
