export const AI_CONTEXT_MAX_FILE_BYTES = 200 * 1024;
export const AI_CONTEXT_WARN_TOTAL_CHARS = 400 * 1024;

export type AiContextMode = 'paths' | 'contents';

export interface AiContextBuildResult {
  text: string;
  included: number;
  skippedMissing: number;
  skippedLarge: number;
  totalChars: number;
}

/** 仅路径列表（Markdown） */
export function buildAiContextPathsMarkdown(
  groupName: string,
  relativePaths: string[],
): AiContextBuildResult {
  const lines = [
    `# 分组：${groupName}`,
    `# 文件数：${relativePaths.length}`,
    '',
    '以下路径相对工作区根目录：',
    '',
    ...relativePaths.map((path) => `- \`${path}\``),
    '',
  ];
  const text = lines.join('\n');
  return {
    text,
    included: relativePaths.length,
    skippedMissing: 0,
    skippedLarge: 0,
    totalChars: text.length,
  };
}

export function appendFileContentSection(
  sections: string[],
  relativePath: string,
  content: string,
): void {
  const lang = languageFromPath(relativePath);
  const fence = chooseFence(content);
  sections.push(`## ${relativePath}`, '', `${fence}${lang}`, content, fence, '', '');
}

export function languageFromPath(relativePath: string): string {
  const name = relativePath.split('/').pop() ?? relativePath;
  const lower = name.toLowerCase();
  if (lower === 'dockerfile') {
    return 'dockerfile';
  }
  if (lower === 'makefile') {
    return 'makefile';
  }
  const dot = lower.lastIndexOf('.');
  if (dot < 0) {
    return '';
  }
  const ext = lower.slice(dot + 1);
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    htm: 'html',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    sql: 'sql',
    graphql: 'graphql',
    vue: 'vue',
    svelte: 'svelte',
    txt: 'text',
  };
  return map[ext] ?? '';
}

export function chooseFence(content: string): string {
  let fence = '```';
  while (content.includes(fence)) {
    fence += '`';
  }
  return fence;
}

export function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.byteLength, 8000));
  let suspicious = 0;
  for (const b of sample) {
    if (b === 0) {
      return true;
    }
    if (b < 7 || (b > 13 && b < 32)) {
      suspicious += 1;
    }
  }
  return suspicious / Math.max(sample.length, 1) > 0.3;
}
