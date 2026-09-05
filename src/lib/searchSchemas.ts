/**
 * 路由 search 参数的 validateSearch schema（TanStack Router）。
 *
 * 默认 parseSearch 会对参数值做 JSON.parse，所以 `?new=1` 读到的是 number 1、
 * `?skill=true` 读到的是 boolean true。schema 在这里把值归一化回旧版
 * react-router URLSearchParams 的字符串语义，保持既有书签/跳转 URL 逐字兼容。
 */

/** `?skill=` 选中技能（/ 与 /library 共用）。 */
export interface SkillPickerSearch {
  skill?: string;
}

/** 归一化为旧 URLSearchParams.get() 的字符串语义；无法归一化的值丢弃。 */
const stringParam = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
};

export function validateSkillPickerSearch(search: Record<string, unknown>): SkillPickerSearch {
  return { skill: stringParam(search.skill) };
}

export type InstallTab = "market" | "local" | "git";

/** /install：`tab` 只接受三种合法值，`project` 为安装后同时链接的项目 id。 */
export interface InstallSearch {
  tab?: InstallTab;
  project?: string;
}

export function validateInstallSearch(search: Record<string, unknown>): InstallSearch {
  const tab = search.tab;
  return {
    tab: tab === "market" || tab === "local" || tab === "git" ? tab : undefined,
    project: stringParam(search.project),
  };
}

/** /projects 与 /project/$id：`?new=1` 打开新建/添加向导（一次性 flag）。 */
export interface NewFlagSearch {
  new?: number;
}

export function validateNewFlagSearch(search: Record<string, unknown>): NewFlagSearch {
  return { new: typeof search.new === "number" ? search.new : undefined };
}
