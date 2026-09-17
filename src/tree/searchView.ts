import * as vscode from 'vscode';
import { SearchMode, SearchSettings } from '../data/types';
import {
  getSearchSettings,
  normalizeFolderPattern,
  saveSearchSettings,
} from '../settings/searchSettingsUtils';
import { TreeSearchFilter } from './searchFilter';
import { FileTreeItem, MarkerTreeItem, SidebarTreeNode, TabGroupsTreeProvider, TreeElement } from './treeProvider';
import {
  buildIconThemeCss,
  decorateSidebarIcons,
  iconThemeResourceRoots,
  loadWorkbenchIconTheme,
} from './fileIconTheme';
import { getWorkspaceInvalidMessage, isValidWorkspace, pickWorkspaceFolder, toRelativePath } from '../workspace/workspaceUtils';

const HISTORY_KEY = 'tabGroups.searchHistory';
const QUERY_KEY = 'tabGroups.searchQuery';
const MAX_HISTORY = 20;

export function registerSearchView(
  context: vscode.ExtensionContext,
  treeProvider: TabGroupsTreeProvider,
): TabGroupsSearchViewProvider {
  const provider = new TabGroupsSearchViewProvider(context, treeProvider);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('tabGroupsView', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    treeProvider.onDidChangeTreeData(() => {
      void provider.postTree();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('tabGroups.search')) {
        provider.syncFromSettings();
      }
      if (event.affectsConfiguration('workbench.iconTheme')) {
        void provider.refreshIcons();
      }
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      void provider.refreshIcons();
    }),
  );
  return provider;
}

