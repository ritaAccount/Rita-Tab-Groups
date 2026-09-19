import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getWorkspaceFolders, toRelativePath, resolveWorkspaceFolder } from './workspaceUtils';
import { parseGitStatusPorcelain } from './workingSetParseUtils';
import {
  GitRepoInfo,
  discoverGitRepos,
  getGitBranchAt,
  mapRepoPathToWorkspace,
} from './gitRepoUtils';

export {
  defaultGitChangesGroupName,
  defaultOpenEditorsGroupName,
  parseGitStatusPorcelain,
} from './workingSetParseUtils';

export type { GitRepoInfo } from './gitRepoUtils';
export { discoverGitRepos, mapRepoPathToWorkspace, getGitBranchAt } from './gitRepoUtils';

const execFileAsync = promisify(execFile);

/**
 * 收集当前编辑器中已打开、且属于指定根（或全部根）的文件。
 * 返回 path 相对各自所属根，并带上所属 WorkspaceFolder。
 */
export function collectOpenEditorFileRefs(
  folder?: vscode.WorkspaceFolder,
): Array<{ path: string; folder: vscode.WorkspaceFolder }> {
  const seen = new Set<string>();
  const refs: Array<{ path: string; folder: vscode.WorkspaceFolder }> = [];

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const uri = resolveTabFileUri(tab);
      if (!uri || uri.scheme !== 'file') {
        continue;
      }
      const fileFolder = resolveWorkspaceFolder(uri);
      if (!fileFolder) {
        continue;
      }
      if (folder && fileFolder.uri.toString() !== folder.uri.toString()) {
        continue;
      }
      const relative = toRelativePath(uri, fileFolder);
      if (!relative) {
        continue;
      }
      const key = `${fileFolder.uri.toString()}::${relative}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      refs.push({ path: relative, folder: fileFolder });
    }
  }

  return refs;
}

/**
 * 收集当前编辑器中已打开、且属于指定根（或全部根）的文件相对路径。
 * 返回路径相对**各自所属根**；仅同根场景可安全直接交给对应 manager。
 */
export function collectOpenEditorRelativePaths(
  folder?: vscode.WorkspaceFolder,
): string[] {
  return collectOpenEditorFileRefs(folder).map((ref) => ref.path);
}

/** 按工作区根分组收集已打开文件。 */
export function collectOpenEditorPathsByFolder(): Map<vscode.WorkspaceFolder, string[]> {
  const result = new Map<vscode.WorkspaceFolder, string[]>();
  for (const folder of getWorkspaceFolders()) {
    const paths = collectOpenEditorRelativePaths(folder);
    if (paths.length > 0) {
      result.set(folder, paths);
    }
  }
  return result;
}

function resolveTabFileUri(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input;
  if (input instanceof vscode.TabInputText) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }
  if (input instanceof vscode.TabInputNotebook) {
    return input.uri;
  }
  return undefined;
}

export type GitChangesCollectResult =
  | { ok: true; paths: string[]; repos: GitRepoInfo[] }
  | { ok: false; reason: 'no-workspace' | 'no-repos' | 'no-changes' | 'cancelled' };

/**
 * 发现仓库 →（多个则让用户多选）→ 收集变更路径（相对指定工作区根）。
 */
export async function collectGitChangesWithRepoPick(
  folder: vscode.WorkspaceFolder,
): Promise<GitChangesCollectResult> {
  const repos = await discoverGitRepos(folder);
  if (repos.length === 0) {
    return { ok: false, reason: 'no-repos' };
  }

  let selected = repos;
  if (repos.length > 1) {
    const picked = await vscode.window.showQuickPick(
      repos.map((repo) => ({
        label: repo.label,
        description: repo.rootFsPath,
        repo,
      })),
      {
        placeHolder: '选择要收集变更的 Git 仓库（可多选）',
        canPickMany: true,
      },
    );
    if (!picked || picked.length === 0) {
      return { ok: false, reason: 'cancelled' };
    }
    selected = picked.map((item) => item.repo);
  }

  const paths = await collectGitChangedRelativePathsFromRepos(folder, selected);
  if (paths.length === 0) {
    return { ok: false, reason: 'no-changes' };
  }

  return { ok: true, paths, repos: selected };
}

/** 从指定仓库列表收集变更，路径统一为相对工作区根 */
export async function collectGitChangedRelativePathsFromRepos(
  folder: vscode.WorkspaceFolder,
  repos: GitRepoInfo[],
): Promise<string[]> {
  if (repos.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const paths: string[] = [];

  for (const repo of repos) {
    let stdout: string;
    try {
      const result = await execFileAsync(
        'git',
        ['status', '--porcelain', '--untracked-files=all'],
        {
          cwd: repo.rootFsPath,
          timeout: 8000,
          windowsHide: true,
          maxBuffer: 2 * 1024 * 1024,
        },
      );
      stdout = result.stdout;
    } catch {
      continue;
    }

    for (const candidate of parseGitStatusPorcelain(stdout)) {
      const workspaceRelative = mapRepoPathToWorkspace(
        candidate,
        repo.relativeToWorkspace,
      );
      const uri = vscode.Uri.joinPath(folder.uri, workspaceRelative);
      const relative = toRelativePath(uri, folder);
      if (!relative || seen.has(relative)) {
        continue;
      }
      seen.add(relative);
      paths.push(relative);
    }
  }

  return paths;
}

/** @deprecated 兼容旧调用：无交互，仅工作区根仓库 */
export async function collectGitChangedRelativePaths(
  folder: vscode.WorkspaceFolder,
): Promise<string[]> {
  const repos = await discoverGitRepos(folder);
  if (repos.length === 0) {
    return [];
  }
  return collectGitChangedRelativePathsFromRepos(folder, repos);
}
