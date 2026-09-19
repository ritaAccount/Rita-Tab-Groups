import * as vscode from 'vscode';
import { GroupFileEntry } from '../data/types';
import { formatEntryDisplayPath, resolveEntryFolder, toAbsoluteUri } from './workspaceUtils';
import {
  AI_CONTEXT_MAX_FILE_BYTES,
  AiContextBuildResult,
  appendFileContentSection,
  formatBytes,
  looksBinary,
} from './aiContextFormatUtils';

export {
  AI_CONTEXT_MAX_FILE_BYTES,
  AI_CONTEXT_WARN_TOTAL_CHARS,
  AiContextBuildResult,
  AiContextMode,
  buildAiContextPathsMarkdown,
  chooseFence,
  formatBytes,
  languageFromPath,
} from './aiContextFormatUtils';

/**
 * 路径 + 文件内容（Markdown 围栏）。
 * 跳过缺失与超过单文件大小上限的文件；内容含围栏时自动加长分隔符。
 * 支持跨根条目（按 entry.folder 解析所属工作区根）。
 */
export async function buildAiContextContentsMarkdown(
  groupName: string,
  entries: Array<Pick<GroupFileEntry, 'path' | 'folder'>>,
  homeFolder: vscode.WorkspaceFolder,
  options?: { maxFileBytes?: number },
): Promise<AiContextBuildResult> {
  const maxFileBytes = options?.maxFileBytes ?? AI_CONTEXT_MAX_FILE_BYTES;
  const sections: string[] = [
    `# 分组：${groupName}`,
    `# 说明：由 Rita Tab Groups 导出，路径相对各自工作区根；跨根文件带根名前缀。可供粘贴到 Chat / Agent。`,
    '',
  ];

  let included = 0;
  let skippedMissing = 0;
  let skippedLarge = 0;

  for (const entry of entries) {
    const displayPath = formatEntryDisplayPath(entry, homeFolder.name);
    const sourceFolder = resolveEntryFolder(homeFolder, entry);
    if (!sourceFolder) {
      skippedMissing += 1;
      sections.push(`## ${displayPath}`, '', '_（工作区根不存在或无法解析，已跳过）_', '', '');
      continue;
    }

    const uri = toAbsoluteUri(entry.path, sourceFolder);

    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(uri);
    } catch {
      skippedMissing += 1;
      sections.push(`## ${displayPath}`, '', '_（文件不存在或无法读取，已跳过）_', '', '');
      continue;
    }

    if (bytes.byteLength > maxFileBytes) {
      skippedLarge += 1;
      sections.push(
        `## ${displayPath}`,
        '',
        `_（文件约 ${formatBytes(bytes.byteLength)}，超过 ${formatBytes(maxFileBytes)} 上限，已跳过内容）_`,
        '',
        '',
      );
      continue;
    }

    if (looksBinary(bytes)) {
      skippedLarge += 1;
      sections.push(`## ${displayPath}`, '', '_（疑似二进制文件，已跳过内容）_', '', '');
      continue;
    }

    const content = Buffer.from(bytes).toString('utf8');
    appendFileContentSection(sections, displayPath, content);
    included += 1;
  }

  const text = sections.join('\n').trimEnd() + '\n';
  return {
    text,
    included,
    skippedMissing,
    skippedLarge,
    totalChars: text.length,
  };
}
