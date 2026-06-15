import { describe, expect, it } from "vitest";

import { resolveZenAdapter } from "../../src/zen/adapter";
import { applyGroupMutations, removeEmptyGroups } from "../../src/zen/groupMutations";
import { createFakeRuntime } from "../fakes/fakeRuntime";

describe("Zen group mutations", () => {
  it("creates groups in the active workspace strip and moves tabs with group.addTabs", () => {
    // Given: a resolved adapter with two tabs in the current workspace.
    const runtime = createFakeRuntime({
      activeWorkspace: "workspace-a",
      tabs: [
        { id: "tab-1", title: "Docs", url: "https://docs.test", workspaceId: "workspace-a" },
        { id: "tab-2", title: "Mail", url: "https://mail.test", workspaceId: "workspace-a" },
      ],
    });
    const adapterResult = resolveZenAdapter(runtime);
    expect(adapterResult.ok).toBe(true);
    if (!adapterResult.ok) {
      return;
    }

    // When: a group mutation plan is applied.
    const result = applyGroupMutations(adapterResult.value, [
      { label: "Work", color: "blue", tabIds: ["tab-1", "tab-2"] },
    ]);

    // Then: the group is mounted through public containers and contains both tabs.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.createdGroupIds).toEqual(["neurosort-group-work"]);
      expect(runtime.gZenWorkspaces.activeWorkspaceStrip.querySelectorAll("tab-group").map((group) => group.id)).toEqual([
        "neurosort-group-work",
      ]);
      expect(result.value.movedTabIds).toEqual(["tab-1", "tab-2"]);
    }
  });

  it("removes empty groups through gBrowser.removeTabGroup", () => {
    // Given: one empty group and one non-empty group.
    const runtime = createFakeRuntime({
      tabs: [{ id: "tab-1", title: "Docs", url: "https://docs.test" }],
    });
    const emptyGroup = runtime.document.createXULElement("tab-group");
    emptyGroup.id = "empty";
    const keptGroup = runtime.document.createXULElement("tab-group");
    keptGroup.id = "kept";
    runtime.gBrowser.tabContainer.appendChild(emptyGroup);
    runtime.gBrowser.tabContainer.appendChild(keptGroup);
    runtime.gBrowser.moveTabToGroup(runtime.gBrowser.tabs[0] ?? missingTab(), keptGroup);
    const adapterResult = resolveZenAdapter(runtime);
    expect(adapterResult.ok).toBe(true);
    if (!adapterResult.ok) {
      return;
    }

    // When: empty groups are removed.
    const result = removeEmptyGroups(adapterResult.value);

    // Then: only the empty group is removed by the browser API.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.removedGroupIds).toEqual(["empty"]);
      expect(runtime.document.querySelectorAll("tab-group").map((group) => group.id)).toEqual(["kept"]);
    }
  });

  it("returns malformed_input when no public tab-moving API is available", () => {
    // Given: a resolved adapter and a group whose addTabs API is absent at mutation time.
    const runtime = createFakeRuntime({
      tabs: [{ id: "tab-1", title: "Docs", url: "https://docs.test" }],
    });
    const adapterResult = resolveZenAdapter(runtime);
    expect(adapterResult.ok).toBe(true);
    if (!adapterResult.ok) {
      return;
    }
    const brokenAdapter = {
      ...adapterResult.value,
      moveTabToGroup: undefined,
      createGroup: () => {
        const group = runtime.document.createXULElement("tab-group");
        Reflect.set(group, "addTabs", undefined);
        return group;
      },
    };

    // When: a mutation plan tries to move a tab.
    const result = applyGroupMutations(brokenAdapter, [{ label: "Work", tabIds: ["tab-1"] }]);

    // Then: the adapter reports the missing public capability.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("malformed_input");
      expect(result.error.missingApi).toBe("group.addTabs");
    }
  });
});

function missingTab(): never {
  throw new Error("missing fake tab");
}
