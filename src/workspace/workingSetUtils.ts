import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getWorkspaceFolder, toRelativePath } from './workspaceUtils';
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
 * 收集当前编辑器中已打开、且属于本工作区的文件相对路径（去重，保持打开顺序）。
 */
export function collectOpenEditorRelativePaths(): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const uri = resolveTabFileUri(tab);
      if (!uri || uri.scheme !== 'file') {
        continue;
      }
      const relative = toRelativePath(uri);
      if (!relative || seen.has(relative)) {
        continue;
      }
      seen.add(relative);
      paths.push(relative);
    }
  }

  return paths;
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
 * 发现仓库 →（多个则让用户多选）→ 收集变更路径（相对工作区根）。
 */
export async function collectGitChangesWithRepoPick(): Promise<GitChangesCollectResult> {
  const folder = getWorkspaceFolder();
  if (!folder) {
    return { ok: false, reason: 'no-workspace' };
  }

  const repos = await discoverGitRepos();
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

  const paths = await collectGitChangedRelativePathsFromRepos(selected);
  if (paths.length === 0) {
    return { ok: false, reason: 'no-changes' };
  }

  return { ok: true, paths, repos: selected };
}

/** 从指定仓库列表收集变更，路径统一为相对工作区根 */
export async function collectGitChangedRelativePathsFromRepos(
  repos: GitRepoInfo[],
): Promise<string[]> {
  const folder = getWorkspaceFolder();
  if (!folder || repos.length === 0) {
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
      const relative = toRelativePath(uri);
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
export async function collectGitChangedRelativePaths(): Promise<string[]> {
  const folder = getWorkspaceFolder();
  if (!folder) {
    return [];
  }
  const repos = await discoverGitRepos();
  if (repos.length === 0) {
    return [];
  }
  // 无 UI 时：若只有根仓库用根；多个则全部合并（避免静默丢嵌套）
  return collectGitChangedRelativePathsFromRepos(repos);
}
