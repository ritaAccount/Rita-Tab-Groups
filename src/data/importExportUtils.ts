import { randomUUID } from 'node:crypto';
import {
  collectDescendantIds,
  findParentGroupId,
  normalizeGroupHierarchy,
  updateGroupLevels,
} from './groupHierarchyUtils';
import { CONFIG_VERSION, normalizeGroupFiles } from './fileEntryUtils';
import { GlobalConfig, Group, TabGroupsData } from './types';

/** 导出 / 导入用的数据包（与工作区 tab-groups.json 同构） */
export type TabGroupsPackage = TabGroupsData;

export interface MergeImportResult {
  data: TabGroupsData;
  groupsAdded: number;
  configsAdded: number;
}

/**
 * 从当前数据打包导出内容。
 * `selectedGroupIds` 为空或未传 → 全部；否则导出所选分组及其后代，并带上被引用的全局 configs。
 * 父未入选时，被选中的分组在包内升为根级。
 */
export function buildExportPackage(
  groups: Group[],
  configs: GlobalConfig[],
  selectedGroupIds?: string[],
): TabGroupsPackage {
  if (!selectedGroupIds || selectedGroupIds.length === 0) {
    return {
      version: CONFIG_VERSION,
      groups: cloneGroups(groups),
      configs: cloneConfigs(configs),
    };
  }

  const exportIdSet = new Set<string>();
  for (const id of selectedGroupIds) {
    if (!groups.some((g) => g.id === id)) {
      continue;
    }
    for (const descendantId of collectDescendantIds(groups, id)) {
      exportIdSet.add(descendantId);
    }
  }

  if (exportIdSet.size === 0) {
    return { version: CONFIG_VERSION, groups: [], configs: [] };
  }

  const exported = groups
    .filter((g) => exportIdSet.has(g.id))
    .map((g) => {
      const clone = cloneGroup(g);
      clone.children = clone.children.filter((childId) => exportIdSet.has(childId));
      return clone;
    });

  // 父不在导出集内 → 该节点在包内视为根
  for (const group of exported) {
    const parentId = findParentGroupId(groups, group.id);
    if (!parentId || !exportIdSet.has(parentId)) {
      group.level = 0;
    }
  }

  for (const group of exported) {
    if (group.level === 0) {
      updateGroupLevels(exported, group.id, 0);
    }
  }

  const referencedConfigIds = new Set(
    exported
      .map((g) => g.configId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  return {
    version: CONFIG_VERSION,
    groups: exported,
    configs: configs.filter((c) => referencedConfigIds.has(c.id)).map(cloneConfig),
  };
}

/** 解析外部 JSON；结构不合法时抛错 */
export function parseImportPackage(raw: unknown): TabGroupsPackage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('INVALID_PACKAGE');
  }
  const parsed = raw as Partial<TabGroupsData>;
  const rawGroups = Array.isArray(parsed.groups) ? parsed.groups : [];
  const groups = rawGroups.map((entry) => {
    const normalized = normalizeGroupHierarchy(entry as Partial<Group>);
    normalized.files = normalizeGroupFiles((entry as Partial<Group>).files);
    return normalized;
  });
  const configs = Array.isArray(parsed.configs)
    ? parsed.configs.filter(
        (c): c is GlobalConfig =>
          !!c &&
          typeof c === 'object' &&
          typeof (c as GlobalConfig).id === 'string' &&
          ((c as GlobalConfig).type === 'manual' || (c as GlobalConfig).type === 'regex'),
      )
    : [];

  return {
    version: typeof parsed.version === 'string' ? parsed.version : CONFIG_VERSION,
    groups,
    configs,
  };
}

/**
 * 合并导入：为所有分组与 configs 分配新 id，挂到现有数据的根级旁；
 * 保留内嵌 config；引用类 configId 映射到新 configs。
 */
export function mergeImportPackage(
  current: TabGroupsData,
  incoming: TabGroupsPackage,
): MergeImportResult {
  const groupIdMap = new Map<string, string>();
  const configIdMap = new Map<string, string>();

  for (const group of incoming.groups) {
    groupIdMap.set(group.id, randomUUID());
  }

  const configsAdded: GlobalConfig[] = [];
  for (const config of incoming.configs) {
    const newId = randomUUID();
    configIdMap.set(config.id, newId);
    configsAdded.push({
      ...cloneConfig(config),
      id: newId,
    });
  }

  const reverseGroupIdMap = new Map<string, string>();
  for (const [oldId, newId] of groupIdMap) {
    reverseGroupIdMap.set(newId, oldId);
  }

  const groupsAdded: Group[] = incoming.groups.map((group) => {
    const newId = groupIdMap.get(group.id)!;
    const remappedConfigId = group.configId ? configIdMap.get(group.configId) : undefined;
    const remapped: Group = {
      ...cloneGroup(group),
      id: newId,
      children: group.children
        .map((childId) => groupIdMap.get(childId))
        .filter((id): id is string => typeof id === 'string'),
    };
    if (remappedConfigId) {
      remapped.configId = remappedConfigId;
    } else {
      delete remapped.configId;
    }
    return remapped;
  });

  for (const group of groupsAdded) {
    const oldId = reverseGroupIdMap.get(group.id);
    if (!oldId) {
      continue;
    }
    const oldParent = findParentGroupId(incoming.groups, oldId);
    if (!oldParent) {
      group.level = 0;
    }
  }

  for (const group of groupsAdded) {
    if (group.level === 0) {
      updateGroupLevels(groupsAdded, group.id, 0);
    }
  }

  return {
    data: {
      version: CONFIG_VERSION,
      groups: [...current.groups, ...groupsAdded],
      configs: [...current.configs, ...configsAdded],
    },
    groupsAdded: groupsAdded.length,
    configsAdded: configsAdded.length,
  };
}

export function replaceImportPackage(incoming: TabGroupsPackage): TabGroupsData {
  const groups = cloneGroups(incoming.groups);
  const roots = groups.filter((g) => {
    const parent = findParentGroupId(groups, g.id);
    return !parent;
  });
  for (const root of roots) {
    updateGroupLevels(groups, root.id, 0);
  }

  return {
    version: CONFIG_VERSION,
    groups,
    configs: cloneConfigs(incoming.configs),
  };
}

function cloneGroups(groups: Group[]): Group[] {
  return groups.map(cloneGroup);
}

function cloneGroup(group: Group): Group {
  return {
    id: group.id,
    name: group.name,
    level: group.level,
    children: [...group.children],
    files: group.files.map((file) => ({
      path: file.path,
      alias: file.alias,
      ...(file.branch ? { branch: file.branch } : {}),
      ...(file.markers
        ? {
            markers: file.markers.map((mg) => ({
              type: mg.type,
              content: mg.content.map((item) => ({ ...item })),
            })),
          }
        : {}),
    })),
    ...(group.config ? { config: { ...group.config } } : {}),
    ...(group.configId ? { configId: group.configId } : {}),
  };
}

function cloneConfigs(configs: GlobalConfig[]): GlobalConfig[] {
  return configs.map(cloneConfig);
}

function cloneConfig(config: GlobalConfig): GlobalConfig {
  if (config.type === 'regex') {
    return {
      id: config.id,
      type: 'regex',
      regex: config.regex,
      ...(config.description ? { description: config.description } : {}),
    };
  }
  return {
    id: config.id,
    type: 'manual',
    ...(config.description ? { description: config.description } : {}),
  };
}
