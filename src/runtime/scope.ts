import type { GroupPlannerTab } from "../core/groupPlanner";
import type { TabSnapshot } from "../core/types";
import type { TidyTrigger } from "./orchestrator";

export const selectScopeSnapshots = (
  snapshots: readonly TabSnapshot[],
  trigger: TidyTrigger,
  selectedTabIds: readonly string[] | undefined,
): readonly TabSnapshot[] => {
  const selected = trigger === "selected" ? new Set(selectedTabIds ?? []) : null;
  return snapshots
    .filter((snapshot) => selected === null || selected.has(snapshot.id))
    .map((snapshot) => normalizeScope(snapshot, trigger));
};

export const toPlannerTabs = (snapshots: readonly TabSnapshot[]): readonly GroupPlannerTab[] => {
  return snapshots.map((snapshot, index) => ({
    id: snapshot.id,
    workspaceId: snapshot.workspaceId,
    groupId: snapshot.exclusion?.reason === "grouped" ? snapshot.exclusion.groupId : null,
    index,
    pinned: snapshot.exclusion?.reason === "pinned",
    folder: snapshot.exclusion?.reason === "folder",
    splitView: snapshot.exclusion?.reason === "splitView",
  }));
};

const normalizeScope = (snapshot: TabSnapshot, trigger: TidyTrigger): TabSnapshot => {
  if ((trigger === "menu" || trigger === "modifier" || trigger === "selected") && snapshot.exclusion?.reason === "grouped") {
    return { ...snapshot, exclusion: null };
  }
  return snapshot;
};
