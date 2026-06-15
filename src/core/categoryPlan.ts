import type { CategoryAssignment } from "./responseParser";
import type { PromptTab } from "./types";

export type CategoryPlanGroup = {
  readonly name: string;
  readonly tabIds: readonly string[];
  readonly source: "ai" | "domain";
};

export type CategoryPlan = {
  readonly groups: readonly CategoryPlanGroup[];
};

export type CategoryPlanOptions = {
  readonly minGroupSize?: number;
  readonly maxGroupSize?: number;
};

type WorkingGroup = {
  readonly name: string;
  readonly tabIds: readonly string[];
  readonly source: "ai" | "domain";
};

const DEFAULT_MIN_GROUP_SIZE = 2;
const DEFAULT_MAX_GROUP_SIZE = 12;

export const createCategoryPlan = (
  tabs: readonly PromptTab[],
  assignments: readonly CategoryAssignment[],
  options: CategoryPlanOptions = {},
): CategoryPlan => {
  const minGroupSize = positiveIntegerOrDefault(options.minGroupSize, DEFAULT_MIN_GROUP_SIZE);
  const maxGroupSize = positiveIntegerOrDefault(options.maxGroupSize, DEFAULT_MAX_GROUP_SIZE);
  const tabOrder = new Map(tabs.map((tab, index) => [tab.id, index]));
  const aiChunks = collectAiGroups(assignments, tabOrder).flatMap((group) => splitGroup(group, maxGroupSize));
  const acceptedAiChunks = aiChunks.filter((group) => group.tabIds.length >= minGroupSize);
  const groupedTabIds = new Set(acceptedAiChunks.flatMap((group) => group.tabIds));
  const fallbackTabs = tabs.filter((tab) => !groupedTabIds.has(tab.id));
  const fallbackGroups = collectDomainGroups(fallbackTabs);
  const fallbackChunks = fallbackGroups.flatMap((group) => splitGroup(group, maxGroupSize));

  return {
    groups: [...acceptedAiChunks, ...fallbackChunks].filter((group) => group.tabIds.length >= minGroupSize),
  };
};

const collectAiGroups = (
  assignments: readonly CategoryAssignment[],
  tabOrder: ReadonlyMap<string, number>,
): readonly WorkingGroup[] => {
  const assignedTabIds = new Set<string>();
  const groups = new Map<string, WorkingGroup>();

  for (const assignment of assignments) {
    if (assignedTabIds.has(assignment.tabId) || !tabOrder.has(assignment.tabId)) {
      continue;
    }
    const key = normalizeCategoryKey(assignment.category);
    if (key === null) {
      continue;
    }
    const existingGroup = groups.get(key);
    const nextTabIds = existingGroup === undefined ? [assignment.tabId] : [...existingGroup.tabIds, assignment.tabId];
    groups.set(key, { name: existingGroup?.name ?? assignment.category.trim(), tabIds: nextTabIds, source: "ai" });
    assignedTabIds.add(assignment.tabId);
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    tabIds: sortTabIds(group.tabIds, tabOrder),
  }));
};

const collectDomainGroups = (tabs: readonly PromptTab[]): readonly WorkingGroup[] => {
  const groups = new Map<string, readonly string[]>();

  for (const tab of tabs) {
    const name = tab.domain ?? "unknown domain";
    const existingTabIds = groups.get(name) ?? [];
    groups.set(name, [...existingTabIds, tab.id]);
  }

  return Array.from(groups.entries())
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .map(([name, tabIds]) => ({ name, tabIds, source: "domain" }));
};

const splitGroup = (group: WorkingGroup, maxGroupSize: number): readonly CategoryPlanGroup[] => {
  if (group.tabIds.length <= maxGroupSize) {
    return [group];
  }

  const chunks: CategoryPlanGroup[] = [];
  for (let start = 0; start < group.tabIds.length; start += maxGroupSize) {
    const suffix = chunks.length + 1;
    chunks.push({
      name: `${group.name} ${suffix}`,
      tabIds: group.tabIds.slice(start, start + maxGroupSize),
      source: group.source,
    });
  }
  return chunks;
};

const sortTabIds = (tabIds: readonly string[], tabOrder: ReadonlyMap<string, number>): readonly string[] => {
  return [...tabIds].sort((left, right) => orderFor(left, tabOrder) - orderFor(right, tabOrder));
};

const orderFor = (tabId: string, tabOrder: ReadonlyMap<string, number>): number => {
  return tabOrder.get(tabId) ?? Number.MAX_SAFE_INTEGER;
};

const normalizeCategoryKey = (category: string): string | null => {
  const key = category.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
  return key.length > 0 ? key : null;
};

const positiveIntegerOrDefault = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return fallback;
  }
  return value;
};
