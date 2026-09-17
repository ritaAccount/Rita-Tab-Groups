import * as vscode from 'vscode';
import { FileMarkerType, FlatFileMarker, Group, GroupFileEntry } from '../data/types';
import { TabGroupsManager } from '../data/tabGroupsManager';
import { TabGroupsWorkspace } from '../data/tabGroupsWorkspace';
import {
  countMarkers,
  formatFileEntryDescription,
  formatFileEntryTooltip,
  formatMarkerTooltip,
  markerTypeLabel,
  truncateBranchLabel,
} from '../data/fileEntryUtils';
import { getDisplaySettings } from '../settings/displaySettingsUtils';
import {
  TreeSearchFilter,
  TreeSearchIndex,
  buildFileSearchKey,
  buildMarkerSearchKey,
  buildMarkerTypeSearchKey,
  buildTreeSearchIndex,
} from './searchFilter';
import { fileExistenceCache } from '../workspace/fileExistenceCache';
import { isMultiRootWorkspace, isValidWorkspace, toAbsoluteUri } from '../workspace/workspaceUtils';
import {
  groupColorHex,
  resolveGroupIconId,
} from '../data/groupAppearanceUtils';

/** 树中标记类型组的固定顺序 */
const MARKER_TYPE_ORDER: FileMarkerType[] = ['cursor', 'function', 'text'];

export type TreeElement =
  | WorkspaceFolderTreeItem
  | GroupTreeItem
  | FileTreeItem
  | MarkerTypeTreeItem
  | MarkerTreeItem;

export type SidebarIcon =
  | { kind: 'codicon'; id: string; color?: string }
  | { kind: 'font'; fontId: string; character: string; color?: string; size?: string }
  | { kind: 'image'; uri: string };

export interface SidebarTreeNode {
  id: string;
  kind: 'workspaceFolder' | 'group' | 'file' | 'markerType' | 'marker';
  label: string;
  description?: string;
  tooltip?: string;
  contextValue: string;
  collapsible: boolean;
  expanded: boolean;
  missing?: boolean;
  groupId?: string;
  filePath?: string;
  folderUri?: string;
  iconId?: string;
  icon?: SidebarIcon;
  children?: SidebarTreeNode[];
}

/** 须与 package.json views.id 完全一致 */
const TREE_VIEW_MIME = 'application/vnd.code.tree.tabGroupsView';
const FILE_DRAG_MIME = 'application/vnd.tabgroups.file';

interface FileDragPayload {
  groupId: string;
  path: string;
}

/** 多根工作区顶层：工作区文件夹分区 */
export class WorkspaceFolderTreeItem extends vscode.TreeItem {
  constructor(public readonly folder: vscode.WorkspaceFolder) {
    super(folder.name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'workspaceFolder';
    this.iconPath = new vscode.ThemeIcon('root-folder');
    this.id = `workspaceFolder:${folder.uri.toString()}`;
    this.tooltip = folder.uri.fsPath;
    this.description = folder.uri.fsPath;
  }
}

export class GroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly folder: vscode.WorkspaceFolder,
    public readonly group: Group,
    typeLabel: string,
    isRegex: boolean,
    hasChildren: boolean,
  ) {
    const mode = getDisplaySettings().groupTypeDisplayMode;
    const showOnLabel = mode === 'label' || mode === 'both';
    const showOnHover = mode === 'hover' || mode === 'both';

    super(
      showOnLabel ? `${group.name}${typeLabel}` : group.name,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.contextValue = isRegex ? 'groupRegex' : 'group';
    this.iconPath = new vscode.ThemeIcon(resolveGroupIconId(group.icon, false));
    this.id = `group:${group.id}`;
    this.tooltip = showOnHover ? `${group.name}${typeLabel}` : group.name;

    if (!hasChildren) {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
  }
}

export class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly folder: vscode.WorkspaceFolder,
    public readonly groupId: string,
    public readonly fileEntry: GroupFileEntry,
    exists: boolean,
  ) {
    const hasMarkers = countMarkers(fileEntry.markers) > 0;
    super(
      fileEntry.alias,
      hasMarkers ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    this.relativePath = fileEntry.path;
    const showSourceBranch = getDisplaySettings().showSourceBranch;
    this.description = formatFileEntryDescription(fileEntry, exists, { showSourceBranch });
    this.contextValue = exists ? 'file' : 'missingFile';
    this.iconPath = new vscode.ThemeIcon(
      'file',
      exists ? undefined : new vscode.ThemeColor('disabledForeground'),
    );
    this.id = buildFileTreeItemId(groupId, fileEntry.path);
    this.tooltip = formatFileEntryTooltip(fileEntry, exists, { showSourceBranch });
    this.resourceUri = toAbsoluteUri(fileEntry.path, folder);

    if (exists) {
      this.command = {
        command: 'tabGroups.openFile',
        title: '打开文件',
        arguments: [this],
      };
    }
  }

  readonly relativePath: string;
}

