import { describe, expect, it } from "vitest";
import { captureUndoSnapshot, planUndo } from "../../src/core/undo";
import type { UndoGroupState, UndoTabState } from "../../src/core/undo";

const tab = (id: string, overrides: Partial<UndoTabState> = {}): UndoTabState => ({
  id,
  parentId: "tabstrip",
  groupId: null,
  workspaceId: "workspace-a",
  index: 0,
  pinned: false,
  folder: false,
  splitView: false,
  ...overrides,
});

const group = (id: string, overrides: Partial<UndoGroupState> = {}): UndoGroupState => ({
  id,
  workspaceId: "workspace-a",
  closed: false,
  generated: false,
  tabIds: [],
  ...overrides,
});

describe("captureUndoSnapshot", () => {
  it("captures pre-mutation tab position, grouping, workspace, and exclusion flags", () => {
    // Given
    const tabs = [
      tab("a", { groupId: "old", index: 1, pinned: true }),
      tab("b", { parentId: "folder-1", workspaceId: "workspace-b", index: 4, folder: true, splitView: true }),
    ];

    // When
    const snapshot = captureUndoSnapshot({ tabs, groups: [group("old", { tabIds: ["a"] })] });

    // Then
    expect(snapshot.tabs).toEqual([
      {
        id: "a",
        parentId: "tabstrip",
        groupId: "old",
        workspaceId: "workspace-a",
        index: 1,
        pinned: true,
        folder: false,
        splitView: false,
      },
      {
        id: "b",
        parentId: "folder-1",
        groupId: null,
        workspaceId: "workspace-b",
        index: 4,
        pinned: false,
        folder: true,
        splitView: true,
      },
    ]);
  });
});

describe("planUndo", () => {
  it("restores original group membership and tab order for existing targets", () => {
    // Given
    const snapshot = captureUndoSnapshot({
      tabs: [tab("a", { groupId: "old", index: 1 }), tab("b", { index: 0 })],
      groups: [group("old", { tabIds: ["a"] })],
    });

    // When
    const plan = planUndo(snapshot, {
      tabs: [tab("a", { groupId: "generated-work", index: 0 }), tab("b", { groupId: "generated-work", index: 1 })],
      groups: [group("old"), group("generated-work", { generated: true, tabIds: ["a", "b"] })],
    });

    // Then
    expect(plan.operations).toEqual([
      { kind: "moveTabToGroup", tabId: "b", groupId: null, index: 0 },
      { kind: "moveTabToGroup", tabId: "a", groupId: "old", index: 1 },
      { kind: "removeEmptyGeneratedGroup", groupId: "generated-work" },
    ]);
    expect(plan.outcomes).toEqual([{ kind: "restored", tabId: "b" }, { kind: "restored", tabId: "a" }]);
  });

  it("reports degraded undo for missing tabs, missing groups, closed groups, and partial move failures", () => {
    // Given
    const snapshot = captureUndoSnapshot({
      tabs: [
        tab("missing", { groupId: "old" }),
        tab("needs-group", { groupId: "gone" }),
        tab("closed-target", { groupId: "closed" }),
        tab("move-fails", { groupId: null }),
      ],
      groups: [group("old"), group("gone"), group("closed")],
    });

    // When
    const plan = planUndo(snapshot, {
      tabs: [tab("needs-group"), tab("closed-target"), tab("move-fails")],
      groups: [group("closed", { closed: true })],
      failedTabIds: ["move-fails"],
    });

    // Then
    expect(plan.outcomes).toEqual([
      { kind: "missingTab", tabId: "missing" },
      { kind: "missingGroup", tabId: "needs-group", groupId: "gone" },
      { kind: "closedGroup", tabId: "closed-target", groupId: "closed" },
      { kind: "partialMoveFailure", tabId: "move-fails" },
    ]);
    expect(plan.operations).toEqual([]);
  });
});
