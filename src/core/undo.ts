export type UndoTabState = {
  readonly id: string;
  readonly parentId: string | null;
  readonly groupId: string | null;
  readonly workspaceId: string | null;
  readonly index: number;
  readonly pinned: boolean;
  readonly folder: boolean;
  readonly splitView: boolean;
};

export type UndoGroupState = {
  readonly id: string;
  readonly workspaceId: string | null;
  readonly closed: boolean;
  readonly generated: boolean;
  readonly tabIds: readonly string[];
};

export type UndoSnapshotInput = {
  readonly tabs: readonly UndoTabState[];
  readonly groups: readonly UndoGroupState[];
};

export type UndoSnapshot = {
  readonly tabs: readonly UndoTabState[];
  readonly groups: readonly UndoGroupState[];
};

export type UndoCurrentState = UndoSnapshotInput & {
  readonly failedTabIds?: readonly string[];
};

export type UndoOperation =
  | {
      readonly kind: "moveTabToGroup";
      readonly tabId: string;
      readonly groupId: string | null;
      readonly index: number;
    }
  | { readonly kind: "removeEmptyGeneratedGroup"; readonly groupId: string };

export type UndoOutcome =
  | { readonly kind: "restored"; readonly tabId: string }
  | { readonly kind: "missingTab"; readonly tabId: string }
  | { readonly kind: "missingGroup"; readonly tabId: string; readonly groupId: string }
  | { readonly kind: "closedGroup"; readonly tabId: string; readonly groupId: string }
  | { readonly kind: "partialMoveFailure"; readonly tabId: string };

export type UndoPlan = {
  readonly operations: readonly UndoOperation[];
  readonly outcomes: readonly UndoOutcome[];
};

export const captureUndoSnapshot = (input: UndoSnapshotInput): UndoSnapshot => ({
  tabs: input.tabs.map((tab) => ({ ...tab })),
  groups: input.groups.map((group) => ({ ...group, tabIds: [...group.tabIds] })),
});

export const planUndo = (snapshot: UndoSnapshot, current: UndoCurrentState): UndoPlan => {
  const currentTabs = new Set(current.tabs.map((tab) => tab.id));
  const currentGroups = new Map(current.groups.map((group) => [group.id, group]));
  const failedTabIds = new Set(current.failedTabIds ?? []);
  const operations: UndoOperation[] = [];
  const outcomes: UndoOutcome[] = [];
  const restoredTabIds = new Set<string>();

  const orderedSnapshots = [...snapshot.tabs].sort((left, right) => left.index - right.index);
  for (const original of orderedSnapshots) {
    const outcome = planTabRestore(original, currentTabs, currentGroups, failedTabIds);
    if (outcome.kind === "operation") {
      operations.push(outcome.operation);
      outcomes.push({ kind: "restored", tabId: original.id });
      restoredTabIds.add(original.id);
      continue;
    }
    outcomes.push(outcome.degraded);
  }

  for (const group of current.groups) {
    if (shouldRemoveGeneratedGroup(group, restoredTabIds)) {
      operations.push({ kind: "removeEmptyGeneratedGroup", groupId: group.id });
    }
  }

  return { operations, outcomes };
};

type TabRestorePlan =
  | { readonly kind: "operation"; readonly operation: UndoOperation }
  | { readonly kind: "degraded"; readonly degraded: UndoOutcome };

const planTabRestore = (
  original: UndoTabState,
  currentTabs: ReadonlySet<string>,
  currentGroups: ReadonlyMap<string, UndoGroupState>,
  failedTabIds: ReadonlySet<string>,
): TabRestorePlan => {
  if (!currentTabs.has(original.id)) {
    return { kind: "degraded", degraded: { kind: "missingTab", tabId: original.id } };
  }
  if (failedTabIds.has(original.id)) {
    return { kind: "degraded", degraded: { kind: "partialMoveFailure", tabId: original.id } };
  }
  if (original.groupId !== null) {
    const targetGroup = currentGroups.get(original.groupId);
    if (targetGroup === undefined) {
      return { kind: "degraded", degraded: { kind: "missingGroup", tabId: original.id, groupId: original.groupId } };
    }
    if (targetGroup.closed) {
      return { kind: "degraded", degraded: { kind: "closedGroup", tabId: original.id, groupId: original.groupId } };
    }
  }
  return {
    kind: "operation",
    operation: { kind: "moveTabToGroup", tabId: original.id, groupId: original.groupId, index: original.index },
  };
};

const shouldRemoveGeneratedGroup = (group: UndoGroupState, restoredTabIds: ReadonlySet<string>): boolean => {
  if (!group.generated || group.closed) {
    return false;
  }
  if (group.tabIds.length === 0) {
    return true;
  }
  return group.tabIds.every((tabId) => restoredTabIds.has(tabId));
};