export class TabGroupsSearchViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private query = '';
  private history: string[] = [];
  private applyingSettings = false;
  private selection: TreeElement | undefined;

  private htmlInitialized = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly treeProvider: TabGroupsTreeProvider,
  ) {
    this.query = this.context.workspaceState.get<string>(QUERY_KEY, '');
    this.history = this.context.workspaceState.get<string[]>(HISTORY_KEY, []);
    this.applyFilter();
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    void this.prepareWebview(webviewView);

    webviewView.webview.onDidReceiveMessage(async (message: SearchViewMessage) => {
      await this.handleMessage(message);
    });
  }

  async refreshIcons(): Promise<void> {
    if (!this.view) {
      return;
    }
    await this.prepareWebview(this.view);
    await this.postTree();
  }

  private async prepareWebview(webviewView: vscode.WebviewView): Promise<void> {
    await loadWorkbenchIconTheme();
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        ...iconThemeResourceRoots(),
      ],
    };
    if (!this.htmlInitialized) {
      webviewView.webview.html = this.getHtml(webviewView.webview);
      this.htmlInitialized = true;
    }
  }

  getSelection(): TreeElement | undefined {
    return this.selection;
  }

  async postTree(): Promise<void> {
    if (!this.view) {
      return;
    }
    if (!isValidWorkspace()) {
      this.view.webview.postMessage({
        type: 'tree',
        nodes: [],
        emptyMessage: getWorkspaceInvalidMessage(),
        enabled: false,
      } satisfies SearchViewTreeMessage);
      return;
    }
    const theme = await loadWorkbenchIconTheme();
    const nodes = decorateSidebarIcons(
      await this.treeProvider.getSidebarTree(),
      this.view.webview,
      theme,
    );
    const emptyMessage = this.treeProvider.getSearchEmptyMessage();
    this.view.webview.postMessage({
      type: 'tree',
      nodes,
      emptyMessage,
      enabled: isValidWorkspace(),
      iconThemeCss: buildIconThemeCss(this.view.webview, theme),
    } satisfies SearchViewTreeMessage);
  }

  syncFromSettings(): void {
    if (this.applyingSettings) {
      return;
    }
    this.applyFilter();
    this.postInit();
  }

  private async handleMessage(message: SearchViewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.postInit();
        void this.postTree();
        return;
      case 'query':
        this.query = message.query;
        await this.context.workspaceState.update(QUERY_KEY, this.query);
        this.applyFilter();
        return;
      case 'commitQuery':
        await this.pushHistory(message.query);
        return;
      case 'mode':
        await this.updateSettings({ mode: message.mode });
        return;
      case 'folders':
        await this.updateSettings({ include: message.include, exclude: message.exclude });
        return;
      case 'pickFolder':
        await this.pickFolder(message.field);
        return;
      case 'select':
        this.selection = this.treeProvider.getSidebarElement(message.id);
        return;
      case 'toggle':
        this.treeProvider.setNodeExpanded(message.id, message.expanded);
        return;
      case 'activate':
        this.selection = this.treeProvider.getSidebarElement(message.id);
        await this.activateSelection();
        return;
      case 'run':
        this.selection = this.treeProvider.getSidebarElement(message.id);
        await vscode.commands.executeCommand(message.command, this.selection);
        return;
      case 'drop':
        await this.treeProvider.dropOnSidebar(message.targetId, {
          groupIds: message.groupIds,
          files: message.files,
        });
        return;
      default:
        return;
    }
  }

  private async updateSettings(partial: Partial<SearchSettings>): Promise<void> {
    const current = getSearchSettings();
    const next: SearchSettings = {
      mode: partial.mode ?? current.mode,
      include: partial.include ?? current.include,
      exclude: partial.exclude ?? current.exclude,
    };
    this.applyingSettings = true;
    try {
      await saveSearchSettings(next);
    } catch {
      void vscode.window.showWarningMessage('保存搜索设置需要已打开单根工作区。');
    } finally {
      this.applyingSettings = false;
    }
    this.applyFilter();
    this.postInit();
  }

  private async pickFolder(field: 'include' | 'exclude'): Promise<void> {
    const folder = await pickWorkspaceFolder('选择要浏览的工作区文件夹');
    if (!folder) {
      return;
    }

    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: true,
      defaultUri: folder.uri,
      openLabel: field === 'include' ? '添加到包含文件夹' : '添加到排除文件夹',
      title: field === 'include' ? '选择要包含的文件夹' : '选择要排除的文件夹',
    });
    if (!uris || uris.length === 0) {
      return;
    }

    const picked: string[] = [];
    for (const uri of uris) {
      if (uri.fsPath === folder.uri.fsPath) {
        continue;
      }
      const relative = toRelativePath(uri, folder);
      if (!relative) {
        void vscode.window.showWarningMessage(`文件夹不在所选工作区根内：${uri.fsPath}`);
        continue;
      }
      const normalized = normalizeFolderPattern(relative);
      if (normalized) {
        picked.push(normalized);
      }
    }

    if (picked.length === 0) {
      return;
    }

    const current = getSearchSettings();
    const existing = field === 'include' ? current.include : current.exclude;
    const merged = mergeFolderText(existing, picked);
    await this.updateSettings({ [field]: merged });
  }

  private async pushHistory(query: string): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    this.history = [trimmed, ...this.history.filter((item) => item !== trimmed)].slice(0, MAX_HISTORY);
    await this.context.workspaceState.update(HISTORY_KEY, this.history);
    this.postInit();
  }

  private applyFilter(): void {
    const settings = getSearchSettings();
    const filter: TreeSearchFilter = {
      query: this.query,
      mode: settings.mode,
      include: settings.include,
      exclude: settings.exclude,
    };
    this.treeProvider.setSearchFilter(filter);
  }

  private async activateSelection(): Promise<void> {
    const item = this.selection;
    if (!item) {
      return;
    }
    if (item instanceof FileTreeItem) {
      await vscode.commands.executeCommand('tabGroups.openFile', item);
      return;
    }
    if (item instanceof MarkerTreeItem) {
      await vscode.commands.executeCommand('tabGroups.openMarker', item);
    }
  }

  private postInit(): void {
    if (!this.view) {
      return;
    }
    const settings = getSearchSettings();
    this.view.webview.postMessage({
      type: 'init',
      query: this.query,
      mode: settings.mode,
      include: settings.include,
      exclude: settings.exclude,
      history: this.history,
      enabled: isValidWorkspace(),
    } satisfies SearchViewInitMessage);
  }

  private getHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'search.css'),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'search.js'),
    );
    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'codicons', 'codicon.css'),
    );
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src ${cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <link href="${codiconUri}" rel="stylesheet">
  <style id="fileIconTheme"></style>
</head>
<body>
  <div class="sidebar-root">
  <div class="search-root">
    <div class="search-box">
      <input id="query" type="text" placeholder="搜索 (↑↓ 历史)" aria-label="按名称搜索节点" autocomplete="off" spellcheck="false" data-hover-tip="Enter 将当前关键词加入历史，可用 ↑↓ 翻阅">
      <button type="button" id="clear" class="search-clear" title="清除" hidden aria-label="清除">×</button>
      <div class="search-toggles" role="toolbar" aria-label="搜索选项">
        <button type="button" id="modeFuzzy" class="search-toggle" data-mode="fuzzy" title="模糊查询" aria-pressed="true">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 2a5 5 0 1 0 3.1 8.9l3 3 1.1-1.1-3-3A5 5 0 0 0 7 2m0 1.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 0 0-7m5.2-.2.8.8-1.3 1.3-.8-.8zm1.8 1.8.8.8-1.3 1.3-.8-.8z"/></svg>
        </button>
        <button type="button" id="modeExact" class="search-toggle" data-mode="exact" title="精准查询" aria-pressed="false">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.8 4h1.6l2.4 8H4.3l-.5-1.8H1.8L1.3 12H0zm1.2 4.8h1.6L3.8 6zM8 4h1.6l2.4 8h-1.6l-.5-1.8H8.1L7.6 12H6zm1.2 4.8h1.6L9.9 6z"/></svg>
        </button>
        <button type="button" id="settingsBtn" class="search-toggle" title="设置" aria-pressed="false" aria-expanded="false">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M9.1 1.5 9.5 3c.5.1 1 .3 1.4.6l1.3-.7 1.4 1.4-.7 1.3c.3.4.5.9.6 1.4l1.5.4v2l-1.5.4c-.1.5-.3 1-.6 1.4l.7 1.3-1.4 1.4-1.3-.7c-.4.3-.9.5-1.4.6l-.4 1.5h-2l-.4-1.5c-.5-.1-1-.3-1.4-.6l-1.3.7-1.4-1.4.7-1.3c-.3-.4-.5-.9-.6-1.4L1.5 9V7l1.5-.4c.1-.5.3-1 .6-1.4l-.7-1.3 1.4-1.4 1.3.7c.4-.3.9-.5 1.4-.6l.4-1.5zM8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5"/></svg>
        </button>
      </div>
    </div>
    <div id="settingsClip" class="settings-clip">
      <div class="settings-clip-inner">
        <div id="settingsPanel" class="settings-panel" aria-hidden="true">
          <label class="settings-label" for="include">包含文件夹</label>
          <div class="folder-row">
            <input id="include" type="text" placeholder="例如 src, lib" spellcheck="false" data-hover-tip="只搜索这些文件夹下的文件节点；留空表示全部。填写相对工作区的文件夹，逗号分隔。">
            <button type="button" id="browseInclude" class="folder-browse">浏览</button>
          </div>
          <label class="settings-label" for="exclude">排除文件夹</label>
          <div class="folder-row">
            <input id="exclude" type="text" placeholder="例如 dist, node_modules" spellcheck="false" data-hover-tip="这些文件夹下的文件节点不参与搜索。分组名称匹配不受此限制。">
            <button type="button" id="browseExclude" class="folder-browse">浏览</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div id="treeRoot" class="tree-root" role="tree" aria-label="分组"></div>
  </div>
  <div id="hoverTip" class="hover-tip" hidden></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}

