import { describe, expect, it } from "vitest";

import type { ProviderResult } from "../../src/providers";
import { createNeuroSortApp, type NeuroSortApp, type NeuroSortProviderCompletion } from "../../src/runtime/orchestrator";
import { FakeTabGroup } from "../fakes/fakeDom";
import { createFakeRuntime, type FakeRuntime } from "../fakes/fakeRuntime";

const providerPrefs = (runtime: FakeRuntime): void => {
  runtime.Services.prefs.setStringPref("extensions.neurosort.provider", "openai");
  runtime.Services.prefs.setBoolPref("extensions.neurosort.data_consent", true);
  runtime.Services.prefs.setStringPref("extensions.neurosort.openai.endpoint", "https://api.example.test/v1");
  runtime.Services.prefs.setStringPref("extensions.neurosort.openai.api_key", "sk-test");
  runtime.Services.prefs.setStringPref("extensions.neurosort.openai.model", "gpt-tabs");
};

const minGroupSize = (runtime: FakeRuntime, value: number): void => {
  runtime.Services.prefs.setIntPref("extensions.neurosort.min_group_size", value);
};

const appWithProvider = (
  runtime: FakeRuntime,
  provider: NeuroSortProviderCompletion,
): NeuroSortApp => createNeuroSortApp(runtime, { provider });

const providerText = (text: string): NeuroSortProviderCompletion => async () => ({ ok: true, text });

