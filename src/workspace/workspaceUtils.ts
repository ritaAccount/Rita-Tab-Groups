import * as vscode from 'vscode';

/** 当前工作区全部根文件夹（可能为空）。 */
export function getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
  return vscode.workspace.workspaceFolders ?? [];
}

/** 是否至少打开了一个工作区文件夹。 */
export function isValidWorkspace(): boolean {
  return getWorkspaceFolders().length > 0;
}

/** 是否为多根工作区。 */
export function isMultiRootWorkspace(): boolean {
  return getWorkspaceFolders().length > 1;
}

/**
 * 单根时返回该根；多根或无根返回 undefined。
 * 仅用于确实「只在单根有意义」的场景（例如隐藏 scope 层）。
 */
export function getSingleWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const folders = getWorkspaceFolders();
  return folders.length === 1 ? folders[0] : undefined;
}

/** 解析 uri 所属的工作区根；不在任一根下则 undefined。 */
export function resolveWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder(uri);
}

export function getWorkspaceInvalidMessage(): string {
  if (getWorkspaceFolders().length === 0) {
    return '请先打开一个工作区文件夹。';
  }
  return '';
}

/** 无工作区时提示并返回 undefined；有则返回全部根（调用方自行选目标根）。 */
export async function ensureValidWorkspace(): Promise<readonly vscode.WorkspaceFolder[] | undefined> {
  const folders = getWorkspaceFolders();
  if (folders.length === 0) {
    await vscode.window.showWarningMessage(getWorkspaceInvalidMessage());
    return undefined;
  }
  return folders;
}

/**
 * 多根时 QuickPick 选一个根；单根直接返回。
 * 取消选择返回 undefined。
 */
export async function pickWorkspaceFolder(
  placeHolder = '选择工作区文件夹',
): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = getWorkspaceFolders();
  if (folders.length === 0) {
    await vscode.window.showWarningMessage(getWorkspaceInvalidMessage());
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0];
  }

  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder,
    })),
    { placeHolder },
  );
  return picked?.folder;
}

/**
 * 将 uri 转为相对**所属根**的路径（不含根文件夹名）。
 * 可传入 folder 跳过二次解析；uri 不属于该 folder 时返回 undefined。
 */
export function toRelativePath(
  uri: vscode.Uri,
  folder?: vscode.WorkspaceFolder,
): string | undefined {
  const resolved = folder ?? resolveWorkspaceFolder(uri);
  if (!resolved) {
    return undefined;
  }
  if (folder && resolveWorkspaceFolder(uri)?.uri.toString() !== folder.uri.toString()) {
    return undefined;
  }

  const relative = vscode.workspace.asRelativePath(uri, false);
  if (!relative || relative.startsWith('/') || relative.includes('://')) {
    return undefined;
  }
  // 多根且 asRelativePath 偶发带上 folder.name/ 前缀时剥掉
  const prefix = `${resolved.name}/`;
  if (isMultiRootWorkspace() && relative.startsWith(prefix)) {
    return relative.slice(prefix.length);
  }
  return relative;
}

/** 相对路径 → 绝对 Uri（相对指定根）。 */
export function toAbsoluteUri(
  relativePath: string,
  folder: vscode.WorkspaceFolder,
): vscode.Uri {
  return vscode.Uri.joinPath(folder.uri, relativePath);
}

export async function fileExists(
  relativePath: string,
  folder: vscode.WorkspaceFolder,
): Promise<boolean> {
  const uri = toAbsoluteUri(relativePath, folder);
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/** 缓存 / 监视用的稳定键：folderUri + 相对路径。 */
export function fileCacheKey(folder: vscode.WorkspaceFolder, relativePath: string): string {
  return `${folder.uri.toString()}::${relativePath}`;
}
