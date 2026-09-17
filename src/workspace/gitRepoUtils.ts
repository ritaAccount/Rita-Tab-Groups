import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { getWorkspaceFolder } from './workspaceUtils';
import {
  GitRepoInfo,
  normalizeFsPath,
  toGitRepoInfo,
} from './gitRepoPathUtils';

export type { GitRepoInfo } from './gitRepoPathUtils';
export { mapRepoPathToWorkspace, normalizeFsPath, toGitRepoInfo } from './gitRepoPathUtils';

const execFileAsync = promisify(execFile);

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  'vendor',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.idea',
  '.vscode',
  '.cursor',
]);

/**
 * 发现工作区内可用的 Git 仓库：
 * 1) 内置 Git 扩展已登记、且落在工作区下的仓库；
 * 2) 若无，则检测工作区根；再浅层扫描子目录中的嵌套仓库。
 */
export async function discoverGitRepos(): Promise<GitRepoInfo[]> {
  const folder = getWorkspaceFolder();
  if (!folder) {
    return [];
  }

  const workspaceRoot = folder.uri.fsPath;
  const fromApi = await listReposFromGitExtension(workspaceRoot);
  if (fromApi.length > 0) {
    return fromApi;
  }

  const found = new Map<string, GitRepoInfo>();

  const rootRepo = await resolveRepoAt(workspaceRoot, workspaceRoot);
  if (rootRepo) {
    found.set(normalizeFsPath(rootRepo.rootFsPath), rootRepo);
  }

  const nested = await scanNestedRepos(folder.uri, workspaceRoot, 2);
  for (const repo of nested) {
    found.set(normalizeFsPath(repo.rootFsPath), repo);
  }

  return [...found.values()].sort((a, b) =>
    a.relativeToWorkspace.localeCompare(b.relativeToWorkspace, 'zh-CN'),
  );
}

async function listReposFromGitExtension(workspaceRoot: string): Promise<GitRepoInfo[]> {
  try {
    const extension = vscode.extensions.getExtension('vscode.git');
    if (!extension) {
      return [];
    }
    if (!extension.isActive) {
      await extension.activate();
    }

    const exports = extension.exports as {
      getAPI?: (version: number) => {
        repositories?: Array<{ rootUri: vscode.Uri }>;
      };
    };
    const api = exports.getAPI?.(1);
    const repositories = api?.repositories ?? [];
    const rootNorm = normalizeFsPath(workspaceRoot);
    const result: GitRepoInfo[] = [];

    for (const repo of repositories) {
      const repoRoot = normalizeFsPath(repo.rootUri.fsPath);
      if (repoRoot !== rootNorm && !repoRoot.startsWith(`${rootNorm}/`)) {
        continue;
      }
      result.push(toGitRepoInfo(repo.rootUri.fsPath, workspaceRoot));
    }

    return result.sort((a, b) =>
      a.relativeToWorkspace.localeCompare(b.relativeToWorkspace, 'zh-CN'),
    );
  } catch {
    return [];
  }
}

async function scanNestedRepos(
  dirUri: vscode.Uri,
  workspaceRoot: string,
  remainingDepth: number,
): Promise<GitRepoInfo[]> {
  if (remainingDepth <= 0) {
    return [];
  }

  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(dirUri);
  } catch {
    return [];
  }

  const found: GitRepoInfo[] = [];

  for (const [name, type] of entries) {
    if (type !== vscode.FileType.Directory || SKIP_DIR_NAMES.has(name) || name.startsWith('.')) {
      continue;
    }

    const childUri = vscode.Uri.joinPath(dirUri, name);
    const childFsPath = childUri.fsPath;
    const repo = await resolveRepoAt(childFsPath, workspaceRoot);
    if (repo && normalizeFsPath(repo.rootFsPath) === normalizeFsPath(childFsPath)) {
      found.push(repo);
      continue;
    }

    const deeper = await scanNestedRepos(childUri, workspaceRoot, remainingDepth - 1);
    found.push(...deeper);
  }

  return found;
}

async function resolveRepoAt(
  candidateFsPath: string,
  workspaceRoot: string,
): Promise<GitRepoInfo | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd: candidateFsPath,
      timeout: 3000,
      windowsHide: true,
    });
    const toplevel = stdout.trim();
    if (!toplevel) {
      return undefined;
    }
    const toplevelNorm = normalizeFsPath(toplevel);
    const rootNorm = normalizeFsPath(workspaceRoot);
    if (toplevelNorm !== rootNorm && !toplevelNorm.startsWith(`${rootNorm}/`)) {
      return undefined;
    }
    return toGitRepoInfo(toplevel, workspaceRoot);
  } catch {
    return undefined;
  }
}

/** 读取指定仓库的当前分支名 */
export async function getGitBranchAt(repoRootFsPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoRootFsPath,
      timeout: 3000,
      windowsHide: true,
    });
    const name = stdout.trim();
    if (!name || name === 'HEAD') {
      const { stdout: sha } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: repoRootFsPath,
        timeout: 3000,
        windowsHide: true,
      });
      return sha.trim() || undefined;
    }
    return name;
  } catch {
    return undefined;
  }
}
