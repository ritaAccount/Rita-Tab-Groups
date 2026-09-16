import * as vscode from 'vscode';
import { getWorkspaceFolder } from './workspaceUtils';

/** 与 media/tab-groups.skill.md 顶部版本注释一致；升高后会覆盖工作区已写入的 Skill。
 * 升版时须新建 version/skill/<新版本>/（changes.json + 完整 example，见 version/explain.md）。
 */
export const AI_GUIDE_VERSION = 3;

/** 工作区项目 Skill（Cursor Agent Skills） */
export const AI_SKILL_RELATIVE_PATH = '.cursor/skills/tab-groups/SKILL.md';

const VERSION_COMMENT_RE = /tab-groups-ai-guide-version:\s*(\d+)/;

/**
 * 激活时写入/更新 `.cursor/skills/tab-groups/SKILL.md`，
 * 引导用户用自然语言让 Agent 改 Tab Groups 配置。
 * 仅当目标不存在或指南版本落后时覆盖。
 * @returns 是否实际写入了文件
 */
export async function ensureWorkspaceAiGuide(): Promise<boolean> {
  const folder = getWorkspaceFolder();
  if (!folder) {
    return false;
  }

  const extension = vscode.extensions.getExtension('Rita.rita-tab-groups');
  if (!extension) {
    return false;
  }

  return writeIfNeeded(
    vscode.Uri.joinPath(folder.uri, AI_SKILL_RELATIVE_PATH),
    vscode.Uri.joinPath(extension.extensionUri, 'media', 'tab-groups.skill.md'),
  );
}

async function writeIfNeeded(targetUri: vscode.Uri, templateUri: vscode.Uri): Promise<boolean> {
  let templateText: string;
  try {
    const raw = await vscode.workspace.fs.readFile(templateUri);
    templateText = Buffer.from(raw).toString('utf8');
  } catch {
    return false;
  }

  const templateVersion = readGuideVersion(templateText) ?? AI_GUIDE_VERSION;

  try {
    const existing = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString('utf8');
    const existingVersion = readGuideVersion(existing);
    if (existingVersion !== undefined && existingVersion >= templateVersion) {
      return false;
    }
  } catch {
    // 不存在则创建
  }

  const parent = vscode.Uri.joinPath(targetUri, '..');
  try {
    await vscode.workspace.fs.createDirectory(parent);
  } catch {
    // 目录已存在或中间目录需逐级创建
  }

  // 确保 `.cursor/skills/tab-groups` 整链存在
  const skillsRoot = vscode.Uri.joinPath(parent, '..');
  const cursorRoot = vscode.Uri.joinPath(skillsRoot, '..');
  for (const dir of [cursorRoot, skillsRoot, parent]) {
    try {
      await vscode.workspace.fs.createDirectory(dir);
    } catch {
      // 已存在
    }
  }

  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(templateText, 'utf8'));
  return true;
}

function readGuideVersion(text: string): number | undefined {
  const match = text.match(VERSION_COMMENT_RE);
  if (!match) {
    return undefined;
  }
  const value = parseInt(match[1], 10);
  return Number.isFinite(value) ? value : undefined;
}
