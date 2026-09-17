import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

/**
 * 读取指定工作区根所在 Git 仓库的分支名。
 * 优先用内置 Git 扩展 API；失败时回退 `git rev-parse`。
 * 无仓库 / 无法解析时返回 undefined。
 */
export async function getCurrentGitBranch(
  folder: vscode.WorkspaceFolder,
): Promise<string | undefined> {
  const fromApi = await tryGetBranchFromGitExtension(folder.uri);
  if (fromApi) {
    return fromApi;
  }

  return tryGetBranchFromCli(folder.uri.fsPath);
}

async function tryGetBranchFromGitExtension(folderUri: vscode.Uri): Promise<string | undefined> {
  try {
    const extension = vscode.extensions.getExtension('vscode.git');
    if (!extension) {
      return undefined;
    }
    if (!extension.isActive) {
      await extension.activate();
    }

    const exports = extension.exports as {
      getAPI?: (version: number) => {
        getRepository?: (uri: vscode.Uri) => { state?: { HEAD?: { name?: string; commit?: string } } } | undefined;
        repositories?: Array<{ rootUri: vscode.Uri; state?: { HEAD?: { name?: string; commit?: string } } }>;
      };
    };
    const api = exports.getAPI?.(1);
    if (!api) {
      return undefined;
    }

    const repo =
      api.getRepository?.(folderUri) ??
      api.repositories?.find((item) => folderUri.fsPath.startsWith(item.rootUri.fsPath)) ??
      api.repositories?.[0];

    const head = repo?.state?.HEAD;
    if (head?.name?.trim()) {
      return head.name.trim();
    }
    if (head?.commit?.trim()) {
      return head.commit.trim().slice(0, 8);
    }
  } catch {
    // 忽略，走 CLI
  }
  return undefined;
}

async function tryGetBranchFromCli(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      timeout: 3000,
      windowsHide: true,
    });
    const name = stdout.trim();
    if (!name || name === 'HEAD') {
      const { stdout: sha } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd,
        timeout: 3000,
        windowsHide: true,
      });
      const short = sha.trim();
      return short || undefined;
    }
    return name;
  } catch {
    return undefined;
  }
}
