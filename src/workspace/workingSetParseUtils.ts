/** 解析 `git status --porcelain` 输出为相对路径列表（rename 取新路径） */
export function parseGitStatusPorcelain(stdout: string): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    if (!line || line.length < 4) {
      continue;
    }
    const pathPart = line.slice(3);
    const arrow = pathPart.indexOf(' -> ');
    const candidate = arrow >= 0 ? pathPart.slice(arrow + 4) : pathPart;
    const trimmed = stripGitPathQuotes(candidate.trim());
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    paths.push(trimmed);
  }

  return paths;
}

function stripGitPathQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return value;
}

/** 默认分组名：打开的标签 + 本地日期时间 */
export function defaultOpenEditorsGroupName(now = new Date()): string {
  return `打开的标签 ${formatShortDateTime(now)}`;
}

/** 默认分组名：Git 变更 + 分支（无分支则用时间） */
export function defaultGitChangesGroupName(
  branch: string | undefined,
  now = new Date(),
): string {
  if (branch?.trim()) {
    return `Git 变更 ${branch.trim()}`;
  }
  return `Git 变更 ${formatShortDateTime(now)}`;
}

function formatShortDateTime(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${min}`;
}
