import type { GroupPlanOperation } from "../core/groupPlanner";
import { planUndo, type UndoGroupState, type UndoSnapshot, type UndoTabState } from "../core/undo";
import type { PlatformTab } from "../platform";
import { resolveZenAdapter, type ZenAdapter } from "../zen/adapter";
import type { ZenGroupMutation } from "../zen/groupMutations";
import type { UndoResult } from "./orchestrator";

export const toZenMutations = (operations: readonly GroupPlanOperation[]): readonly ZenGroupMutation[] => {
  const groups = new Map<string, { readonly label: string; readonly tabIds: string[] }>();
  for (const operation of operations) {
    if (operation.kind === "createGroup") {
      groups.set(operation.groupId, { label: operation.title, tabIds: [] });
      continue;
    }
    groups.get(operation.groupId)?.tabIds.push(operation.tabId);
  }
  return Array.from(groups.values()).map((group) => ({ label: group.label, tabIds: group.tabIds }));
};

export const runUndo = (runtime: unknown, snapshot: UndoSnapshot): UndoResult => {
  const adapterResult = resolveZenAdapter(runtime);
  if (!adapterResult.ok) {
    return { status: "adapter_failed", missingApi: adapterResult.error.missingApi };
  }
  const plan = planUndo(snapshot, snapshotInput(adapterResult.value));
  for (const operation of plan.operations) {
    if (operation.kind === "removeEmptyGeneratedGroup") {
      const group = adapterResult.value.tabGroups.find((candidate) => candidate.id === operation.groupId);
      if (group !== undefined) {
        adapterResult.value.removeTabGroup(group);
      }
      continue;
    }
    const tab = adapterResult.value.tabs.find((candidate) => candidate.id === operation.tabId);
    if (tab === undefined) {
      continue;
    }
    if (operation.groupId === null) {
      adapterResult.value.ungroupTab(tab);
    } else {
      const group = adapterResult.value.tabGroups.find((candidate) => candidate.id === operation.groupId);
      if (group !== undefined) {
        adapterResult.value.moveTabToGroup?.(tab, group);
      }
    }
  }
  return {
    status: "undone",
    restoredTabIds: plan.outcomes.flatMap((outcome) => (outcome.kind === "restored" ? [outcome.tabId] : [])),
  };
};

export const snapshotInput = (adapter: ZenAdapter): { readonly tabs: readonly UndoTabState[]; readonly groups: readonly UndoGroupState[] } => {
  return {
    tabs: adapter.tabs.map((tab, index) => toUndoTab(tab, adapter.tabGroups, index)),
    groups: adapter.tabGroups.map((group) => ({
      id: group.id,
      workspaceId: adapter.activeWorkspaceId,
      closed: false,
      generated: group.id.startsWith("neurosort-group-"),
      tabIds: group.tabs.map((tab) => tab.id),
    })),
  };
};

const toUndoTab = (tab: PlatformTab, groups: ZenAdapter["tabGroups"], index: number): UndoTabState => {
  const group = groups.find((candidate) => candidate.tabs.some((groupTab) => groupTab.id === tab.id));
  return {
    id: tab.id,
    parentId: parentId(tab),
    groupId: group?.id ?? null,
    workspaceId: tab.workspaceId,
    index,
    pinned: tab.pinned,
    folder: Reflect.get(tab, "folder") === true,
    splitView: Reflect.get(tab, "splitView") === true,
  };
};

const parentId = (tab: PlatformTab): string | null => {
  const parent = Reflect.get(tab, "parentNode");
  if (typeof parent !== "object" || parent === null) {
    return null;
  }
  const id = Reflect.get(parent, "id");
  return typeof id === "string" ? id : null;
};
