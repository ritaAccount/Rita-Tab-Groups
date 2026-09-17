import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  DEFAULT_SHORTCUTS,
  MANAGED_SHORTCUT_COMMANDS,
  SHORTCUT_COMMANDS,
  SHORTCUT_WHEN,
  ShortcutSettings,
} from '../data/types';
import { getWorkspaceFolders, isValidWorkspace } from '../workspace/workspaceUtils';

interface KeybindingEntry {
  key: string;
  command: string;
  when?: string;
}

const SHORTCUT_PATTERN =
  /^(?:(?:ctrl|cmd|shift|alt|opt|win)\+)+(?:[a-z0-9]+|\[|\]|;|'|"|space|enter|tab|escape|backspace|delete|home|end|pageup|pagedown|left|right|up|down|f[1-9]|f1[0-2])$/i;

const SHORTCUT_ENTRIES: Array<{
  settingKey: keyof ShortcutSettings;
  command: string;
  when: string;
}> = [
  { settingKey: 'addToGroup', command: SHORTCUT_COMMANDS.addToGroup, when: SHORTCUT_WHEN.file },
  { settingKey: 'removeFromGroup', command: SHORTCUT_COMMANDS.removeFromGroup, when: SHORTCUT_WHEN.file },
  { settingKey: 'createGroup', command: SHORTCUT_COMMANDS.createGroup, when: SHORTCUT_WHEN.workspace },
  { settingKey: 'deleteGroup', command: SHORTCUT_COMMANDS.deleteGroup, when: SHORTCUT_WHEN.workspace },
  { settingKey: 'addCursor', command: SHORTCUT_COMMANDS.addCursor, when: SHORTCUT_WHEN.fileEditor },
  { settingKey: 'addFunction', command: SHORTCUT_COMMANDS.addFunction, when: SHORTCUT_WHEN.fileEditor },
  { settingKey: 'addText', command: SHORTCUT_COMMANDS.addText, when: SHORTCUT_WHEN.fileEditor },
  { settingKey: 'prevCursor', command: SHORTCUT_COMMANDS.prevCursor, when: SHORTCUT_WHEN.fileEditor },
  { settingKey: 'nextCursor', command: SHORTCUT_COMMANDS.nextCursor, when: SHORTCUT_WHEN.fileEditor },
  { settingKey: 'setGroupColor', command: SHORTCUT_COMMANDS.setGroupColor, when: SHORTCUT_WHEN.workspace },
  { settingKey: 'setGroupIcon', command: SHORTCUT_COMMANDS.setGroupIcon, when: SHORTCUT_WHEN.workspace },
];

const SHORTCUT_KEYS = Object.keys(DEFAULT_SHORTCUTS) as Array<keyof ShortcutSettings>;

/** 空字符串表示不绑定；非空须符合组合键格式。 */
export function validateShortcut(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '' || SHORTCUT_PATTERN.test(trimmed);
}

function validateAllShortcuts(shortcuts: ShortcutSettings): boolean {
  return SHORTCUT_KEYS.every((key) => validateShortcut(shortcuts[key]));
}

/** undefined → 默认值；显式 `""` → 不绑定。 */
function resolveShortcut(raw: string | undefined, fallback: string): string {
  if (typeof raw !== 'string') {
    return fallback;
  }
  return raw.trim();
}

function mergeShortcutSettings(partial?: Partial<ShortcutSettings>): ShortcutSettings {
  return {
    addToGroup: resolveShortcut(partial?.addToGroup, DEFAULT_SHORTCUTS.addToGroup),
    removeFromGroup: resolveShortcut(partial?.removeFromGroup, DEFAULT_SHORTCUTS.removeFromGroup),
    createGroup: resolveShortcut(partial?.createGroup, DEFAULT_SHORTCUTS.createGroup),
    deleteGroup: resolveShortcut(partial?.deleteGroup, DEFAULT_SHORTCUTS.deleteGroup),
    addCursor: resolveShortcut(partial?.addCursor, DEFAULT_SHORTCUTS.addCursor),
    addFunction: resolveShortcut(partial?.addFunction, DEFAULT_SHORTCUTS.addFunction),
    addText: resolveShortcut(partial?.addText, DEFAULT_SHORTCUTS.addText),
    prevCursor: resolveShortcut(partial?.prevCursor, DEFAULT_SHORTCUTS.prevCursor),
    nextCursor: resolveShortcut(partial?.nextCursor, DEFAULT_SHORTCUTS.nextCursor),
    setGroupColor: resolveShortcut(partial?.setGroupColor, DEFAULT_SHORTCUTS.setGroupColor),
    setGroupIcon: resolveShortcut(partial?.setGroupIcon, DEFAULT_SHORTCUTS.setGroupIcon),
  };
}

export function getShortcuts(): ShortcutSettings {
  const folder = getWorkspaceFolders()[0];
  const config = vscode.workspace.getConfiguration('tabGroups', folder?.uri);
  return mergeShortcutSettings(config.get<Partial<ShortcutSettings>>('shortcuts'));
}

export async function ensureWorkspaceShortcutSettings(): Promise<void> {
  if (!isValidWorkspace()) {
    return;
  }

  const config = vscode.workspace.getConfiguration('tabGroups');
  const workspaceValue = config.inspect<Partial<ShortcutSettings>>('shortcuts')?.workspaceValue;
  const merged = mergeShortcutSettings(workspaceValue);
  // 允许值为 ""（不绑定）；仅缺 key 时才补全
  const isComplete =
    !!workspaceValue && SHORTCUT_KEYS.every((key) => typeof workspaceValue[key] === 'string');

  if (!isComplete) {
    await config.update('shortcuts', merged, vscode.ConfigurationTarget.Workspace);
  }
}

export async function saveShortcuts(shortcuts: ShortcutSettings): Promise<void> {
  if (!isValidWorkspace()) {
    throw new Error('NO_WORKSPACE');
  }

  if (!validateAllShortcuts(shortcuts)) {
    throw new Error('INVALID_FORMAT');
  }

  const normalized = mergeShortcutSettings(shortcuts);
  const config = vscode.workspace.getConfiguration('tabGroups');
  await config.update('shortcuts', normalized, vscode.ConfigurationTarget.Workspace);
  await syncKeybindingsFromSettings();
}

export async function syncKeybindingsFromSettings(): Promise<void> {
  const shortcuts = getShortcuts();
  const keybindingsPath = getUserKeybindingsPath();

  let bindings: KeybindingEntry[] = [];
  try {
    const content = await fs.readFile(keybindingsPath, 'utf8');
    bindings = parseJsoncArray(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  bindings = bindings.filter((entry) => !isManagedShortcutCommand(entry.command));

  for (const { settingKey, command, when } of SHORTCUT_ENTRIES) {
    const key = shortcuts[settingKey].trim();
    if (key) {
      bindings.push({ key, command, when });
      continue;
    }
    // 空 = 不绑定：写入 -command，覆盖 package.json 默认键
    const defaultKey = DEFAULT_SHORTCUTS[settingKey];
    if (defaultKey) {
      bindings.push({ key: defaultKey, command: `-${command}` });
    }
  }

  await fs.mkdir(path.dirname(keybindingsPath), { recursive: true });
  await fs.writeFile(keybindingsPath, `${JSON.stringify(bindings, null, 2)}\n`, 'utf8');
}

function isManagedShortcutCommand(command: string): boolean {
  const bare = command.startsWith('-') ? command.slice(1) : command;
  return (MANAGED_SHORTCUT_COMMANDS as readonly string[]).includes(bare);
}

export function getUserKeybindingsPath(): string {
  const home = os.homedir();
  const productFolder = resolveProductFolder(vscode.env.appName);

  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', productFolder, 'User', 'keybindings.json');
  }
  if (process.platform === 'win32') {
    return path.join(home, 'AppData', 'Roaming', productFolder, 'User', 'keybindings.json');
  }
  return path.join(home, '.config', productFolder, 'User', 'keybindings.json');
}

function resolveProductFolder(appName: string): string {
  const normalized = appName.toLowerCase();
  if (normalized.includes('cursor')) {
    return 'Cursor';
  }
  if (normalized.includes('insiders')) {
    return 'Code - Insiders';
  }
  if (normalized.includes('oss')) {
    return 'Code - OSS';
  }
  return 'Code';
}

function parseJsoncArray(text: string): KeybindingEntry[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const withoutBlockComments = trimmed.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, '');
  const parsed = JSON.parse(withoutLineComments.trim() || '[]');
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isKeybindingEntry);
}

function isKeybindingEntry(value: unknown): value is KeybindingEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as KeybindingEntry).key === 'string' &&
    typeof (value as KeybindingEntry).command === 'string'
  );
}