/** 文件下的标记类型组（游标 / 函数 / 匹配） */
export class MarkerTypeTreeItem extends vscode.TreeItem {
  constructor(
    public readonly folder: vscode.WorkspaceFolder,
    public readonly groupId: string,
    public readonly relativePath: string,
    public readonly markerType: FileMarkerType,
    public readonly count: number,
  ) {
    super(markerTypeLabel(markerType), vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'markerType';
    this.description = String(count);
    this.tooltip = `${relativePath} · ${markerTypeLabel(markerType)}（${count}）`;
    this.iconPath = new vscode.ThemeIcon(markerTypeIcon(markerType));
    this.id = buildMarkerTypeTreeItemId(groupId, relativePath, markerType);
  }
}

export class MarkerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly folder: vscode.WorkspaceFolder,
    public readonly groupId: string,
    public readonly relativePath: string,
    public readonly marker: FlatFileMarker,
  ) {
    super(marker.item.label, vscode.TreeItemCollapsibleState.None);
    const showSourceBranch = getDisplaySettings().showSourceBranch;
    this.contextValue = 'marker';
    const branchPrefix =
      showSourceBranch && marker.item.branch ? `${truncateBranchLabel(marker.item.branch)} · ` : '';
    this.description = `${branchPrefix}L${marker.item.line + 1}:${marker.item.column + 1}`;
    this.tooltip = formatMarkerTooltip(relativePath, marker, { showSourceBranch });
    this.iconPath = new vscode.ThemeIcon(markerTypeIcon(marker.type));
    this.id = buildMarkerTreeItemId(groupId, relativePath, marker.type, marker.contentIndex);
    this.command = {
      command: 'tabGroups.openMarker',
      title: '打开标记',
      arguments: [this],
    };
  }

  get markerType(): FileMarkerType {
    return this.marker.type;
  }

  get contentIndex(): number {
    return this.marker.contentIndex;
  }
}

/** @deprecated */
export const CursorTreeItem = MarkerTreeItem;

function markerTypeIcon(type: FileMarkerType): string {
  switch (type) {
    case 'function':
      return 'symbol-method';
    case 'text':
      return 'search';
    default:
      return 'debug-stackframe-dot';
  }
}

