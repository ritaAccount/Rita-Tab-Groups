import * as vscode from 'vscode';
import { CONFIG_VERSION } from '../data/fileEntryUtils';
import {
  ensureWorkspaceDisplaySettings,
  getDisplaySettings,
  saveDisplaySettings,
} from './displaySettingsUtils';
import { AI_SKILL_RELATIVE_PATH, ensureWorkspaceAiGuides } from '../workspace/aiGuideUtils';
import { TabGroupsWorkspace } from '../data/tabGroupsWorkspace';
import {
  CONFIG_RELATIVE_PATH,
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_SHORTCUTS,
  DisplaySettings,
  ShortcutSettings,
} from '../data/types';
import { ensureWorkspaceShortcutSettings, getShortcuts, saveShortcuts } from './shortcutUtils';
import { applyMarkerJumpHintVisibility } from '../tree/fileLocationUtils';
import {
  getWorkspaceInvalidMessage,
  isValidWorkspace,
  pickWorkspaceFolder,
} from '../workspace/workspaceUtils';
import { runExportTabGroups, runImportTabGroups } from './importExportCommands';

let panel: vscode.WebviewPanel | undefined;
let settingsWorkspace: TabGroupsWorkspace | undefined;
let onConfigUpgraded: (() => void) | undefined;
let onDisplaySettingsChanged: (() => void) | undefined;
let onImportExportDone: (() => void) | undefined;
let extensionVersion = 'unknown';

export function registerSettingsCommands(
  context: vscode.ExtensionContext,
  workspace: TabGroupsWorkspace,
  options?: {
    onConfigUpgraded?: () => void;
    onDisplaySettingsChanged?: () => void;
    onImportExportDone?: () => void;
  },
): void {
  settingsWorkspace = workspace;
  onConfigUpgraded = options?.onConfigUpgraded;
  onDisplaySettingsChanged = options?.onDisplaySettingsChanged;
  onImportExportDone = options?.onImportExportDone;
  extensionVersion =
    (context.extension.packageJSON as { version?: string }).version ?? 'unknown';

  context.subscriptions.push(
    vscode.commands.registerCommand('tabGroups.openSettings', () => {
      openSettingsWebview(context);
    }),
    vscode.commands.registerCommand('tabGroups.exportConfig', async () => {
      if (!settingsWorkspace) {
        return;
      }
      const manager = await settingsWorkspace.resolveTargetManager(
        undefined,
        '选择要导出配置的工作区文件夹',
      );
      if (!manager) {
        return;
      }
      const ok = await runExportTabGroups(manager);
      if (ok) {
        onImportExportDone?.();
      }
    }),
    vscode.commands.registerCommand('tabGroups.importConfig', async () => {
      if (!settingsWorkspace) {
        return;
      }
      const manager = await settingsWorkspace.resolveTargetManager(
        undefined,
        '选择要导入配置的工作区文件夹',
      );
      if (!manager) {
        return;
      }
      const ok = await runImportTabGroups(manager);
      if (ok) {
        onImportExportDone?.();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('tabGroups.display')) {
        return;
      }
      applyMarkerJumpHintVisibility();
      onDisplaySettingsChanged?.();
    }),
  );
}

