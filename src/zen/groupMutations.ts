import type { PlatformTab, PlatformTabGroup } from "../platform";
import { missingCapability, type ZenAdapter, type ZenAdapterResult } from "./adapter";

export type ZenGroupMutation = {
  readonly label: string;
  readonly color?: string;
  readonly tabIds: readonly string[];
};

export type ApplyGroupMutationsResult = {
  readonly createdGroupIds: readonly string[];
  readonly movedTabIds: readonly string[];
  readonly missingTabIds: readonly string[];
};

export type RemoveEmptyGroupsResult = {
  readonly removedGroupIds: readonly string[];
};

export const applyGroupMutations = (
  adapter: ZenAdapter,
  mutations: readonly ZenGroupMutation[],
): ZenAdapterResult<ApplyGroupMutationsResult> => {
  const createdGroupIds: string[] = [];
  const movedTabIds: string[] = [];
  const missingTabIds: string[] = [];

  for (const mutation of mutations) {
    const group = adapter.createGroup(mutation.label, mutation.color);
    adapter.activeWorkspaceStrip.appendChild(group);
    createdGroupIds.push(group.id);

    const tabs = mutation.tabIds.flatMap((tabId) => {
      const tab = adapter.tabs.find((candidate) => candidate.id === tabId);
      if (tab === undefined) {
        missingTabIds.push(tabId);
        return [];
      }
      return [tab];
    });

    const moveResult = moveTabs(adapter, group, tabs);
    if (!moveResult.ok) {
      return moveResult;
    }
    movedTabIds.push(...moveResult.value);
  }

  return { ok: true, value: { createdGroupIds, movedTabIds, missingTabIds } };
};

export const removeEmptyGroups = (adapter: ZenAdapter): ZenAdapterResult<RemoveEmptyGroupsResult> => {
  const removedGroupIds: string[] = [];
  for (const group of adapter.tabGroups) {
    if (group.tabs.length > 0) {
      continue;
    }
    adapter.removeTabGroup(group);
    removedGroupIds.push(group.id);
  }
  return { ok: true, value: { removedGroupIds } };
};

const moveTabs = (
  adapter: ZenAdapter,
  group: PlatformTabGroup,
  tabs: readonly PlatformTab[],
): ZenAdapterResult<readonly string[]> => {
  if (tabs.length === 0) {
    return { ok: true, value: [] };
  }
  if (typeof group.addTabs === "function") {
    group.addTabs(tabs);
    return { ok: true, value: tabs.map((tab) => tab.id) };
  }
  if (typeof adapter.moveTabToGroup !== "function") {
    return missingCapability("group.addTabs");
  }
  const moveTabToGroup = adapter.moveTabToGroup;
  tabs.forEach((tab) => moveTabToGroup(tab, group));
  return { ok: true, value: tabs.map((tab) => tab.id) };
};