export class TabGroupsTreeProvider
  implements vscode.TreeDataProvider<TreeElement>, vscode.TreeDragAndDropController<TreeElement>
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  readonly dropMimeTypes = [TREE_VIEW_MIME, FILE_DRAG_MIME];
  readonly dragMimeTypes = [TREE_VIEW_MIME, FILE_DRAG_MIME];

  private expandedGroupIds = new Set<string>();
  private expandedNodeIds = new Set<string>();
  private sidebarElements = new Map<string, TreeElement>();
  private searchFilter: TreeSearchFilter | undefined;

  constructor(private readonly workspace: TabGroupsWorkspace) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  setSearchFilter(filter: TreeSearchFilter | undefined): void {
    this.searchFilter = filter;
    this.refresh();
  }

  getSearchEmptyMessage(): string | undefined {
    const index = this.getSearchIndex();
    if (!index) {
      return undefined;
    }
    if (index.groupIds.size === 0) {
      return '未找到匹配的节点';
    }
    return undefined;
  }

  rememberExpanded(groupId: string): void {
    this.expandedGroupIds.add(groupId);
  }

  rememberCollapsed(groupId: string): void {
    this.expandedGroupIds.delete(groupId);
  }

  async getSidebarTree(): Promise<SidebarTreeNode[]> {
    this.sidebarElements.clear();
    const roots = await this.getChildren();
    return Promise.all(roots.map((element) => this.serializeSidebarNode(element)));
  }

  getSidebarElement(id: string): TreeElement | undefined {
    return this.sidebarElements.get(id);
  }

  setNodeExpanded(itemId: string, expanded: boolean): void {
    if (itemId.startsWith('group:')) {
      const groupId = itemId.slice('group:'.length);
      if (expanded) {
        this.rememberExpanded(groupId);
      } else {
        this.rememberCollapsed(groupId);
      }
    } else if (expanded) {
      this.expandedNodeIds.add(itemId);
    } else {
      this.expandedNodeIds.delete(itemId);
    }
    this.refresh();
  }

  async dropOnSidebar(
    targetId: string | undefined,
    payload: { groupIds?: string[]; files?: Array<{ groupId: string; path: string }> },
  ): Promise<void> {
    const dataTransfer = new vscode.DataTransfer();
    if (payload.files && payload.files.length > 0) {
      dataTransfer.set(FILE_DRAG_MIME, new vscode.DataTransferItem(payload.files));
    }
    if (payload.groupIds && payload.groupIds.length > 0) {
      const groups = payload.groupIds
        .map((id) => this.getGroupTreeItem(id))
        .filter((item): item is GroupTreeItem => item !== undefined);
      dataTransfer.set(TREE_VIEW_MIME, new vscode.DataTransferItem(groups));
    }
    const target = targetId ? this.getSidebarElement(targetId) : undefined;
    const tokenSource = new vscode.CancellationTokenSource();
    try {
      await this.handleDrop(target, dataTransfer, tokenSource.token);
    } finally {
      tokenSource.dispose();
    }
  }

  getExpandedGroupIds(): Set<string> {
    return this.expandedGroupIds;
  }

  handleDrag(source: readonly TreeElement[], dataTransfer: vscode.DataTransfer): void {
    if (!isValidWorkspace() || source.length === 0) {
      return;
    }

    const filePayloads = source
      .map((item) => getFileDragPayload(item))
      .filter((payload): payload is FileDragPayload => payload !== undefined);
    const groupIds = source
      .map((item) => getGroupId(item))
      .filter((groupId): groupId is string => groupId !== undefined);

    if (filePayloads.length > 0 && groupIds.length > 0) {
      return;
    }

    if (filePayloads.length > 0) {
      dataTransfer.set(FILE_DRAG_MIME, new vscode.DataTransferItem(filePayloads));
      return;
    }

    if (groupIds.length > 0) {
      dataTransfer.set(TREE_VIEW_MIME, new vscode.DataTransferItem([...source]));
    }
  }

  async handleDrop(
    target: TreeElement | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    if (!isValidWorkspace()) {
      return;
    }

    const targetGroupId = this.resolveDropTargetGroupId(target);
    if (!targetGroupId) {
      return;
    }

    const filePayloads = this.readFileDragPayloads(dataTransfer);
    if (filePayloads.length > 0) {
      await this.dropFiles(filePayloads, targetGroupId);
      return;
    }

    const groupIds = this.readGroupDragIds(dataTransfer);
    if (groupIds.length > 0) {
      await this.dropGroups(groupIds, targetGroupId);
    }
  }

  private readFileDragPayloads(dataTransfer: vscode.DataTransfer): FileDragPayload[] {
    const objectTransfer = dataTransfer.get(FILE_DRAG_MIME);
    if (objectTransfer) {
      const fromObject = parseFilePayloads(objectTransfer.value);
      if (fromObject.length > 0) {
        return fromObject;
      }
    }

    const treeTransfer = getTreeTransferItem(dataTransfer);
    if (!treeTransfer) {
      return [];
    }

    const raw = treeTransfer.value;
    const sources = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const payloads: FileDragPayload[] = [];
    for (const item of sources) {
      const payload = getFileDragPayload(item);
      if (payload) {
        payloads.push(payload);
      }
    }
    return payloads;
  }

  private readGroupDragIds(dataTransfer: vscode.DataTransfer): string[] {
    const treeTransfer = getTreeTransferItem(dataTransfer);
    if (!treeTransfer) {
      return [];
    }

    const raw = treeTransfer.value;
    const sources = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return sources
      .map((item) => getGroupId(item))
      .filter((groupId): groupId is string => groupId !== undefined);
  }

  private resolveDropTargetGroupId(target: TreeElement | undefined): string | undefined {
    if (target instanceof GroupTreeItem) {
      return target.group.id;
    }
    if (
      target instanceof FileTreeItem ||
      target instanceof MarkerTypeTreeItem ||
      target instanceof MarkerTreeItem
    ) {
      return target.groupId;
    }
    if (typeof target === 'object' && target !== null) {
      const groupId = getGroupId(target);
      if (groupId) {
        return groupId;
      }
      const filePayload = getFileDragPayload(target);
      if (filePayload) {
        return filePayload.groupId;
      }
    }
    return undefined;
  }

  private async dropGroups(sourceGroupIds: string[], targetGroupId: string): Promise<void> {
    const manager = this.workspace.findManagerByGroupId(targetGroupId);
    if (!manager) {
      return;
    }

    for (const groupId of sourceGroupIds) {
      const sourceManager = this.workspace.findManagerByGroupId(groupId);
      if (!sourceManager || sourceManager !== manager) {
        vscode.window.setStatusBarMessage('不能跨工作区文件夹移动分组', 3000);
        return;
      }
    }

    let moved = 0;
    for (const groupId of sourceGroupIds) {
      const success = await manager.moveGroupToParent(groupId, targetGroupId);
      if (success) {
        moved++;
      }
    }

    if (moved === 0) {
      return;
    }

    this.rememberExpanded(targetGroupId);
    this.refresh();
    const sourceLabel =
      moved === 1
        ? manager.getGroupPathLabel(sourceGroupIds[0])
        : `${moved} 个分组`;
    const targetLabel = manager.getGroupPathLabel(targetGroupId);
    vscode.window.setStatusBarMessage(`已将分组「${sourceLabel}」移动到「${targetLabel}」下`, 3000);
  }

  private async dropFiles(payloads: FileDragPayload[], targetGroupId: string): Promise<void> {
    const manager = this.workspace.findManagerByGroupId(targetGroupId);
    if (!manager) {
      return;
    }

    for (const payload of payloads) {
      const sourceManager = this.workspace.findManagerByGroupId(payload.groupId);
      if (!sourceManager || sourceManager !== manager) {
        vscode.window.setStatusBarMessage('不能跨工作区文件夹移动文件', 3000);
        return;
      }
    }

    const moved = await manager.moveFilesToGroup(
      payloads.map((payload) => ({
        sourceGroupId: payload.groupId,
        filePath: payload.path,
      })),
      targetGroupId,
    );

    if (moved === 0) {
      vscode.window.setStatusBarMessage('文件已在目标分组中，或未发生移动', 3000);
      return;
    }

    this.refresh();
    const targetLabel = manager.getGroupPathLabel(targetGroupId);
    vscode.window.setStatusBarMessage(`已将 ${moved} 个文件移动到「${targetLabel}」`, 3000);
  }

  getParent(element: TreeElement): TreeElement | undefined {
    if (element instanceof WorkspaceFolderTreeItem) {
      return undefined;
    }

    if (element instanceof MarkerTreeItem) {
      const manager = this.workspace.findManagerByGroupId(element.groupId);
      const entry = manager?.getFileEntry(element.groupId, element.relativePath);
      if (!entry) {
        return undefined;
      }
      const group = (entry.markers ?? []).find((item) => item.type === element.marker.type);
      const count = group?.content.length ?? 0;
      if (count === 0) {
        return new FileTreeItem(element.folder, element.groupId, entry, true);
      }
      return new MarkerTypeTreeItem(
        element.folder,
        element.groupId,
        element.relativePath,
        element.marker.type,
        count,
      );
    }

    if (element instanceof MarkerTypeTreeItem) {
      const manager = this.workspace.findManagerByGroupId(element.groupId);
      const entry = manager?.getFileEntry(element.groupId, element.relativePath);
      if (!entry) {
        return undefined;
      }
      return new FileTreeItem(element.folder, element.groupId, entry, true);
    }

    if (element instanceof FileTreeItem) {
      return this.getGroupTreeItem(element.groupId);
    }

    const manager = this.workspace.findManagerByGroupId(element.group.id);
    const parentId = manager?.getParentGroupId(element.group.id);
    if (parentId) {
      return this.getGroupTreeItem(parentId);
    }
    if (isMultiRootWorkspace()) {
      return new WorkspaceFolderTreeItem(element.folder);
    }
    return undefined;
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeElement): Promise<TreeElement[]> {
    const index = this.getSearchIndex();

    if (!element) {
      const managers = this.workspace.getManagers();
      if (managers.length === 0) {
        return [];
      }
      if (managers.length === 1) {
        return this.rootGroupItems(managers[0], index);
      }
      return managers.map((manager) => new WorkspaceFolderTreeItem(manager.folder));
    }

    if (element instanceof WorkspaceFolderTreeItem) {
      const manager = this.workspace.getManager(element.folder);
      if (!manager) {
        return [];
      }
      return this.rootGroupItems(manager, index);
    }

    if (element instanceof GroupTreeItem) {
      const manager = this.workspace.findManagerByGroupId(element.group.id);
      if (!manager) {
        return [];
      }
      const childGroups = manager
        .getChildGroups(element.group.id)
        .filter((group) => !index || index.groupIds.has(group.id))
        .map((group) => this.createGroupTreeItem(manager, group, index));
      const files = element.group.files.filter((fileEntry) => {
        if (!index) {
          return true;
        }
        return index.fileKeys.has(buildFileSearchKey(element.group.id, fileEntry.path));
      });
      const fileItems = await Promise.all(
        files.map(async (fileEntry) => {
          const exists = await fileExistenceCache.exists(element.folder, fileEntry.path);
          return new FileTreeItem(element.folder, element.group.id, fileEntry, exists);
        }),
      );

      return [...childGroups, ...fileItems];
    }

    if (element instanceof FileTreeItem) {
      const types = listPresentMarkerTypes(element.fileEntry).filter(({ type }) => {
        if (!index) {
          return true;
        }
        if (index.filesWithAllMarkers.has(buildFileSearchKey(element.groupId, element.relativePath))) {
          return true;
        }
        return index.markerTypeKeys.has(
          buildMarkerTypeSearchKey(element.groupId, element.relativePath, type),
        );
      });
      return types.map(
        ({ type, count }) =>
          new MarkerTypeTreeItem(
            element.folder,
            element.groupId,
            element.relativePath,
            type,
            count,
          ),
      );
    }

    if (element instanceof MarkerTypeTreeItem) {
      const manager = this.workspace.findManagerByGroupId(element.groupId);
      const entry = manager?.getFileEntry(element.groupId, element.relativePath);
      const group = (entry?.markers ?? []).find((item) => item.type === element.markerType);
      if (!group) {
        return [];
      }
      const showAll =
        !index ||
        index.filesWithAllMarkers.has(buildFileSearchKey(element.groupId, element.relativePath));
      return group.content
        .map((item, contentIndex) => ({ item, contentIndex }))
        .filter(({ contentIndex }) => {
          if (showAll) {
            return true;
          }
          return index!.markerKeys.has(
            buildMarkerSearchKey(
              element.groupId,
              element.relativePath,
              element.markerType,
              contentIndex,
            ),
          );
        })
        .map(
          ({ item, contentIndex }) =>
            new MarkerTreeItem(element.folder, element.groupId, element.relativePath, {
              type: element.markerType,
              contentIndex,
              item,
            }),
        );
    }

    return [];
  }

  getGroupTreeItem(groupId: string): GroupTreeItem | undefined {
    const manager = this.workspace.findManagerByGroupId(groupId);
    const group = manager?.getGroup(groupId);
    if (!manager || !group) {
      return undefined;
    }
    return this.createGroupTreeItem(manager, group, this.getSearchIndex());
  }

  private rootGroupItems(
    manager: TabGroupsManager,
    index?: TreeSearchIndex,
  ): GroupTreeItem[] {
    return manager
      .getRootGroups()
      .filter((group) => !index || index.groupIds.has(group.id))
      .map((group) => this.createGroupTreeItem(manager, group, index));
  }

  private getSearchIndex(): TreeSearchIndex | undefined {
    if (!this.searchFilter) {
      return undefined;
    }
    const allGroups = this.workspace.getManagers().flatMap((manager) => manager.getGroups());
    return buildTreeSearchIndex(allGroups, this.searchFilter);
  }

  private createGroupTreeItem(
    manager: TabGroupsManager,
    group: Group,
    index?: TreeSearchIndex,
  ): GroupTreeItem {
    const suffix = manager.getGroupLabelSuffix(group);
    const isRegex = manager.isRegexGroup(group);
    const hasChildren = index
      ? manager.getChildGroups(group.id).some((child) => index.groupIds.has(child.id)) ||
        group.files.some((file) => index.fileKeys.has(buildFileSearchKey(group.id, file.path)))
      : group.children.length > 0 || group.files.length > 0;
    const item = new GroupTreeItem(manager.folder, group, suffix, isRegex, hasChildren);

    const shouldExpand =
      (index?.expandGroupIds.has(group.id) ?? false) || this.expandedGroupIds.has(group.id);
    if (shouldExpand && hasChildren) {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
    return item;
  }

  private async serializeSidebarNode(element: TreeElement): Promise<SidebarTreeNode> {
    const item = this.getTreeItem(element);
    const id = String(item.id ?? '');
    this.sidebarElements.set(id, element);

    const collapsible = item.collapsibleState !== vscode.TreeItemCollapsibleState.None;
    const expanded =
      item.collapsibleState === vscode.TreeItemCollapsibleState.Expanded ||
      this.expandedNodeIds.has(id);
    const label = typeof item.label === 'string' ? item.label : item.label?.label ?? '';
    const description = typeof item.description === 'string' ? item.description : undefined;
    const tooltip = typeof item.tooltip === 'string' ? item.tooltip : undefined;

    const node: SidebarTreeNode = {
      id,
      kind: sidebarKind(element),
      label,
      description,
      tooltip,
      contextValue: item.contextValue ?? '',
      collapsible,
      expanded: collapsible && expanded,
      missing: element instanceof FileTreeItem && element.contextValue === 'missingFile',
      groupId: sidebarGroupId(element),
      filePath: sidebarFilePath(element),
      folderUri: sidebarFolderUri(element),
      iconId: sidebarIconId(element, collapsible && expanded),
      icon: sidebarGroupIcon(element, collapsible && expanded),
    };

    if (node.expanded) {
      const children = await this.getChildren(element);
      node.children = await Promise.all(children.map((child) => this.serializeSidebarNode(child)));
    }

    return node;
  }
}

