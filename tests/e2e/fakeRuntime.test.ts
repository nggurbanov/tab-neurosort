import { describe, expect, it } from "vitest";

import type { ProviderResult } from "../../src/providers";
import { createNeuroSortApp, type NeuroSortApp, type NeuroSortProviderCompletion } from "../../src/runtime/orchestrator";
import { mountBrowserChrome, type BrowserChromeStatus } from "../../src/ui/browserChrome";
import { FakeTabGroup } from "../fakes/fakeDom";
import { createFakeRuntime, type FakeRuntime } from "../fakes/fakeRuntime";
import { FakeChromeDocument } from "../ui/fakeChromeDom";

const readyOpenAiPrefs = (runtime: FakeRuntime): void => {
  runtime.Services.prefs.setStringPref("extensions.neurosort.provider", "openai");
  runtime.Services.prefs.setBoolPref("extensions.neurosort.data_consent", true);
  runtime.Services.prefs.setStringPref("extensions.neurosort.openai.endpoint", "https://api.example.test/v1");
  runtime.Services.prefs.setStringPref("extensions.neurosort.openai.api_key", "sk-test");
  runtime.Services.prefs.setStringPref("extensions.neurosort.openai.model", "gpt-tabs");
};

const setMinGroupSize = (runtime: FakeRuntime, value: number): void => {
  runtime.Services.prefs.setIntPref("extensions.neurosort.min_group_size", value);
};

const providerText = (text: string): NeuroSortProviderCompletion => {
  return async () => ({ ok: true, text });
};

const appWithProvider = (runtime: FakeRuntime, provider: NeuroSortProviderCompletion): NeuroSortApp => {
  return createNeuroSortApp(runtime, { provider });
};