function openSettingsWebview(context: vscode.ExtensionContext): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    postVersionInfo(panel);
    postDisplayInit(panel, getDisplaySettings());
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'tabGroupsSettings',
    'Tab Groups 设置',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    },
  );

  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'ready') {
      postInit(panel!, getShortcuts());
      postDisplayInit(panel!, getDisplaySettings());
      postVersionInfo(panel!);
      return;
    }

    if (message.type === 'reset') {
      postInit(panel!, { ...DEFAULT_SHORTCUTS });
      return;
    }

    if (message.type === 'save') {
      await handleSave(panel!, message.shortcuts as ShortcutSettings);
      return;
    }

    if (message.type === 'resetDisplay') {
      await handleSaveDisplay(panel!, { ...DEFAULT_DISPLAY_SETTINGS }, '已恢复默认并保存。');
      return;
    }

    if (message.type === 'saveDisplay') {
      await handleSaveDisplay(panel!, message.display as DisplaySettings);
      return;
    }

    if (message.type === 'openGroupsFile') {
      await openTabGroupsJson(panel!, 'groups');
      return;
    }

    if (message.type === 'openConfigsFile') {
      await openTabGroupsJson(panel!, 'configs');
      return;
    }

    if (message.type === 'exportConfig') {
      if (!settingsWorkspace) {
        return;
      }
      const manager = await settingsWorkspace.resolveTargetManager(
        undefined,
        '选择要导出配置的工作区文件夹',
      );
      if (!manager) {
        return;
      }
      const ok = await runExportTabGroups(manager);
      if (ok) {
        onImportExportDone?.();
        panel!.webview.postMessage({ type: 'generalStatus', text: '已导出配置文件。' });
      } else {
        panel!.webview.postMessage({ type: 'generalStatus', text: '已取消导出。' });
      }
      return;
    }

    if (message.type === 'importConfig') {
      if (!settingsWorkspace) {
        return;
      }
      const manager = await settingsWorkspace.resolveTargetManager(
        undefined,
        '选择要导入配置的工作区文件夹',
      );
      if (!manager) {
        return;
      }
      const ok = await runImportTabGroups(manager);
      if (ok) {
        onImportExportDone?.();
        postVersionInfo(panel!);
        panel!.webview.postMessage({ type: 'generalStatus', text: '已导入并写入配置。' });
      } else {
        panel!.webview.postMessage({ type: 'generalStatus', text: '已取消导入。' });
      }
      return;
    }

    if (message.type === 'upgradeConfig') {
      await handleUpgradeConfig(panel!);
    }
  });

  panel.onDidDispose(() => {
    panel = undefined;
  });
}

function postVersionInfo(webviewPanel: vscode.WebviewPanel): void {
  const managers = settingsWorkspace?.getManagers() ?? [];
  const versions = managers.map((m) => m.getConfigVersion());
  const needsUpgrade = managers.some((m) => m.needsConfigUpgrade());
  const configVersion =
    versions.length === 0
      ? '（无）'
      : versions.length === 1
        ? versions[0]
        : versions.join(' / ');
  webviewPanel.webview.postMessage({
    type: 'versionInfo',
    extensionVersion,
    configVersion,
    schemaVersion: CONFIG_VERSION,
    needsUpgrade,
  });
}

function postDisplayInit(webviewPanel: vscode.WebviewPanel, display: DisplaySettings): void {
  webviewPanel.webview.postMessage({
    type: 'displayInit',
    display,
  });
}

async function handleSaveDisplay(
  webviewPanel: vscode.WebviewPanel,
  display: DisplaySettings,
  successText = '已保存',
): Promise<void> {
  if (!isValidWorkspace()) {
    webviewPanel.webview.postMessage({
      type: 'displayStatus',
      text: getWorkspaceInvalidMessage() || '请先打开工作区文件夹后再保存。',
    });
    return;
  }

  try {
    const saved = await saveDisplaySettings(display);
    applyMarkerJumpHintVisibility();
    onDisplaySettingsChanged?.();
    webviewPanel.webview.postMessage({
      type: 'displaySaved',
      display: saved,
      text: successText,
    });
  } catch (error) {
    webviewPanel.webview.postMessage({
      type: 'displayStatus',
      text: error instanceof Error ? error.message : '保存失败',
    });
  }
}