function sidebarKind(element: TreeElement): SidebarTreeNode['kind'] {
  if (element instanceof WorkspaceFolderTreeItem) {
    return 'workspaceFolder';
  }
  if (element instanceof GroupTreeItem) {
    return 'group';
  }
  if (element instanceof FileTreeItem) {
    return 'file';
  }
  if (element instanceof MarkerTypeTreeItem) {
    return 'markerType';
  }
  return 'marker';
}

function sidebarGroupId(element: TreeElement): string | undefined {
  if (element instanceof GroupTreeItem) {
    return element.group.id;
  }
  if (
    element instanceof FileTreeItem ||
    element instanceof MarkerTypeTreeItem ||
    element instanceof MarkerTreeItem
  ) {
    return element.groupId;
  }
  return undefined;
}

function sidebarFilePath(element: TreeElement): string | undefined {
  if (element instanceof FileTreeItem) {
    return element.relativePath;
  }
  if (element instanceof MarkerTypeTreeItem || element instanceof MarkerTreeItem) {
    return element.relativePath;
  }
  return undefined;
}

function sidebarFolderUri(element: TreeElement): string | undefined {
  if (element instanceof WorkspaceFolderTreeItem) {
    return element.folder.uri.toString();
  }
  if (
    element instanceof GroupTreeItem ||
    element instanceof FileTreeItem ||
    element instanceof MarkerTypeTreeItem ||
    element instanceof MarkerTreeItem
  ) {
    return element.folder.uri.toString();
  }
  return undefined;
}

