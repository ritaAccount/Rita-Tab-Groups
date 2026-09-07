import * as vscode from 'vscode';
import { getWorkspaceFolder } from './workspaceUtils';

/** 与 media/tab-groups-ai.md、media/tab-groups.cursor-rule.md 顶部版本注释一致 */
export const AI_GUIDE_VERSION = 1;

export const AI_GUIDE_RELATIVE_PATH = '.vscode/tab-groups-ai.md';
export const CURSOR_RULE_RELATIVE_PATH = '.cursor/rules/tab-groups.mdc';

const VERSION_COMMENT_RE = /tab-groups-ai-guide-version:\s*(\d+)/;

/**
 * 激活时写入/更新 AI 操作手册与 Cursor 规则，便于用户用自然语言让 Agent 改配置。
 * 仅当目标不存在或指南版本落后时覆盖，避免无谓写盘。
 */
export async function ensureWorkspaceAiGuide(): Promise<void> {
  const folder = getWorkspaceFolder();
  if (!folder) {
    return;
  }

  const extension = vscode.extensions.getExtension('Rita.tab-groups');
  if (!extension) {
    return;
  }

  await writeIfNeeded(
    vscode.Uri.joinPath(folder.uri, AI_GUIDE_RELATIVE_PATH),
    vscode.Uri.joinPath(extension.extensionUri, 'media', 'tab-groups-ai.md'),
  );

  await writeIfNeeded(
    vscode.Uri.joinPath(folder.uri, CURSOR_RULE_RELATIVE_PATH),
    vscode.Uri.joinPath(extension.extensionUri, 'media', 'tab-groups.cursor-rule.md'),
  );
}

async function writeIfNeeded(targetUri: vscode.Uri, templateUri: vscode.Uri): Promise<void> {
  let templateText: string;
  try {
    const raw = await vscode.workspace.fs.readFile(templateUri);
    templateText = Buffer.from(raw).toString('utf8');
  } catch {
    return;
  }

  const templateVersion = readGuideVersion(templateText) ?? AI_GUIDE_VERSION;

  try {
    const existing = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString('utf8');
    const existingVersion = readGuideVersion(existing);
    if (existingVersion !== undefined && existingVersion >= templateVersion) {
      return;
    }
  } catch {
    // 不存在则创建
  }

  const parent = vscode.Uri.joinPath(targetUri, '..');
  try {
    await vscode.workspace.fs.createDirectory(parent);
  } catch {
    // 目录已存在
  }

  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(templateText, 'utf8'));
}

function readGuideVersion(text: string): number | undefined {
  const match = text.match(VERSION_COMMENT_RE);
  if (!match) {
    return undefined;
  }
  const value = parseInt(match[1], 10);
  return Number.isFinite(value) ? value : undefined;
}