describe("fake Zen/Sine end-to-end QA matrix", () => {
  it("Given fake browser chrome When mounted Then broom is visible and reflects provider state", () => {
    // Given
    const document = new FakeChromeDocument();
    const toolbar = document.createElement("toolbar");
    const status: BrowserChromeStatus = { kind: "setup", message: "Choose an AI provider" };

    // When
    const chrome = mountBrowserChrome({
      document,
      toolbar,
      workspaceId: "qa-workspace",
      actions: {
        tidyUngrouped: () => undefined,
        tidyAll: () => undefined,
        tidySelected: () => undefined,
        undoLastTidy: () => undefined,
        openSettings: () => undefined,
        saveQuickSettings: () => undefined,
      },
      settings: { providerLabel: "Disabled", modelLabel: "Not set", endpointLabel: "Not set", apiKey: "" },
      status,
    });

    // Then
    expect(chrome.button.id).toContain("neurosort-broom-qa-workspace");
    expect(chrome.root.querySelectorAll("button").length).toBeGreaterThanOrEqual(6);
    expect(chrome.root.querySelector(".neurosort-status")).not.toBeNull();
    chrome.update({ kind: "ready", message: "Ready", badgeText: "On" });
    expect(chrome.root.querySelector(".neurosort-badge")).not.toBeNull();
  });

  it("Given disabled provider defaults When default tidy runs Then no provider request is made", async () => {
    // Given
    const runtime = createFakeRuntime({ tabs: qaTabs() });
    let providerCalls = 0;
    const app = appWithProvider(runtime, async () => {
      providerCalls += 1;
      return { ok: true, text: "a: Work\nb: Work" };
    });

    // When
    const result = await app.tidy({ trigger: "defaultClick" });

    // Then
    expect(result).toEqual({ status: "provider_denied", reason: "provider_disabled" });
    expect(providerCalls).toBe(0);
    expect(groupSummary(runtime)).toEqual([]);
    expect(app.state()).toMatchObject({ status: "blocked", canUndo: false });
  });

  it("Given provider is configured without consent When tidy all runs Then consent is required before network work", async () => {
    // Given
    const runtime = createFakeRuntime({ tabs: qaTabs() });
    runtime.Services.prefs.setStringPref("extensions.neurosort.provider", "openai");
    runtime.Services.prefs.setStringPref("extensions.neurosort.openai.endpoint", "https://api.example.test/v1");
    runtime.Services.prefs.setStringPref("extensions.neurosort.openai.api_key", "sk-test");
    runtime.Services.prefs.setStringPref("extensions.neurosort.openai.model", "gpt-tabs");
    let providerCalls = 0;
    const app = appWithProvider(runtime, async () => {
      providerCalls += 1;
      return { ok: true, text: "a: Work\nb: Work" };
    });

    // When
    const result = await app.tidy({ trigger: "menu" });

    // Then
    expect(result).toEqual({ status: "provider_denied", reason: "consent_required" });
    expect(providerCalls).toBe(0);
    expect(groupSummary(runtime)).toEqual([]);
  });

  it("Given provider times out When tidy runs Then no tabs are mutated", async () => {
    // Given
    const runtime = createFakeRuntime({ tabs: qaTabs() });
    readyOpenAiPrefs(runtime);
    const app = appWithProvider(runtime, async (): Promise<ProviderResult> => ({ ok: false, reason: "timeout" }));

    // When
    const result = await app.tidy({ trigger: "defaultClick" });

    // Then
    expect(result).toEqual({ status: "provider_failed", reason: "timeout" });
    expect(groupSummary(runtime)).toEqual([]);
    expect(runtime.gBrowser.tabs.map((tab) => tab.group?.id ?? null)).toEqual([null, null, null]);
  });

  it("Given ungrouped current-workspace tabs When default tidy runs Then only eligible tabs are grouped", async () => {
    // Given
    const runtime = createFakeRuntime({
      activeWorkspace: "work",
      tabs: [
        { id: "a", title: "Docs", url: "https://docs.example.test/a", workspaceId: "work" },
        { id: "b", title: "Docs", url: "https://docs.example.test/b", workspaceId: "work" },
        { id: "pinned", title: "Pinned", url: "https://docs.example.test/pinned", pinned: true, workspaceId: "work" },
        { id: "folder", title: "Folder", url: "https://docs.example.test/folder", workspaceId: "work" },
        { id: "split", title: "Split", url: "https://docs.example.test/split", workspaceId: "work" },
        { id: "other-workspace", title: "Other", url: "https://docs.example.test/other", workspaceId: "other" },
      ],
    });
    Reflect.set(runtime.gBrowser.tabs[3] ?? missingTab(), "folder", true);
    Reflect.set(runtime.gBrowser.tabs[4] ?? missingTab(), "splitView", true);
    readyOpenAiPrefs(runtime);
    const app = appWithProvider(
      runtime,
      providerText("a: Reading\nb: Reading\npinned: Reading\nfolder: Reading\nsplit: Reading\nother-workspace: Reading"),
    );

    // When
    const result = await app.tidy({ trigger: "defaultClick" });

    // Then
    expect(result).toEqual({ status: "tidied", movedTabIds: ["a", "b"] });
    expect(groupSummary(runtime)).toEqual([["neurosort-group-reading", ["a", "b"]]]);
    expect(runtime.gBrowser.tabs.find((tab) => tab.id === "pinned")?.group).toBeNull();
    expect(runtime.gBrowser.tabs.find((tab) => tab.id === "folder")?.group).toBeNull();
    expect(runtime.gBrowser.tabs.find((tab) => tab.id === "split")?.group).toBeNull();
    expect(runtime.gBrowser.tabs.find((tab) => tab.id === "other-workspace")?.group).toBeNull();
  });

  it("Given an existing group When tidy all runs Then grouped and ungrouped eligible tabs are regrouped together", async () => {
    // Given
    const runtime = createFakeRuntime({ tabs: qaTabs() });
    readyOpenAiPrefs(runtime);
    const existing = runtime.document.createXULElement("tab-group");
    existing.id = "existing-research";
    runtime.gZenWorkspaces.activeWorkspaceStrip.appendChild(existing);
    runtime.gBrowser.moveTabToGroup(runtime.gBrowser.tabs[2] ?? missingTab(), existing);
    const app = appWithProvider(runtime, providerText("a: Research\nb: Research\ngrouped: Research"));

    // When
    const result = await app.tidy({ trigger: "menu" });

    // Then
    expect(result.status).toBe("tidied");
    expect(groupSummary(runtime)).toContainEqual(["neurosort-group-research", ["a", "b", "grouped"]]);
  });

  it("Given selected tabs When selected tidy runs Then unselected tabs stay ungrouped", async () => {
    // Given
    const runtime = createFakeRuntime({ tabs: qaTabs() });
    readyOpenAiPrefs(runtime);
    setMinGroupSize(runtime, 1);
    const app = appWithProvider(runtime, providerText("a: Focus\nb: Focus\ngrouped: Focus"));

    // When
    const result = await app.tidy({ trigger: "selected", selectedTabIds: ["a"] });

    // Then
    expect(result).toEqual({ status: "tidied", movedTabIds: ["a"] });
    expect(groupSummary(runtime)).toEqual([["neurosort-group-focus", ["a"]]]);
    expect(runtime.gBrowser.tabs.find((tab) => tab.id === "b")?.group).toBeNull();
  });

  it("Given auto tidy fires When provider succeeds Then the app uses the auto operation path", async () => {
    // Given
    const runtime = createFakeRuntime({ tabs: qaTabs().slice(0, 2) });
    readyOpenAiPrefs(runtime);
    const app = appWithProvider(runtime, providerText("a: Auto\nb: Auto"));

    // When
    const result = await app.tidy({ trigger: "auto" });

    // Then
    expect(result).toEqual({ status: "tidied", movedTabIds: ["a", "b"] });
    expect(groupSummary(runtime)).toEqual([["neurosort-group-auto", ["a", "b"]]]);
  });

  it("Given a completed tidy When undo runs Then generated groups are removed and tabs return ungrouped", async () => {
    // Given
    const runtime = createFakeRuntime({ tabs: qaTabs().slice(0, 2) });
    readyOpenAiPrefs(runtime);
    const app = appWithProvider(runtime, providerText("a: Undo\nb: Undo"));
    await app.tidy({ trigger: "defaultClick" });

    // When
    const result = await app.undo();

    // Then
    expect(result).toEqual({ status: "undone", restoredTabIds: ["a", "b"] });
    expect(groupSummary(runtime)).toEqual([]);
    expect(runtime.gBrowser.tabs.map((tab) => tab.group?.id ?? null)).toEqual([null, null]);
    expect(app.state()).toMatchObject({ status: "idle", canUndo: false });
  });

  it("Given group APIs are missing When tidy runs Then the app fails closed with setup details", async () => {
    // Given
    const runtime = createFakeRuntime({ tabs: qaTabs() });
    readyOpenAiPrefs(runtime);
    const malformedRuntime = {
      ...runtime,
      gBrowser: {
        tabs: runtime.gBrowser.tabs,
        tabContainer: runtime.gBrowser.tabContainer,
        ungroupTab: runtime.gBrowser.ungroupTab.bind(runtime.gBrowser),
        removeTabGroup: runtime.gBrowser.removeTabGroup.bind(runtime.gBrowser),
      },
    };
    const app = createNeuroSortApp(malformedRuntime, { provider: providerText("a: Work\nb: Work") });

    // When
    const result = await app.tidy({ trigger: "defaultClick" });

    // Then
    expect(result).toEqual({ status: "adapter_failed", missingApi: "gBrowser.moveTabToGroup" });
    expect(groupSummary(runtime)).toEqual([]);
  });

  it("Given a tab disappears during mutation When tidy runs Then partial failure is reported without a provider retry", async () => {
    // Given
    const runtime = createFakeRuntime({ tabs: qaTabs().slice(0, 2) });
    readyOpenAiPrefs(runtime);
    let providerCalls = 0;
    const app = appWithProvider(runtime, async (): Promise<ProviderResult> => {
      providerCalls += 1;
      runtime.gBrowser.tabs.splice(1, 1);
      return { ok: true, text: "a: Partial\nb: Partial" };
    });

    // When
    const result = await app.tidy({ trigger: "defaultClick" });

    // Then
    expect(result).toEqual({ status: "partial_failure", missingTabIds: ["b"] });
    expect(providerCalls).toBe(1);
    expect(app.state()).toMatchObject({ status: "partial", canUndo: true });
    expect(groupSummary(runtime)).toEqual([["neurosort-group-partial", ["a"]]]);
  });
});

const qaTabs = () => [
  { id: "a", title: "A", url: "https://qa.example.test/a" },
  { id: "b", title: "B", url: "https://qa.example.test/b" },
  { id: "grouped", title: "Grouped", url: "https://qa.example.test/grouped" },
] as const;

const groupSummary = (runtime: FakeRuntime): readonly (readonly [string, readonly string[]])[] => {
  return runtime.document.querySelectorAll("tab-group").flatMap((element) => {
    if (element instanceof FakeTabGroup) {
      return [[element.id, element.tabs.map((tab) => tab.id)]];
    }
    return [];
  });
};

const missingTab = (): never => {
  throw new MissingFakeTabError();
};

class MissingFakeTabError extends Error {
  public override readonly name = "MissingFakeTabError";

  public constructor() {
    super("Expected fake tab fixture to exist");
  }
}