function sidebarIconId(element: TreeElement, expanded: boolean): string {
  if (element instanceof WorkspaceFolderTreeItem) {
    return expanded ? 'root-folder-opened' : 'root-folder';
  }
  if (element instanceof GroupTreeItem) {
    return resolveGroupIconId(element.group.icon, expanded);
  }
  if (element instanceof FileTreeItem) {
    return 'file';
  }
  if (element instanceof MarkerTypeTreeItem) {
    return markerTypeIcon(element.markerType);
  }
  if (element instanceof MarkerTreeItem) {
    return markerTypeIcon(element.markerType);
  }
  return 'file';
}

function sidebarGroupIcon(element: TreeElement, expanded: boolean): SidebarIcon | undefined {
  if (!(element instanceof GroupTreeItem)) {
    return undefined;
  }
  const id = resolveGroupIconId(element.group.icon, expanded);
  const color = groupColorHex(element.group.color);
  return color ? { kind: 'codicon', id, color } : { kind: 'codicon', id };
}

export function buildFileTreeItemId(groupId: string, relativePath: string): string {
  return `file:${groupId}::${relativePath}`;
}

export function buildMarkerTypeTreeItemId(
  groupId: string,
  relativePath: string,
  type: FileMarkerType,
): string {
  return `markerType:${groupId}::${relativePath}::${type}`;
}

