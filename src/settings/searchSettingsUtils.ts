import * as vscode from 'vscode';
import { DEFAULT_SEARCH_SETTINGS, SearchMode, SearchSettings } from '../data/types';

const CONFIG_KEY = 'search';
const SECTION = 'tabGroups';

function normalizeMode(value: unknown): SearchMode {
  if (value === 'fuzzy' || value === 'exact') {
    return value;
  }
  return DEFAULT_SEARCH_SETTINGS.mode;
}

function normalizeFolderList(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_SEARCH_SETTINGS.include;
  }
  return value.replace(/\r\n/g, '\n').trim();
}

export function getSearchSettings(): SearchSettings {
  const partial = vscode.workspace.getConfiguration(SECTION).get<Partial<SearchSettings>>(CONFIG_KEY);
  return {
    mode: normalizeMode(partial?.mode),
    include: normalizeFolderList(partial?.include),
    exclude: normalizeFolderList(partial?.exclude),
  };
}

export async function saveSearchSettings(settings: SearchSettings): Promise<SearchSettings> {
  const next: SearchSettings = {
    mode: normalizeMode(settings.mode),
    include: normalizeFolderList(settings.include),
    exclude: normalizeFolderList(settings.exclude),
  };

  await vscode.workspace
    .getConfiguration(SECTION)
    .update(CONFIG_KEY, next, vscode.ConfigurationTarget.Workspace);

  return next;
}

export function parseFolderList(value: string): string[] {
  const seen = new Set<string>();
  const folders: string[] = [];
  for (const part of value.split(/[,;\n]/)) {
    const folder = normalizeFolderPattern(part);
    if (!folder || seen.has(folder)) {
      continue;
    }
    seen.add(folder);
    folders.push(folder);
  }
  return folders;
}

/** 规范化用户填写的文件夹：正斜杠、去掉 ./ 与末尾 /** */
export function normalizeFolderPattern(value: string): string {
  let folder = value.trim().replace(/\\/g, '/');
  if (!folder) {
    return '';
  }
  folder = folder.replace(/^\.\//, '');
  folder = folder.replace(/\/+$/, '');
  folder = folder.replace(/\/\*\*$/, '');
  folder = folder.replace(/\/\*$/, '');
  if (folder === '.' || folder === '**') {
    return '';
  }
  return folder;
}

export function isPathUnderFolders(relativePath: string, folders: string[]): boolean {
  if (folders.length === 0) {
    return true;
  }
  const path = relativePath.replace(/\\/g, '/');
  return folders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}

export function isFilePathAllowed(relativePath: string, include: string[], exclude: string[]): boolean {
  const path = relativePath.replace(/\\/g, '/');
  if (exclude.length > 0 && isPathUnderFolders(path, exclude)) {
    return false;
  }
  return isPathUnderFolders(path, include);
}