describe("NeuroSort orchestrator", () => {
  it("Given disabled provider When default tidy runs Then it is denied before provider fetch", async () => {
    // Given
    const runtime = createFakeRuntime({ tabs: [{ id: "a", title: "A", url: "https://a.test" }] });
    let calls = 0;
    const app = appWithProvider(runtime, async () => {
      calls += 1;
      return { ok: true, text: "" };
    });

    // When
    const result = await app.tidy({ trigger: "defaultClick" });

    // Then
    expect(result).toEqual({ status: "provider_denied", reason: "provider_disabled" });
    expect(calls).toBe(0);
    expect(app.state()).toMatchObject({ status: "blocked", canUndo: false });
  });

  it("Given consent is missing When tidy runs Then provider fetch is denied", async () => {
    // Given
    const runtime = createFakeRuntime({ tabs: [{ id: "a", title: "A", url: "https://a.test" }] });
    runtime.Services.prefs.setStringPref("extensions.neurosort.provider", "openai");
    const app = appWithProvider(runtime, async () => ({ ok: true, text: "" }));

    // When
    const result = await app.tidy({ trigger: "defaultClick" });

    // Then
    expect(result).toEqual({ status: "provider_denied", reason: "consent_required" });
  });

  it("Given grouped and ungrouped tabs When default click tidies Then only ungrouped tabs move", async () => {
    // Given
    const runtime = createFakeRuntime({
      tabs: [
        { id: "a", title: "A", url: "https://same.test/a" },
        { id: "b", title: "B", url: "https://same.test/b" },
        { id: "grouped", title: "Grouped", url: "https://same.test/c" },
      ],
    });
    providerPrefs(runtime);
    const existing = runtime.document.createXULElement("tab-group");
    existing.id = "existing";
    runtime.gBrowser.tabContainer.appendChild(existing);
    runtime.gBrowser.moveTabToGroup(runtime.gBrowser.tabs[2] ?? missingTab(), existing);
    const app = appWithProvider(runtime, providerText("a: Work\nb: Work\ngrouped: Work"));

    // When
    const result = await app.tidy({ trigger: "defaultClick" });

    // Then
    expect(result.status).toBe("tidied");
    expect(groupSummary(runtime)).toEqual([
      ["existing", ["grouped"]],
      ["neurosort-group-work", ["a", "b"]],
    ]);
  });

  it("Given grouped tabs When menu tidy runs Then explicit scope includes grouped tabs", async () => {
    // Given
    const runtime = createFakeRuntime({
      tabs: [
        { id: "a", title: "A", url: "https://same.test/a" },
        { id: "grouped", title: "Grouped", url: "https://same.test/c" },
      ],
    });
    providerPrefs(runtime);
    const existing = runtime.document.createXULElement("tab-group");
    existing.id = "existing";
    runtime.gBrowser.tabContainer.appendChild(existing);
    runtime.gBrowser.moveTabToGroup(runtime.gBrowser.tabs[1] ?? missingTab(), existing);
    const app = appWithProvider(runtime, providerText("a: Work\ngrouped: Work"));

    // When
    const result = await app.tidy({ trigger: "menu" });

    // Then
    expect(result.status).toBe("tidied");
    expect(groupSummary(runtime)).toContainEqual([
      "neurosort-group-work",
      ["a", "grouped"],
    ]);
  });

  it("Given selected tabs When selected tidy runs Then unselected tabs never join the plan", async () => {
    // Given
    const runtime = createFakeRuntime({
      tabs: [
        { id: "selected", title: "Selected", url: "https://same.test/a" },
        { id: "other", title: "Other", url: "https://same.test/b" },
      ],
    });
    providerPrefs(runtime);
    minGroupSize(runtime, 1);
    const app = appWithProvider(runtime, providerText("selected: Solo\nother: Solo"));

    // When
    const result = await app.tidy({ trigger: "selected", selectedTabIds: ["selected"] });

    // Then
    expect(result.status).toBe("tidied");
    expect(groupSummary(runtime)).toEqual([
      ["neurosort-group-solo", ["selected"]],
    ]);
  });

  it("Given provider failure When tidy runs Then no mutation is applied", async () => {
    // Given
    const runtime = createFakeRuntime({ tabs: [{ id: "a", title: "A", url: "https://a.test" }] });
    providerPrefs(runtime);
    const app = appWithProvider(runtime, async (): Promise<ProviderResult> => ({ ok: false, reason: "provider_http_error", status: 500 }));

    // When
    const result = await app.tidy({ trigger: "defaultClick" });

    // Then
    expect(result).toEqual({ status: "provider_failed", reason: "provider_http_error" });
    expect(runtime.document.querySelectorAll("tab-group")).toEqual([]);
  });

  it("Given a tab disappears during tidy When mutations apply Then partial failure is reported", async () => {
    // Given
    const runtime = createFakeRuntime({
      tabs: [
        { id: "a", title: "A", url: "https://same.test/a" },
        { id: "b", title: "B", url: "https://same.test/b" },
      ],
    });
    providerPrefs(runtime);
    const app = appWithProvider(runtime, async () => {
      runtime.gBrowser.tabs.splice(1, 1);
      return { ok: true, text: "a: Work\nb: Work" };
    });

    // When
    const result = await app.tidy({ trigger: "defaultClick" });

    // Then
    expect(result).toEqual({ status: "partial_failure", missingTabIds: ["b"] });
    expect(app.state()).toMatchObject({ status: "partial", canUndo: true });
  });

  it("Given a completed tidy When undo runs Then original grouping is restored", async () => {
    // Given
    const runtime = createFakeRuntime({
      tabs: [
        { id: "a", title: "A", url: "https://same.test/a" },
        { id: "b", title: "B", url: "https://same.test/b" },
      ],
    });
    providerPrefs(runtime);
    const app = appWithProvider(runtime, providerText("a: Work\nb: Work"));
    await app.tidy({ trigger: "defaultClick" });

    // When
    const undo = await app.undo();

    // Then
    expect(undo.status).toBe("undone");
    expect(runtime.document.querySelectorAll("tab-group")).toEqual([]);
    expect(runtime.gBrowser.tabs.map((tab) => tab.group?.id ?? null)).toEqual([null, null]);
    expect(app.state()).toMatchObject({ status: "idle", canUndo: false });
  });
});

function missingTab(): never {
  throw new Error("missing fake tab");
}

const groupSummary = (runtime: FakeRuntime): readonly (readonly [string, readonly string[]])[] => {
  return runtime.document.querySelectorAll("tab-group").flatMap((element) => {
    if (element instanceof FakeTabGroup) {
      return [[element.id, element.tabs.map((tab) => tab.id)]];
    }
    return [];
  });
};
