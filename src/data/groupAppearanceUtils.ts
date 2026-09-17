/** 分组颜色 / 图标：预设白名单，保持简单可协作。 */

export interface GroupColorOption {
  id: string;
  label: string;
  /** 侧边栏 Codicon 着色用 */
  hex: string;
}

export interface GroupIconOption {
  id: string;
  label: string;
}

export const GROUP_COLOR_OPTIONS: readonly GroupColorOption[] = [
  { id: 'red', label: '红', hex: '#f14c4c' },
  { id: 'orange', label: '橙', hex: '#e8a838' },
  { id: 'yellow', label: '黄', hex: '#cca700' },
  { id: 'green', label: '绿', hex: '#3fa26b' },
  { id: 'teal', label: '青', hex: '#29a3a3' },
  { id: 'blue', label: '蓝', hex: '#3794ff' },
  { id: 'purple', label: '紫', hex: '#b180d7' },
  { id: 'pink', label: '粉', hex: '#d16b9c' },
  { id: 'gray', label: '灰', hex: '#8b8b8b' },
];

export const GROUP_ICON_OPTIONS: readonly GroupIconOption[] = [
  { id: 'folder', label: '文件夹' },
  { id: 'bookmark', label: '书签' },
  { id: 'star', label: '星标' },
  { id: 'bug', label: '缺陷' },
  { id: 'flame', label: '火焰' },
  { id: 'beaker', label: '实验' },
  { id: 'package', label: '包裹' },
  { id: 'tools', label: '工具' },
  { id: 'heart', label: '心形' },
  { id: 'lightbulb', label: '灵感' },
  { id: 'rocket', label: '火箭' },
  { id: 'file-code', label: '代码' },
  { id: 'database', label: '数据库' },
  { id: 'server', label: '服务' },
  { id: 'shield', label: '盾牌' },
];

const COLOR_IDS = new Set(GROUP_COLOR_OPTIONS.map((item) => item.id));
const ICON_IDS = new Set(GROUP_ICON_OPTIONS.map((item) => item.id));

export function normalizeGroupColor(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const id = raw.trim().toLowerCase();
  return COLOR_IDS.has(id) ? id : undefined;
}

export function normalizeGroupIcon(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const id = raw.trim();
  return ICON_IDS.has(id) ? id : undefined;
}

export function groupColorHex(colorId: string | undefined): string | undefined {
  if (!colorId) {
    return undefined;
  }
  return GROUP_COLOR_OPTIONS.find((item) => item.id === colorId)?.hex;
}

export function resolveGroupIconId(
  icon: string | undefined,
  expanded: boolean,
): string {
  if (icon && ICON_IDS.has(icon)) {
    if (icon === 'folder') {
      return expanded ? 'folder-opened' : 'folder';
    }
    return icon;
  }
  return expanded ? 'folder-opened' : 'folder';
}
