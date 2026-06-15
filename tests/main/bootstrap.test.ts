import { describe, expect, it } from "vitest";

import { installNeuroSort } from "../../src/main";
import type { NeuroSortApp } from "../../src/runtime/orchestrator";
import { FakeChromeDocument, type FakeChromeElement } from "../ui/fakeChromeDom";

type TidyCall = {
  readonly trigger: string;
  readonly selectedTabIds?: readonly string[];
};

class FakeKeyboardEvent {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly target?: unknown;
  defaultPrevented = false;

  constructor(key: string, modifiers: { readonly altKey?: boolean; readonly shiftKey?: boolean } = {}) {
    this.key = key;
    this.altKey = modifiers.altKey ?? false;
    this.shiftKey = modifiers.shiftKey ?? false;
    this.ctrlKey = false;
    this.metaKey = false;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class FakeMutationObserver {
  constructor(private readonly callback: () => void) {}

  observe(): void {
    this.callback();
  }

  disconnect(): void {}
}

const createRuntime = (): {
  readonly runtime: Record<string, unknown>;
  readonly document: FakeChromeDocument;
  readonly tidyCalls: readonly TidyCall[];
  readonly undoCalls: () => number;
  readonly keyEvents: readonly FakeKeyboardEvent[];
  readonly app: NeuroSortApp;
} => {
  const document = new FakeChromeDocument();
  const tidyCalls: TidyCall[] = [];
  let undoCalls = 0;
  const keyEvents: FakeKeyboardEvent[] = [];
  const app: NeuroSortApp = {
    tidy: async (request) => {
      tidyCalls.push(request);
      return { status: "empty" };
    },
    undo: async () => {
      undoCalls += 1;
      return { status: "no_undo" };
    },
    state: () => ({ status: "idle", message: "Ready", canUndo: true }),
  };

  return {
    runtime: {
      document,
      gBrowser: {
        tabs: [
          { id: "a", title: "A", url: "https://a.test", pinned: false, closing: false, workspaceId: "work", selected: true, group: null },
          { id: "b", title: "B", url: "https://b.test", pinned: false, closing: false, workspaceId: "work", group: null },
        ],
        tabContainer: document.body,
      },
      gZenWorkspaces: { activeWorkspace: "work", activeWorkspaceStrip: document.body },
      Services: {
        prefs: {
          PREF_STRING: 32,
          PREF_INT: 64,
          PREF_BOOL: 128,
          PREF_INVALID: 0,
          prefHasUserValue: (name: string) => name === "extensions.neurosort.auto_tidy" || name === "extensions.neurosort.auto_tidy_threshold",
          getPrefType: (name: string) => {
            if (name === "extensions.neurosort.auto_tidy") {
              return 128;
            }
            return name === "extensions.neurosort.auto_tidy_threshold" ? 64 : 0;
          },
          getStringPref: () => "",
          getIntPref: () => 2,
          getBoolPref: () => true,
        },
      },
      MutationObserver: FakeMutationObserver,
      addEventListener: (name: string, listener: (event: FakeKeyboardEvent) => void) => {
        if (name === "keydown") {
          const tidy = new FakeKeyboardEvent("t", { altKey: true, shiftKey: true });
          const undo = new FakeKeyboardEvent("z", { altKey: true, shiftKey: true });
          keyEvents.push(tidy, undo);
          listener(tidy);
          listener(undo);
        }
      },
      __testApp: app,
    },
    document,
    tidyCalls,
    undoCalls: () => undoCalls,
    keyEvents,
    app,
  };
};

const buttonWithText = (document: FakeChromeDocument, text: string): FakeChromeElement | null => {
  return document.body.querySelectorAll("button").find((button) => button.text() === text) ?? null;
};

describe("NeuroSort browser bootstrap", () => {
  it("Given a Sine browser runtime When NeuroSort installs Then chrome actions call the app surface", async () => {
    // Given
    const { runtime, document, tidyCalls, undoCalls, app } = createRuntime();

    // When
    installNeuroSort(runtime, { createApp: () => app });
    document.body.querySelector(".neurosort-broom")?.click();
    buttonWithText(document, "Tidy all tabs")?.click();
    buttonWithText(document, "Tidy selected tabs")?.click();
    buttonWithText(document, "Undo last tidy")?.click();
    await Promise.resolve();

    // Then
    expect(document.body.querySelector(".neurosort-chrome")).not.toBeNull();
    expect(tidyCalls).toEqual([
      { trigger: "auto" },
      { trigger: "shortcut" },
      { trigger: "defaultClick" },
      { trigger: "menu" },
      { trigger: "selected", selectedTabIds: ["a"] },
    ]);
    expect(undoCalls()).toBe(2);
  });

  it("Given shortcuts are installed When keydown fires Then default browser handling is prevented", () => {
    // Given
    const { runtime, keyEvents, app } = createRuntime();

    // When
    installNeuroSort(runtime, { createApp: () => app });

    // Then
    expect(keyEvents.map((event) => event.defaultPrevented)).toEqual([true, true]);
  });
});