type SearchViewMessage =
  | { type: 'ready' }
  | { type: 'query'; query: string }
  | { type: 'commitQuery'; query: string }
  | { type: 'mode'; mode: SearchMode }
  | { type: 'folders'; include: string; exclude: string }
  | { type: 'pickFolder'; field: 'include' | 'exclude' }
  | { type: 'select'; id: string }
  | { type: 'toggle'; id: string; expanded: boolean }
  | { type: 'activate'; id: string }
  | { type: 'run'; id: string; command: string }
  | {
      type: 'drop';
      targetId: string | undefined;
      groupIds?: string[];
      files?: Array<{ groupId: string; path: string }>;
    };

interface SearchViewInitMessage {
  type: 'init';
  query: string;
  mode: SearchMode;
  include: string;
  exclude: string;
  history: string[];
  enabled: boolean;
}

interface SearchViewTreeMessage {
  type: 'tree';
  nodes: SidebarTreeNode[];
  emptyMessage?: string;
  enabled: boolean;
  iconThemeCss?: string;
}

function mergeFolderText(existing: string, additions: string[]): string {
  const parts = existing
    .split(/[,;\n]/)
    .map((part) => normalizeFolderPattern(part))
    .filter(Boolean);
  for (const item of additions) {
    if (!parts.includes(item)) {
      parts.push(item);
    }
  }
  return parts.join(', ');
}
