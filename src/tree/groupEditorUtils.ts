import * as vscode from 'vscode';
import { GroupFileEntry } from '../data/types';
import { fileExistenceCache } from '../workspace/fileExistenceCache';
import { openFileEntry } from './fileLocationUtils';
import { resolveEntryFolder, toRelativePath } from '../workspace/workspaceUtils';

export async function openGroupFiles(
  folder: vscode.WorkspaceFolder,
  entries: GroupFileEntry[],
): Promise<{ opened: number; skipped: number }> {
  let opened = 0;
  let skipped = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const sourceFolder = resolveEntryFolder(folder, entry);
    if (!sourceFolder || !(await fileExistenceCache.exists(sourceFolder, entry.path))) {
      skipped++;
      continue;
    }

    const isLast = i === entries.length - 1;
    const success = await openFileEntry(folder, entry, { preserveFocus: !isLast });
    if (success) {
      opened++;
    } else {
      skipped++;
    }
  }

  return { opened, skipped };
}

export async function closeGroupFiles(
  folder: vscode.WorkspaceFolder,
  entries: GroupFileEntry[],
): Promise<number> {
  const keys = new Set(
    entries.map((entry) => {
      const source = resolveEntryFolder(folder, entry);
      return source ? `${source.uri.toString()}::${entry.path}` : '';
    }),
  );

  const tabsToClose: vscode.Tab[] = [];

  for (const tabGroup of vscode.window.tabGroups.all) {
    for (const tab of tabGroup.tabs) {
      const uri = getTabUri(tab);
      if (!uri) {
        continue;
      }
      const tabFolder = vscode.workspace.getWorkspaceFolder(uri);
      const relativePath = tabFolder ? toRelativePath(uri, tabFolder) : undefined;
      if (!tabFolder || !relativePath) {
        continue;
      }
      if (keys.has(`${tabFolder.uri.toString()}::${relativePath}`)) {
        tabsToClose.push(tab);
      }
    }
  }

  if (tabsToClose.length === 0) {
    return 0;
  }

  await vscode.window.tabGroups.close(tabsToClose, true);
  return tabsToClose.length;
}

function getTabUri(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input;
  if (input instanceof vscode.TabInputText) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }
  return undefined;
}
