import * as path from 'path';

export interface GitRepoInfo {
  /** 仓库根绝对路径 */
  rootFsPath: string;
  /** 相对工作区根；工作区根本身是仓库时为 '' */
  relativeToWorkspace: string;
  /** QuickPick 显示名 */
  label: string;
}

export function toGitRepoInfo(repoRootFsPath: string, workspaceRoot: string): GitRepoInfo {
  const relative = path.relative(workspaceRoot, repoRootFsPath).split(path.sep).join('/');
  const relativeToWorkspace = relative === '' ? '' : relative;
  return {
    rootFsPath: repoRootFsPath,
    relativeToWorkspace,
    label: relativeToWorkspace || '.',
  };
}

export function normalizeFsPath(fsPath: string): string {
  const resolved = path.resolve(fsPath);
  if (process.platform === 'win32') {
    return resolved.replace(/\\/g, '/').toLowerCase();
  }
  return resolved;
}

/** 把仓库内相对路径映射为相对工作区根的路径 */
export function mapRepoPathToWorkspace(
  repoRelativePath: string,
  repoRelativeToWorkspace: string,
): string {
  const clean = repoRelativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!repoRelativeToWorkspace) {
    return clean;
  }
  return `${repoRelativeToWorkspace.replace(/\/$/, '')}/${clean}`;
}
