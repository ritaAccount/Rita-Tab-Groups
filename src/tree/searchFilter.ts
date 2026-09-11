import { defaultAliasFromPath, flattenMarkers } from '../data/fileEntryUtils';
import { Group, SearchMode } from '../data/types';
import { getChildGroups, getRootGroups } from '../data/groupHierarchyUtils';
import {
  isFilePathAllowed,
  parseFolderList,
} from '../settings/searchSettingsUtils';

export interface TreeSearchFilter {
  query: string;
  mode: SearchMode;
  include: string;
  exclude: string;
}

export interface TreeSearchIndex {
  groupIds: Set<string>;
  fileKeys: Set<string>;
  filesWithAllMarkers: Set<string>;
  markerTypeKeys: Set<string>;
  markerKeys: Set<string>;
  expandGroupIds: Set<string>;
  matchCount: number;
}

export function isSearchFilterActive(filter: TreeSearchFilter): boolean {
  return filter.query.trim().length > 0;
}

export function buildFileSearchKey(groupId: string, relativePath: string): string {
  return `${groupId}::${relativePath}`;
}

export function buildMarkerTypeSearchKey(
  groupId: string,
  relativePath: string,
  type: string,
): string {
  return `${groupId}::${relativePath}::${type}`;
}

export function buildMarkerSearchKey(
  groupId: string,
  relativePath: string,
  type: string,
  contentIndex: number,
): string {
  return `${groupId}::${relativePath}::${type}::${contentIndex}`;
}

export function matchNodeName(name: string, query: string, mode: SearchMode): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const haystack = name.toLowerCase();
  if (mode === 'exact') {
    return haystack.includes(needle);
  }
  return fuzzyMatch(haystack, needle);
}

export function buildTreeSearchIndex(
  groups: Group[],
  filter: TreeSearchFilter,
): TreeSearchIndex | undefined {
  if (!isSearchFilterActive(filter)) {
    return undefined;
  }

  const query = filter.query.trim();
  const include = parseFolderList(filter.include);
  const exclude = parseFolderList(filter.exclude);
  const index: TreeSearchIndex = {
    groupIds: new Set(),
    fileKeys: new Set(),
    filesWithAllMarkers: new Set(),
    markerTypeKeys: new Set(),
    markerKeys: new Set(),
    expandGroupIds: new Set(),
    matchCount: 0,
  };

  const walk = (group: Group): boolean => {
    const nameHit = matchNodeName(group.name, query, filter.mode);
    let descendantHit = false;

    for (const child of getChildGroups(groups, group)) {
      if (walk(child)) {
        descendantHit = true;
      }
    }

    if (nameHit) {
      markGroupSubtreeVisible(groups, group, include, exclude, index);
      index.matchCount += 1;
      return true;
    }

    for (const file of group.files) {
      if (!isFilePathAllowed(file.path, include, exclude)) {
        continue;
      }

      const fileKey = buildFileSearchKey(group.id, file.path);
      const fileNameHit =
        matchNodeName(file.alias, query, filter.mode) ||
        matchNodeName(defaultAliasFromPath(file.path), query, filter.mode);

      if (fileNameHit) {
        index.fileKeys.add(fileKey);
        index.filesWithAllMarkers.add(fileKey);
        index.matchCount += 1;
        descendantHit = true;
      }

      for (const marker of flattenMarkers(file.markers)) {
        const markerNameHit =
          matchNodeName(marker.item.label, query, filter.mode) ||
          (marker.item.symbolName
            ? matchNodeName(marker.item.symbolName, query, filter.mode)
            : false);
        if (!markerNameHit) {
          continue;
        }
        index.fileKeys.add(fileKey);
        index.markerTypeKeys.add(buildMarkerTypeSearchKey(group.id, file.path, marker.type));
        index.markerKeys.add(
          buildMarkerSearchKey(group.id, file.path, marker.type, marker.contentIndex),
        );
        index.matchCount += 1;
        descendantHit = true;
      }
    }

    if (descendantHit) {
      index.groupIds.add(group.id);
      index.expandGroupIds.add(group.id);
    }
    return descendantHit;
  };

  for (const root of getRootGroups(groups)) {
    walk(root);
  }

  return index;
}

function markGroupSubtreeVisible(
  groups: Group[],
  group: Group,
  include: string[],
  exclude: string[],
  index: TreeSearchIndex,
): void {
  index.groupIds.add(group.id);
  const childGroups = getChildGroups(groups, group);
  const allowedFiles = group.files.filter((file) => isFilePathAllowed(file.path, include, exclude));
  if (childGroups.length > 0 || allowedFiles.length > 0) {
    index.expandGroupIds.add(group.id);
  }

  for (const file of allowedFiles) {
    const fileKey = buildFileSearchKey(group.id, file.path);
    index.fileKeys.add(fileKey);
    index.filesWithAllMarkers.add(fileKey);
  }

  for (const child of childGroups) {
    markGroupSubtreeVisible(groups, child, include, exclude, index);
  }
}

function fuzzyMatch(text: string, query: string): boolean {
  let index = 0;
  for (const char of text) {
    if (char === query[index]) {
      index += 1;
      if (index === query.length) {
        return true;
      }
    }
  }
  return false;
}
