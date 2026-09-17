import * as vscode from 'vscode';
import { toAbsoluteUri } from './workspaceUtils';
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
 */
export async function buildAiContextContentsMarkdown(
  groupName: string,
  relativePaths: string[],
  options?: { maxFileBytes?: number },
): Promise<AiContextBuildResult> {
  const maxFileBytes = options?.maxFileBytes ?? AI_CONTEXT_MAX_FILE_BYTES;
  const sections: string[] = [
    `# 分组：${groupName}`,
    `# 说明：由 Rita Tab Groups 导出，路径相对工作区根；可供粘贴到 Chat / Agent。`,
    '',
  ];

  let included = 0;
  let skippedMissing = 0;
  let skippedLarge = 0;

  for (const relativePath of relativePaths) {
    const uri = toAbsoluteUri(relativePath);
    if (!uri) {
      skippedMissing += 1;
      continue;
    }

    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(uri);
    } catch {
      skippedMissing += 1;
      sections.push(`## ${relativePath}`, '', '_（文件不存在或无法读取，已跳过）_', '', '');
      continue;
    }

    if (bytes.byteLength > maxFileBytes) {
      skippedLarge += 1;
      sections.push(
        `## ${relativePath}`,
        '',
        `_（文件约 ${formatBytes(bytes.byteLength)}，超过 ${formatBytes(maxFileBytes)} 上限，已跳过内容）_`,
        '',
        '',
      );
      continue;
    }

    if (looksBinary(bytes)) {
      skippedLarge += 1;
      sections.push(`## ${relativePath}`, '', '_（疑似二进制文件，已跳过内容）_', '', '');
      continue;
    }

    const content = Buffer.from(bytes).toString('utf8');
    appendFileContentSection(sections, relativePath, content);
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