export function buildMarkerTreeItemId(
  groupId: string,
  relativePath: string,
  type: FileMarkerType,
  contentIndex: number,
): string {
  return `marker:${groupId}::${relativePath}::${type}::${contentIndex}`;
}

function listPresentMarkerTypes(
  entry: GroupFileEntry,
): Array<{ type: FileMarkerType; count: number }> {
  const byType = new Map<FileMarkerType, number>();
  for (const group of entry.markers ?? []) {
    if (group.content.length > 0) {
      byType.set(group.type, group.content.length);
    }
  }
  return MARKER_TYPE_ORDER.filter((type) => byType.has(type)).map((type) => ({
    type,
    count: byType.get(type)!,
  }));
}

/** @deprecated */
export const buildCursorTreeItemId = buildMarkerTreeItemId;

function getTreeTransferItem(dataTransfer: vscode.DataTransfer): vscode.DataTransferItem | undefined {
  const direct = dataTransfer.get(TREE_VIEW_MIME);
  if (direct) {
    return direct;
  }

  let fallback: vscode.DataTransferItem | undefined;
  dataTransfer.forEach((item, mime) => {
    if (mime.startsWith('application/vnd.code.tree.')) {
      fallback = item;
    }
  });
  return fallback;
}

function getGroupId(item: unknown): string | undefined {
  if (item instanceof GroupTreeItem) {
    return item.group.id;
  }

  if (typeof item === 'object' && item !== null && 'group' in item) {
    const group = (item as { group?: { id?: unknown } }).group;
    if (group && typeof group.id === 'string') {
      return group.id;
    }
  }

  if (typeof item === 'object' && item !== null && 'id' in item) {
    const id = (item as { id?: unknown }).id;
    if (typeof id === 'string' && id.startsWith('group:')) {
      return id.slice('group:'.length);
    }
  }

  return undefined;
}