async function handleUpgradeConfig(webviewPanel: vscode.WebviewPanel): Promise<void> {
  if (!isValidWorkspace()) {
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text: getWorkspaceInvalidMessage() || '请先打开工作区文件夹。',
    });
    return;
  }

  if (!settingsWorkspace) {
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text: '内部错误：配置管理器未初始化。',
    });
    return;
  }

  const managers = settingsWorkspace.getManagers();
  if (managers.length === 0) {
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text: '当前没有可用的工作区文件夹。',
    });
    return;
  }

  if (!managers.some((m) => m.needsConfigUpgrade())) {
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text: `配置已是最新（schema ${CONFIG_VERSION}），无需更新。`,
    });
    postVersionInfo(webviewPanel);
    return;
  }

  try {
    const upgraded: string[] = [];
    for (const manager of managers) {
      if (!manager.needsConfigUpgrade()) {
        continue;
      }
      const result = await manager.upgradeConfigIfNeeded();
      if (result.upgraded) {
        upgraded.push(
          `${manager.folder.name}: ${result.from ?? '未知'} → ${result.to}`,
        );
      }
    }
    await ensureWorkspaceShortcutSettings();
    await ensureWorkspaceDisplaySettings();
    onConfigUpgraded?.();
    postVersionInfo(webviewPanel);
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text:
        upgraded.length > 0
          ? `已升级：${upgraded.join('；')}`
          : `配置已是最新（schema ${CONFIG_VERSION}）。`,
    });
    vscode.window.setStatusBarMessage('Tab Groups 配置已检查/升级', 3000);
  } catch (error) {
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text: error instanceof Error ? error.message : '升级配置失败',
    });
  }
}

async function openTabGroupsJson(
  webviewPanel: vscode.WebviewPanel,
  section: 'groups' | 'configs',
): Promise<void> {
  if (!isValidWorkspace()) {
    webviewPanel.webview.postMessage({
      type: 'generalStatus',
      text: getWorkspaceInvalidMessage() || '请先打开工作区文件夹。',
    });
    return;
  }

  const folder = await pickWorkspaceFolder('选择要打开配置的工作区文件夹');
  if (!folder) {
    return;
  }

  const configUri = vscode.Uri.joinPath(folder.uri, CONFIG_RELATIVE_PATH);

  try {
    await vscode.workspace.fs.stat(configUri);
  } catch {
    const initial = Buffer.from(
      JSON.stringify({ version: CONFIG_VERSION, groups: [], configs: [] }, null, 2),
      'utf8',
    );
    await vscode.workspace.fs.writeFile(configUri, initial);
  }

  const doc = await vscode.workspace.openTextDocument(configUri);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });

  const marker = section === 'groups' ? '"groups"' : '"configs"';
  const index = doc.getText().indexOf(marker);
  if (index >= 0) {
    const position = doc.positionAt(index);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }

  webviewPanel.webview.postMessage({
    type: 'generalStatus',
    text:
      section === 'groups'
        ? '已打开分组配置文件（.vscode/tab-groups.json → groups）。'
        : '已打开正则规则配置（.vscode/tab-groups.json → configs）。',
  });
}

async function handleSave(
  webviewPanel: vscode.WebviewPanel,
  shortcuts: ShortcutSettings,
): Promise<void> {
  if (!isValidWorkspace()) {
    webviewPanel.webview.postMessage({
      type: 'error',
      text: getWorkspaceInvalidMessage() || '请先打开工作区文件夹后再保存。',
    });
    return;
  }

  try {
    await saveShortcuts(shortcuts);
    webviewPanel.webview.postMessage({
      type: 'saved',
      shortcuts,
      text: '快捷键已保存，并已同步到 keybindings.json。',
    });
    vscode.window.setStatusBarMessage('Tab Groups 快捷键已更新', 3000);
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_FORMAT') {
      webviewPanel.webview.postMessage({
        type: 'error',
        text: '快捷键格式无效，请重新录入。',
      });
      return;
    }
    webviewPanel.webview.postMessage({
      type: 'error',
      text: error instanceof Error ? error.message : '保存失败',
    });
  }
}

