import { describe, expect, it } from "vitest";

import { createFakeRuntime } from "./fakeRuntime";
import type { FakeTab } from "./fakeDom";

describe("fake Zen and Sine runtime", () => {
  it("stores typed values with Services.prefs when preferences are read and written", () => {
    // Given: an empty fake runtime.
    const runtime = createFakeRuntime();

    // When: Sine preferences are written through the fake pref service.
    runtime.Services.prefs.setStringPref("extensions.sine.neurosort.provider", "disabled");
    runtime.Services.prefs.setIntPref("extensions.sine.neurosort.threshold", 3);
    runtime.Services.prefs.setBoolPref("extensions.sine.neurosort.consent", false);

    // Then: preference presence, type, and value reads match the browser contract.
    expect(runtime.Services.prefs.prefHasUserValue("extensions.sine.neurosort.provider")).toBe(true);
    expect(runtime.Services.prefs.getPrefType("extensions.sine.neurosort.provider")).toBe(
      runtime.Services.prefs.PREF_STRING,
    );
    expect(runtime.Services.prefs.getStringPref("extensions.sine.neurosort.provider")).toBe("disabled");
    expect(runtime.Services.prefs.getIntPref("extensions.sine.neurosort.threshold")).toBe(3);
    expect(runtime.Services.prefs.getBoolPref("extensions.sine.neurosort.consent")).toBe(false);
  });

  it("tracks Sine preference reads and writes through a small preference facade", () => {
    // Given: a fake runtime with no stored Sine preference.
    const runtime = createFakeRuntime();

    // When: a Sine preference is read with a fallback and then written.
    const fallbackValue = runtime.sinePrefs.readString("provider", "disabled");
    runtime.sinePrefs.writeString("provider", "openai-compatible");

    // Then: reads and writes are recorded and persisted under the Sine pref branch.
    expect(fallbackValue).toBe("disabled");
    expect(runtime.sinePrefs.readString("provider", "disabled")).toBe("openai-compatible");
    expect(runtime.sinePrefs.reads).toEqual(["provider", "provider"]);
    expect(runtime.sinePrefs.writes).toEqual(["provider"]);
  });

  it("creates fake tabs and moves them into a document-created tab group", () => {
    // Given: a fake runtime with two browser tabs.
    const runtime = createFakeRuntime({
      tabs: [
        { id: "tab-1", title: "Docs", url: "https://example.test/docs" },
        { id: "tab-2", title: "Mail", url: "https://example.test/mail" },
      ],
    });
    const group = runtime.document.createXULElement("tab-group");
    group.id = "group-work";
    group.label = "Work";
    runtime.gBrowser.tabContainer.appendChild(group);

    // When: the browser fake moves one tab into the group.
    runtime.gBrowser.moveTabToGroup(fakeTabAt(runtime.gBrowser.tabs, 0), group);

    // Then: the fake gBrowser and tab-group relationship reflects membership.
    expect(group.tabs.map((tab) => tab.id)).toEqual(["tab-1"]);
    expect(fakeTabAt(runtime.gBrowser.tabs, 0).group?.id).toBe("group-work");
    expect(runtime.document.querySelectorAll("tab-group")).toEqual([group]);
  });

  it("supports group.addTabs and gBrowser.ungroupTab for tab group membership", () => {
    // Given: a fake runtime, a group, and two tabs.
    const runtime = createFakeRuntime({
      tabs: [
        { id: "tab-1", title: "Docs", url: "https://example.test/docs" },
        { id: "tab-2", title: "Mail", url: "https://example.test/mail" },
      ],
    });
    const group = runtime.document.createXULElement("tab-group");
    runtime.gBrowser.tabContainer.appendChild(group);

    // When: the group adds both tabs and the browser ungroups one tab.
    group.addTabs(runtime.gBrowser.tabs);
    runtime.gBrowser.ungroupTab(fakeTabAt(runtime.gBrowser.tabs, 1));

    // Then: only the remaining grouped tab is present.
    expect(group.tabs.map((tab) => tab.id)).toEqual(["tab-1"]);
    expect(fakeTabAt(runtime.gBrowser.tabs, 1).group).toBeNull();
  });

  it("removes tab groups with gBrowser.removeTabGroup", () => {
    // Given: a fake runtime with one group containing one tab.
    const runtime = createFakeRuntime({
      tabs: [{ id: "tab-1", title: "Docs", url: "https://example.test/docs" }],
    });
    const group = runtime.document.createXULElement("tab-group");
    runtime.gBrowser.tabContainer.appendChild(group);
    runtime.gBrowser.moveTabToGroup(fakeTabAt(runtime.gBrowser.tabs, 0), group);

    // When: the browser fake removes the group.
    runtime.gBrowser.removeTabGroup(group);

    // Then: the group is detached and its tabs are ungrouped.
    expect(runtime.document.querySelectorAll("tab-group")).toEqual([]);
    expect(fakeTabAt(runtime.gBrowser.tabs, 0).group).toBeNull();
  });

  it("models gZenWorkspaces and mutation observers for container changes", () => {
    // Given: a fake runtime with a mutation observer on the active workspace strip.
    const runtime = createFakeRuntime({ activeWorkspace: "workspace-a" });
    const records: string[] = [];
    const observer = new runtime.MutationObserver((mutations) => {
      mutations.forEach((mutation) => records.push(mutation.type));
    });
    observer.observe(runtime.gZenWorkspaces.activeWorkspaceStrip, { childList: true });

    // When: a new tab group is inserted into the active workspace strip.
    runtime.gZenWorkspaces.setActiveWorkspace("workspace-b");
    runtime.gZenWorkspaces.activeWorkspaceStrip.appendChild(runtime.document.createXULElement("tab-group"));

    // Then: workspace state and mutation delivery are visible to tests.
    expect(runtime.gZenWorkspaces.activeWorkspace).toBe("workspace-b");
    expect(records).toEqual(["childList"]);
  });
});

function fakeTabAt(tabs: readonly FakeTab[], index: number): FakeTab {
  const tab = tabs[index];
  if (tab === undefined) {
    throw new MissingFakeTabError(index);
  }
  return tab;
}

class MissingFakeTabError extends Error {
  constructor(readonly index: number) {
    super(`Missing fake tab at index ${index}`);
    this.name = "MissingFakeTabError";
  }
}
