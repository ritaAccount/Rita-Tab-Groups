export interface BaseConfig {
  type: 'manual' | 'regex';
}

export interface ManualConfig extends BaseConfig {
  type: 'manual';
}

export interface RegexConfig extends BaseConfig {
  type: 'regex';
  regex: string;
}

export type InlineConfig = ManualConfig | RegexConfig;

export type GlobalConfig = (ManualConfig | RegexConfig) & {
  id: string;
  description?: string;
};

export interface Group {
  id: string;
  name: string;
  level: number;
  children: string[];
  files: GroupFileEntry[];
  config?: InlineConfig;
  configId?: string;
  /** 预设色板 id（见 groupAppearanceUtils），可选 */
  color?: string;
  /** Codicon id（白名单），可选；默认 folder */
  icon?: string;
}

export interface GroupFileEntry {
  path: string;
  alias: string;
  /**
   * 多根时：文件所属工作区文件夹名（WorkspaceFolder.name）。
   * 省略表示与配置所在根相同（单根 / 同根条目）。
   */
  folder?: string;
  /** 加入分组时的 Git 分支（可选；旧数据可能没有） */
  branch?: string;
  /**
   * 按类型分组的标记：
   * [{ type, content: [{ line, column, label, ... }] }, ...]
   */
  markers?: FileMarkerGroup[];
}

/** cursor=游标 | function=函数 | text=字符匹配（模糊定位） */
export type FileMarkerType = 'cursor' | 'function' | 'text';

/** 单条标记内容（不含 type，type 在分组上） */
export interface FileMarkerItem {
  label: string;
  line: number;
  column: number;
  /** 添加该标记时的 Git 分支（可选；旧数据可能没有） */
  branch?: string;
  /** function：符号名 */
  symbolName?: string;
  symbolKind?: number;
  /** text：匹配用的查询串 */
  query?: string;
}

export interface FileMarkerGroup {
  type: FileMarkerType;
  content: FileMarkerItem[];
}

/** 展平后的标记（树 / 跳转用） */
export interface FlatFileMarker {
  type: FileMarkerType;
  contentIndex: number;
  item: FileMarkerItem;
}

export interface TabGroupsData {
  version?: string;
  groups: Group[];
  configs: GlobalConfig[];
}

export const CONFIG_RELATIVE_PATH = '.vscode/tab-groups.json';

/** 标记跳转左下角提示：一直显示 | 按秒数消失 | 关闭 */
export type MarkerJumpHintMode = 'always' | 'timed' | 'off';

/** 分组类型（手动/正则/引用）显示位置：仅悬停 | 仅名称后 | 都显示 */
export type GroupTypeDisplayMode = 'hover' | 'label' | 'both';

export interface DisplaySettings {
  markerJumpHintMode: MarkerJumpHintMode;
  /** mode 为 timed 时的显示秒数 */
  markerJumpHintSeconds: number;
  /** 侧边栏是否展示节点来源分支，默认打开 */
  showSourceBranch: boolean;
  /** 分组「手动/正则/引用」后缀如何显示，默认名称后 */
  groupTypeDisplayMode: GroupTypeDisplayMode;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  markerJumpHintMode: 'always',
  markerJumpHintSeconds: 1,
  showSourceBranch: true,
  groupTypeDisplayMode: 'label',
};

/** 侧边栏节点搜索：模糊 | 精准 */
export type SearchMode = 'fuzzy' | 'exact';

export interface SearchSettings {
  /** 名称匹配方式，默认模糊 */
  mode: SearchMode;
  /** 包含的文件夹（相对工作区，逗号分隔）；留空表示不限制 */
  include: string;
  /** 排除的文件夹（相对工作区，逗号分隔） */
  exclude: string;
}

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  mode: 'fuzzy',
  include: '',
  exclude: '',
};

export interface ShortcutSettings {
  addToGroup: string;
  removeFromGroup: string;
  createGroup: string;
  deleteGroup: string;
  addCursor: string;
  addFunction: string;
  addText: string;
  prevCursor: string;
  nextCursor: string;
  setGroupColor: string;
  setGroupIcon: string;
}

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  addToGroup: 'ctrl+shift+i',
  removeFromGroup: 'ctrl+shift+o',
  createGroup: 'ctrl+shift+u',
  deleteGroup: 'ctrl+shift+p',
  addCursor: 'ctrl+shift+l',
  addFunction: 'ctrl+shift+;',
  addText: "ctrl+shift+'",
  prevCursor: 'ctrl+shift+[',
  nextCursor: 'ctrl+shift+]',
  setGroupColor: 'ctrl+alt+c',
  setGroupIcon: 'ctrl+alt+i',
};

export const SHORTCUT_COMMANDS = {
  addToGroup: 'tabGroups.addToGroup',
  removeFromGroup: 'tabGroups.removeFromGroup',
  createGroup: 'tabGroups.createGroup',
  deleteGroup: 'tabGroups.deleteGroup',
  addCursor: 'tabGroups.addCursor',
  addFunction: 'tabGroups.addFunction',
  addText: 'tabGroups.addText',
  prevCursor: 'tabGroups.prevCursor',
  nextCursor: 'tabGroups.nextCursor',
  setGroupColor: 'tabGroups.setGroupColor',
  setGroupIcon: 'tabGroups.setGroupIcon',
} as const;

export const SHORTCUT_WHEN = {
  file: 'workspaceFolderCount >= 1 && resourceScheme == file',
  fileEditor: 'workspaceFolderCount >= 1 && resourceScheme == file && editorTextFocus',
  workspace: 'workspaceFolderCount >= 1',
} as const;

export const MANAGED_SHORTCUT_COMMANDS = Object.values(SHORTCUT_COMMANDS);