function postInit(webviewPanel: vscode.WebviewPanel, shortcuts: ShortcutSettings): void {
  webviewPanel.webview.postMessage({
    type: 'init',
    shortcuts,
    isMac: process.platform === 'darwin',
  });
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const settingsStyleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'settings.css'),
  );
  const shortcutsStyleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'shortcuts.css'),
  );
  const settingsScriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'settings.js'),
  );
  const shortcutsScriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'shortcuts.js'),
  );
  const cspSource = webview.cspSource;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource}; script-src ${cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${settingsStyleUri}" rel="stylesheet">
  <link href="${shortcutsStyleUri}" rel="stylesheet">
  <title>Tab Groups 设置</title>
</head>
<body>
  <div class="settings-layout">
    <nav class="settings-nav" aria-label="设置分类">
      <button type="button" class="nav-item active" data-pane="general">通用</button>
      <button type="button" class="nav-item" data-pane="display">显示</button>
      <button type="button" class="nav-item" data-pane="shortcuts">快捷键</button>
    </nav>
    <main class="settings-content">
      <section class="settings-pane active" data-pane="general" id="pane-general">
        <div class="pane-inner">
          <h1>通用</h1>
          <p class="hint">分组与全局正则规则保存在工作区的 <code>.vscode/tab-groups.json</code> 中。</p>

          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">分组配置文件</div>
              <div class="setting-desc">打开并定位到 groups</div>
            </div>
            <button type="button" class="primary" id="openGroupsFile">打开</button>
          </div>

          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">正则规则配置</div>
              <div class="setting-desc">打开并定位到 configs</div>
            </div>
            <button type="button" class="primary" id="openConfigsFile">打开</button>
          </div>

          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">配置版本更新</div>
              <div class="setting-desc" id="versionDesc">检查并升级 tab-groups.json schema</div>
            </div>
            <button type="button" class="primary" id="upgradeConfig">检查更新</button>
          </div>

          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">导出配置</div>
              <div class="setting-desc">导出全部或所选分组（含子树与引用的全局规则）为 JSON 文件</div>
            </div>
            <button type="button" class="primary" id="exportConfig">导出</button>
          </div>

          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">导入配置</div>
              <div class="setting-desc">从 JSON 合并到当前，或整文件替换</div>
            </div>
            <button type="button" class="primary" id="importConfig">导入</button>
          </div>

          <div id="generalStatus" class="status"></div>
        </div>
      </section>

      <section class="settings-pane" data-pane="display" id="pane-display">
        <div class="pane-inner">
          <h1>显示</h1>
          <p class="hint">修改后自动保存到工作区 <code>.vscode/settings.json</code>。</p>

          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">标记左下角显示</div>
              <div class="setting-desc">跳转标记时，左下角状态栏如何提示「类型：名称」</div>
            </div>
            <select id="markerJumpHintMode" class="setting-select" aria-label="标记左下角显示">
              <option value="always">一直显示</option>
              <option value="timed">显示秒数</option>
              <option value="off">关闭</option>
            </select>
          </div>

          <div class="setting-item" id="markerJumpHintSecondsRow" hidden>
            <div class="setting-text">
              <div class="setting-title">显示时长</div>
              <div class="setting-desc">提示在左下角停留的秒数</div>
            </div>
            <div class="setting-inline">
              <input type="number" id="markerJumpHintSeconds" class="seconds-input" min="0.5" max="60" step="0.5" value="1" aria-label="显示时长秒数">
              <span class="seconds-unit">秒</span>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">显示来源分支</div>
              <div class="setting-desc">侧边栏是否展示添加节点时的 Git 分支（悬停可看完整名）</div>
            </div>
            <label class="setting-toggle">
              <input type="checkbox" id="showSourceBranch" checked>
              <span>开启</span>
            </label>
          </div>

          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">分组类型显示</div>
              <div class="setting-desc">「手动 / 正则 / 引用」显示在名称后、悬停，或两处都显示</div>
            </div>
            <select id="groupTypeDisplayMode" class="setting-select" aria-label="分组类型显示">
              <option value="label">名称后面</option>
              <option value="hover">仅悬停</option>
              <option value="both">都显示</option>
            </select>
          </div>

          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">恢复默认</div>
              <div class="setting-desc">重置显示相关选项</div>
            </div>
            <button type="button" class="secondary" id="resetDisplay">恢复默认</button>
          </div>

          <div id="displayStatus" class="status"></div>
        </div>
      </section>

      <section class="settings-pane" data-pane="shortcuts" id="pane-shortcuts">
        <div class="pane-inner">
          <h1>快捷键</h1>
          <p class="hint">点击右侧框后按下组合键录入；Backspace / Delete 清除（不绑定）。保存后写入工作区 settings，并同步到 keybindings。</p>

          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">加入分组</div>
            </div>
            <button id="addToGroup" class="shortcut-button" type="button" data-shortcut="addToGroup">ctrl+shift+i</button>
          </div>
          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">取消分组</div>
            </div>
            <button id="removeFromGroup" class="shortcut-button" type="button" data-shortcut="removeFromGroup">ctrl+shift+o</button>
          </div>
          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">新建分组</div>
            </div>
            <button id="createGroup" class="shortcut-button" type="button" data-shortcut="createGroup">ctrl+shift+u</button>
          </div>
          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">删除分组</div>
            </div>
            <button id="deleteGroup" class="shortcut-button" type="button" data-shortcut="deleteGroup">ctrl+shift+p</button>
          </div>
          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">添加游标</div>
            </div>
            <button id="addCursor" class="shortcut-button" type="button" data-shortcut="addCursor">ctrl+shift+l</button>
          </div>
          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">添加函数</div>
            </div>
            <button id="addFunction" class="shortcut-button" type="button" data-shortcut="addFunction">ctrl+shift+;</button>
          </div>
          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">字符匹配</div>
            </div>
            <button id="addText" class="shortcut-button" type="button" data-shortcut="addText">ctrl+shift+'</button>
          </div>
          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">上一标记</div>
            </div>
            <button id="prevCursor" class="shortcut-button" type="button" data-shortcut="prevCursor">ctrl+shift+[</button>
          </div>
          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">下一标记</div>
            </div>
            <button id="nextCursor" class="shortcut-button" type="button" data-shortcut="nextCursor">ctrl+shift+]</button>
          </div>
          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">设置分组颜色</div>
              <div class="setting-desc">需先在侧边栏选中分组</div>
            </div>
            <button id="setGroupColor" class="shortcut-button" type="button" data-shortcut="setGroupColor">ctrl+alt+c</button>
          </div>
          <div class="setting-item">
            <div class="setting-text">
              <div class="setting-title">设置分组图标</div>
              <div class="setting-desc">需先在侧边栏选中分组</div>
            </div>
            <button id="setGroupIcon" class="shortcut-button" type="button" data-shortcut="setGroupIcon">ctrl+alt+i</button>
          </div>

          <div id="status" class="status"></div>

          <div class="actions">
            <button id="save" class="primary" type="button">保存</button>
            <button id="reset" class="secondary" type="button">恢复默认</button>
          </div>

          <div class="warning">
            保存需要已打开工作区文件夹。快捷键会写入用户 keybindings.json；若文件中已有注释，同步时可能被移除。
          </div>
        </div>
      </section>
    </main>
  </div>

  <script src="${settingsScriptUri}"></script>
  <script src="${shortcutsScriptUri}"></script>
</body>
</html>`;
}

export async function initializeShortcutSettings(): Promise<void> {
  await ensureWorkspaceShortcutSettings();
  await ensureWorkspaceDisplaySettings();
  const wroteAiSkill = await ensureWorkspaceAiGuides();
  if (wroteAiSkill) {
    vscode.window.setStatusBarMessage(
      `Tab Groups: 已写入 AI Skill（${AI_SKILL_RELATIVE_PATH}），可直接让 AI 代操作分组`,
      6000,
    );
  }
}
