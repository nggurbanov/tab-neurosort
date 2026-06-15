import { describe, expect, it } from "vitest";

import { collectCurrentWorkspaceSnapshots, resolveZenAdapter } from "../../src/zen/adapter";
import { createFakeRuntime } from "../fakes/fakeRuntime";

describe("Zen adapter capability detection", () => {
  it("returns malformed_input when required group APIs are missing", () => {
    // Given: a runtime-shaped object without browser tab group mutation APIs.
    const runtime = {
      gBrowser: { tabs: [], tabGroups: [] },
      gZenWorkspaces: { activeWorkspace: "workspace-a", activeWorkspaceStrip: {} },
      document: {},
    };

    // When: the Zen adapter is resolved.
    const result = resolveZenAdapter(runtime);

    // Then: the failure is actionable instead of a raw TypeError.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("malformed_input");
      expect(result.error.missingApi).toBe("gBrowser.moveTabToGroup");
      expect(result.error.message).toContain("Zen tab group API is unavailable");
    }
  });

  it("prefers gBrowser.tabGroups over DOM lookup when native groups are available", () => {
    // Given: a fake runtime with a native tabGroups array and an unrelated DOM group.
    const runtime = createFakeRuntime();
    const nativeGroup = runtime.document.createXULElement("tab-group");
    nativeGroup.id = "native-group";
    nativeGroup.label = "Native";
    const domGroup = runtime.document.createXULElement("tab-group");
    domGroup.id = "dom-group";
    domGroup.label = "DOM";
    runtime.gBrowser.tabContainer.appendChild(domGroup);
    const gBrowserWithNativeGroups = Object.create(runtime.gBrowser);
    Object.defineProperty(gBrowserWithNativeGroups, "tabGroups", { value: [nativeGroup] });
    const runtimeWithNativeGroups = { ...runtime, gBrowser: gBrowserWithNativeGroups };

    // When: the adapter reads tab groups.
    const result = resolveZenAdapter(runtimeWithNativeGroups);

    // Then: it uses the native gBrowser.tabGroups source.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tabGroups.map((group) => group.id)).toEqual(["native-group"]);
    }
  });

  it("supports optional DOM-discovered groups without requiring Advanced Tab Groups", () => {
    // Given: a fake runtime whose groups are visible only through the DOM.
    const runtime = createFakeRuntime();
    const group = runtime.document.createXULElement("tab-group");
    group.id = "dom-group";
    group.label = "DOM";
    runtime.gBrowser.tabContainer.appendChild(group);

    // When: the adapter is resolved.
    const result = resolveZenAdapter(runtime);

    // Then: it treats DOM-discovered groups as compatibility only.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tabGroups.map((existingGroup) => existingGroup.id)).toEqual(["dom-group"]);
    }
  });

  it("filters snapshots to the active workspace and excludes protected tabs", () => {
    // Given: tabs across workspaces with pinned, folder, split-view, and grouped exclusions.
    const runtime = createFakeRuntime({
      activeWorkspace: "workspace-a",
      tabs: [
        { id: "tab-1", title: "Docs", url: "https://docs.test", workspaceId: "workspace-a" },
        { id: "tab-2", title: "Mail", url: "https://mail.test", workspaceId: "workspace-b" },
        { id: "tab-3", title: "Pinned", url: "https://pin.test", pinned: true, workspaceId: "workspace-a" },
        { id: "tab-4", title: "Grouped", url: "https://group.test", workspaceId: "workspace-a" },
      ],
    });
    const group = runtime.document.createXULElement("tab-group");
    group.id = "group-existing";
    runtime.gBrowser.tabContainer.appendChild(group);
    runtime.gBrowser.moveTabToGroup(runtime.gBrowser.tabs[3] ?? missingTab(), group);
    const folderTab = { ...runtime.gBrowser.tabs[0], id: "tab-folder", folder: true };
    const splitViewTab = { ...runtime.gBrowser.tabs[0], id: "tab-split", splitView: true };
    const gBrowserWithExtraTabs = Object.create(runtime.gBrowser);
    Object.defineProperty(gBrowserWithExtraTabs, "tabs", {
      value: [...runtime.gBrowser.tabs, folderTab, splitViewTab],
    });
    const runtimeWithExtraTabs = { ...runtime, gBrowser: gBrowserWithExtraTabs };

    // When: current workspace snapshots are collected.
    const result = resolveZenAdapter(runtimeWithExtraTabs);

    // Then: only active-workspace tabs are present and protected tabs carry exclusions.
    expect(result.ok).toBe(true);
    if (result.ok) {
      const snapshots = collectCurrentWorkspaceSnapshots(result.value, { preservePinnedTabs: true });
      expect(snapshots.map((snapshot) => [snapshot.id, snapshot.exclusion?.reason ?? "eligible"])).toEqual([
        ["tab-1", "eligible"],
        ["tab-3", "pinned"],
        ["tab-4", "grouped"],
        ["tab-folder", "folder"],
        ["tab-split", "splitView"],
      ]);
    }
  });
});

function missingTab(): never {
  throw new Error("missing fake tab");
}