function getFileDragPayload(item: unknown): FileDragPayload | undefined {
  if (item instanceof MarkerTreeItem || item instanceof MarkerTypeTreeItem) {
    return undefined;
  }

  if (item instanceof FileTreeItem) {
    return { groupId: item.groupId, path: item.relativePath };
  }

  if (typeof item === 'object' && item !== null) {
    const candidate = item as {
      groupId?: unknown;
      relativePath?: unknown;
      fileEntry?: { path?: unknown };
      id?: unknown;
    };

    if (
      typeof candidate.id === 'string' &&
      (candidate.id.startsWith('marker:') ||
        candidate.id.startsWith('markerType:') ||
        candidate.id.startsWith('cursor:'))
    ) {
      return undefined;
    }

    const groupId = candidate.groupId;
    const path = candidate.relativePath ?? candidate.fileEntry?.path;
    if (typeof groupId === 'string' && typeof path === 'string') {
      return { groupId, path };
    }

    if (typeof candidate.id === 'string') {
      return parseFileTreeItemId(candidate.id);
    }
  }

  return undefined;
}

function parseFileTreeItemId(id: string): FileDragPayload | undefined {
  if (!id.startsWith('file:')) {
    return undefined;
  }

  const body = id.slice('file:'.length);
  const separatorIndex = body.indexOf('::');
  if (separatorIndex > 0) {
    return {
      groupId: body.slice(0, separatorIndex),
      path: body.slice(separatorIndex + 2),
    };
  }

  if (body.length >= 38 && body[36] === ':') {
    return {
      groupId: body.slice(0, 36),
      path: body.slice(37),
    };
  }

  return undefined;
}

function parseFilePayloads(value: unknown): FileDragPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (payload): payload is FileDragPayload =>
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as FileDragPayload).groupId === 'string' &&
      typeof (payload as FileDragPayload).path === 'string',
  );
}
