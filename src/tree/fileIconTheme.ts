import * as vscode from 'vscode';
import { SidebarIcon, SidebarTreeNode } from './treeProvider';

interface IconDefinition {
  iconPath?: string;
  fontCharacter?: string;
  fontColor?: string;
  fontId?: string;
  fontSize?: string;
}

interface IconThemeFontSrc {
  path: string;
  format?: string;
}

interface IconThemeFont {
  id?: string;
  src: IconThemeFontSrc[];
  weight?: string;
  style?: string;
  size?: string;
}

interface IconThemeDocument {
  fonts?: IconThemeFont[];
  iconDefinitions?: Record<string, IconDefinition>;
  file?: string;
  folder?: string;
  folderExpanded?: string;
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  languageIds?: Record<string, string>;
  light?: Partial<IconThemeDocument>;
}

interface LoadedIconTheme {
  document: IconThemeDocument;
  themeDir: vscode.Uri;
  extensionUri: vscode.Uri;
}

let cachedThemeId: string | undefined;
let cachedTheme: LoadedIconTheme | undefined;

export function iconThemeResourceRoots(): vscode.Uri[] {
  return cachedTheme ? [cachedTheme.extensionUri] : [];
}

export async function loadWorkbenchIconTheme(): Promise<LoadedIconTheme | undefined> {
  const themeId = vscode.workspace.getConfiguration('workbench').get<string>('iconTheme');
  if (!themeId) {
    cachedThemeId = undefined;
    cachedTheme = undefined;
    return undefined;
  }
  if (cachedTheme && cachedThemeId === themeId) {
    return cachedTheme;
  }

  for (const extension of vscode.extensions.all) {
    const themes = extension.packageJSON?.contributes?.iconThemes as
      | Array<{ id?: string; path?: string }>
      | undefined;
    const contrib = themes?.find((item) => item.id === themeId);
    if (!contrib?.path) {
      continue;
    }
    const themeUri = vscode.Uri.joinPath(extension.extensionUri, contrib.path);
    try {
      const bytes = await vscode.workspace.fs.readFile(themeUri);
      const document = JSON.parse(Buffer.from(bytes).toString('utf8')) as IconThemeDocument;
      cachedThemeId = themeId;
      cachedTheme = {
        document,
        themeDir: vscode.Uri.joinPath(themeUri, '..'),
        extensionUri: extension.extensionUri,
      };
      return cachedTheme;
    } catch {
      continue;
    }
  }

  cachedThemeId = themeId;
  cachedTheme = undefined;
  return undefined;
}

export function buildIconThemeCss(webview: vscode.Webview, theme: LoadedIconTheme | undefined): string {
  if (!theme?.document.fonts?.length) {
    return '';
  }
  return theme.document.fonts
    .map((font) => {
      const family = cssFontFamily(font.id);
      const sources = font.src
        .map((src) => {
          const url = webview.asWebviewUri(vscode.Uri.joinPath(theme.themeDir, src.path));
          const format = src.format ? ` format("${src.format}")` : '';
          return `url("${url}")${format}`;
        })
        .join(', ');
      return `@font-face{font-family:"${family}";src:${sources};font-weight:${font.weight || 'normal'};font-style:${font.style || 'normal'};font-display:block;}`;
    })
    .join('');
}

export function decorateSidebarIcons(
  nodes: SidebarTreeNode[],
  webview: vscode.Webview,
  theme: LoadedIconTheme | undefined,
): SidebarTreeNode[] {
  return nodes.map((node) => decorateNode(node, webview, theme));
}

function decorateNode(
  node: SidebarTreeNode,
  webview: vscode.Webview,
  theme: LoadedIconTheme | undefined,
): SidebarTreeNode {
  const icon = resolveNodeIcon(node, webview, theme);
  const children = node.children
    ? node.children.map((child) => decorateNode(child, webview, theme))
    : undefined;
  return { ...node, icon, children };
}

function resolveNodeIcon(
  node: SidebarTreeNode,
  webview: vscode.Webview,
  theme: LoadedIconTheme | undefined,
): SidebarIcon {
  if (node.kind === 'file' && node.filePath && theme) {
    const fromTheme = lookupFileIcon(node.filePath, theme, webview);
    if (fromTheme) {
      return fromTheme;
    }
  }
  return { kind: 'codicon', id: node.iconId || defaultCodicon(node) };
}

function defaultCodicon(node: SidebarTreeNode): string {
  if (node.iconId) {
    return node.iconId;
  }
  if (node.kind === 'group') {
    return node.expanded ? 'folder-opened' : 'folder';
  }
  if (node.kind === 'file') {
    return 'file';
  }
  return 'circle-small-filled';
}

function lookupFileIcon(
  relativePath: string,
  theme: LoadedIconTheme,
  webview: vscode.Webview,
): SidebarIcon | undefined {
  const doc = theme.document;
  const light = isLightTheme();
  const base = basename(relativePath);
  const lower = base.toLowerCase();
  const fileNames = mergeMaps(doc.fileNames, light ? doc.light?.fileNames : undefined);
  const fileExtensions = mergeMaps(doc.fileExtensions, light ? doc.light?.fileExtensions : undefined);
  const key =
    fileNames[lower] ||
    fileNames[base] ||
    lookupExtension(lower, fileExtensions) ||
    (light ? doc.light?.file : undefined) ||
    doc.file;
  if (!key || !doc.iconDefinitions) {
    return undefined;
  }
  const def = doc.iconDefinitions[key];
  if (!def) {
    return undefined;
  }
  if (def.iconPath) {
    return {
      kind: 'image',
      uri: webview.asWebviewUri(vscode.Uri.joinPath(theme.themeDir, def.iconPath)).toString(),
    };
  }
  if (def.fontCharacter) {
      const font =
        theme.document.fonts?.find((item) => item.id === def.fontId) || theme.document.fonts?.[0];
    return {
      kind: 'font',
      fontId: def.fontId || font?.id || 'default',
      character: parseFontCharacter(def.fontCharacter),
      color: def.fontColor,
      size: def.fontSize || font?.size,
    };
  }
  return undefined;
}

function lookupExtension(fileName: string, extensions: Record<string, string>): string | undefined {
  const parts = fileName.split('.');
  for (let i = 1; i < parts.length; i += 1) {
    const ext = parts.slice(i).join('.');
    if (extensions[ext]) {
      return extensions[ext];
    }
  }
  return undefined;
}

function mergeMaps(
  base?: Record<string, string>,
  overlay?: Record<string, string>,
): Record<string, string> {
  return { ...(base ?? {}), ...(overlay ?? {}) };
}

function parseFontCharacter(raw: string): string {
  if (raw.length === 1) {
    return raw;
  }
  const hex = raw.replace(/^\\u/i, '').replace(/^\\/, '');
  if (/^[0-9a-fA-F]{3,6}$/.test(hex)) {
    return String.fromCodePoint(parseInt(hex, 16));
  }
  return raw;
}

function isLightTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
}

function cssFontFamily(id?: string): string {
  return `tabGroups-fileicon-${id || 'default'}`;
}

function basename(relativePath: string): string {
  const parts = relativePath.split(/[/\\]/);
  return parts[parts.length - 1] || relativePath;
}
