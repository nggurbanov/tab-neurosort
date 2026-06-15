import { describe, expect, it } from "vitest";
import { planGroupMutations } from "../../src/core/groupPlanner";
import type { GroupPlannerTab, PlannedCategory } from "../../src/core/groupPlanner";

const tab = (id: string, overrides: Partial<GroupPlannerTab> = {}): GroupPlannerTab => ({
  id,
  workspaceId: "workspace-a",
  groupId: null,
  index: 0,
  pinned: false,
  folder: false,
  splitView: false,
  ...overrides,
});

const category = (name: string, tabIds: readonly string[]): PlannedCategory => ({ name, tabIds });

describe("planGroupMutations", () => {
  it("plans group creation and ordered moves without touching runtime objects", () => {
    // Given
    const tabs = [
      tab("research", { index: 2 }),
      tab("mail", { index: 0 }),
      tab("docs", { index: 1 }),
    ];
    const categories = [category("Work", ["docs", "research"])];

    // When
    const plan = planGroupMutations({ tabs, categories });

    // Then
    expect(plan.operations).toEqual([
      { kind: "createGroup", groupId: "generated-work", title: "Work", workspaceId: "workspace-a" },
      { kind: "moveTabToGroup", tabId: "docs", groupId: "generated-work", order: 0 },
      { kind: "moveTabToGroup", tabId: "research", groupId: "generated-work", order: 1 },
    ]);
    expect(tabs.map((item) => item.groupId)).toEqual([null, null, null]);
  });

  it("reports malformed input when category targets are missing or excluded", () => {
    // Given
    const tabs = [
      tab("visible"),
      tab("pinned", { pinned: true }),
      tab("folder", { folder: true }),
      tab("split", { splitView: true }),
    ];
    const categories = [category("Mixed", ["visible", "missing", "pinned", "folder", "split"])];

    // When
    const plan = planGroupMutations({ tabs, categories });

    // Then
    expect(plan.operations).toEqual([
      { kind: "createGroup", groupId: "generated-mixed", title: "Mixed", workspaceId: "workspace-a" },
      { kind: "moveTabToGroup", tabId: "visible", groupId: "generated-mixed", order: 0 },
    ]);
    expect(plan.outcomes).toEqual([
      { kind: "skippedMissingTab", tabId: "missing", category: "Mixed" },
      { kind: "skippedExcludedTab", tabId: "pinned", category: "Mixed", reason: "pinned" },
      { kind: "skippedExcludedTab", tabId: "folder", category: "Mixed", reason: "folder" },
      { kind: "skippedExcludedTab", tabId: "split", category: "Mixed", reason: "splitView" },
    ]);
  });
});
