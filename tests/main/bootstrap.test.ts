import { describe, expect, it } from "vitest";

import { installNeuroSort } from "../../src/main";
import type { NeuroSortApp } from "../../src/runtime/orchestrator";
import { FakeChromeDocument, FakeChromeElement } from "../ui/fakeChromeDom";

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
  readonly runTimers: () => void;
  readonly app: NeuroSortApp;
} => {
  const document = new FakeChromeDocument();
  const tidyCalls: TidyCall[] = [];
  let undoCalls = 0;
  const keyEvents: FakeKeyboardEvent[] = [];
  const timerCallbacks: Array<() => void> = [];
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
      setTimeout: (callback: () => void) => {
        timerCallbacks.push(callback);
      },
      __testApp: app,
    },
    document,
    tidyCalls,
    undoCalls: () => undoCalls,
    keyEvents,
    runTimers: () => {
      [...timerCallbacks].forEach((callback) => {
        callback();
      });
    },
    app,
  };
};

const buttonWithText = (document: FakeChromeDocument, text: string): FakeChromeElement | null => {
  return document.body.querySelectorAll("button").find((button) => button.text() === text) ?? null;
};

const createRuntimeWithMountTargets = (): {
  readonly runtime: Record<string, unknown>;
  readonly separator: FakeChromeElement;
  readonly activeWorkspaceStrip: FakeChromeElement;
  readonly app: NeuroSortApp;
} => {
  const { runtime, document, app } = createRuntime();
  const separator = document.createXULElement("hbox");
  separator.classList.add("pinned-tabs-container-separator");
  const activeWorkspaceStrip = document.createXULElement("vbox");
  document.body.appendChild(separator);
  document.body.appendChild(activeWorkspaceStrip);
  Reflect.set(runtime, "gZenWorkspaces", { activeWorkspace: "work", activeWorkspaceStrip });
  return { runtime, separator, activeWorkspaceStrip, app };
};

describe("NeuroSort browser bootstrap", () => {
  it("Given a Sine browser runtime When NeuroSort installs Then chrome actions call the app surface", async () => {
    // Given
    const { runtime, document, tidyCalls, undoCalls, app } = createRuntime();

    // When
    installNeuroSort(runtime, { createApp: () => app });
    const broom = requireFakeElement(document.body.querySelector(".neurosort-broom"));
    broom.click();
    expect(buttonWithText(document, "Tidy all tabs")).toBeNull();
    broom.dispatch("contextmenu");
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

  it("Given Zen chrome exposes a separator When NeuroSort installs Then the broom mounts in the visible chrome target", () => {
    // Given
    const { runtime, separator, activeWorkspaceStrip, app } = createRuntimeWithMountTargets();

    // When
    installNeuroSort(runtime, { createApp: () => app });

    // Then
    expect(separator.querySelector(".neurosort-broom")).not.toBeNull();
    expect(activeWorkspaceStrip.querySelector(".neurosort-broom")).toBeNull();
  });

  it("Given Zen chrome target appears late When retry timer fires Then the broom moves out of fallback", () => {
    // Given
    const { runtime, document, runTimers, app } = createRuntime();
    const activeWorkspaceStrip = document.createXULElement("vbox");
    document.body.appendChild(activeWorkspaceStrip);
    Reflect.set(runtime, "gZenWorkspaces", { activeWorkspace: "work", activeWorkspaceStrip });

    // When
    installNeuroSort(runtime, { createApp: () => app });
    const fallbackRoot = requireFakeElement(document.body.querySelector(".neurosort-chrome"));
    const separator = document.createXULElement("hbox");
    separator.classList.add("pinned-tabs-container-separator");
    document.body.appendChild(separator);
    runTimers();

    // Then
    expect(fallbackRoot.parentNode).toBe(separator);
    expect(fallbackRoot.classList.has("neurosort-chrome-fallback")).toBe(false);
    expect(separator.querySelector(".neurosort-broom")).not.toBeNull();
    expect(activeWorkspaceStrip.querySelector(".neurosort-broom")).toBeNull();
  });
});

const requireFakeElement = (element: unknown): FakeChromeElement => {
  if (element instanceof FakeChromeElement) {
    return element;
  }
  throw new Error("Expected fake chrome element");
};
