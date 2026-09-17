import * as vscode from 'vscode';
import { fileCacheKey, fileExists } from './workspaceUtils';

/**
 * 工作区文件存在性内存缓存。键为 folderUri::relativePath；
 * 工作区切换时清空；文件创建/删除/重命名时按路径失效。
 */
export class FileExistenceCache {
  private readonly cache = new Map<string, boolean>();

  async exists(folder: vscode.WorkspaceFolder, relativePath: string): Promise<boolean> {
    const key = fileCacheKey(folder, relativePath);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = await fileExists(relativePath, folder);
    this.cache.set(key, result);
    return result;
  }

  invalidate(folder: vscode.WorkspaceFolder, relativePath: string): void {
    this.cache.delete(fileCacheKey(folder, relativePath));
  }

  invalidateMany(entries: Iterable<{ folder: vscode.WorkspaceFolder; relativePath: string }>): void {
    for (const { folder, relativePath } of entries) {
      this.cache.delete(fileCacheKey(folder, relativePath));
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const fileExistenceCache = new FileExistenceCache();
