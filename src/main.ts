import {
  readBool,
  readInt,
  readString,
  resolveBrowserRuntime,
  resolvePreferredChromeToolbar,
  selectedTabIds,
  settingsFromPrefs,
  ungroupedTabCount,
  type BrowserRuntime,
} from "./browserRuntime";
import { createAutoTidyController } from "./core/autoTidy";
import { createOperationCoordinator } from "./core/operations";
import { createShortcutMap, getShortcutAction } from "./core/shortcuts";
import { createNeuroSortApp, type NeuroSortApp } from "./runtime/orchestrator";
import { mountBrowserChrome, type BrowserChromeMount, type BrowserChromeStatus } from "./ui/browserChrome";

export const NEUROSORT_VERSION = "1.1.20";

type AppFactory = (runtime: unknown) => NeuroSortApp;

type InstallOptions = {
  readonly createApp?: AppFactory;
};

export const createBootstrapMessage = (): string => {
  return `NeuroSort ${NEUROSORT_VERSION} toolchain bootstrap loaded`;
};

export const installNeuroSort = (runtime: unknown, options: InstallOptions = {}): NeuroSortApp => {
  const app = (options.createApp ?? createNeuroSortApp)(runtime);
  Reflect.set(globalThis, "NeuroSortApp", app);
  const browser = resolveBrowserRuntime(runtime);
  if (browser !== null) {
    wireBrowserSurface(app, browser);
  }
  return app;
};

export const bootstrap = (): void => {
  installNeuroSort(globalThis);
  globalThis.console.info(createBootstrapMessage());
};

const wireBrowserSurface = (app: NeuroSortApp, browser: BrowserRuntime): BrowserChromeMount => {
  const mount = mountBrowserChrome({
    document: browser.document,
    toolbar: browser.toolbar,
    workspaceId: browser.workspaceId,
    actions: {
      tidyUngrouped: () => void runTidy(app, mount, { trigger: "defaultClick" }),
      tidyAll: () => void runTidy(app, mount, { trigger: "menu" }),
      tidySelected: () => void runTidy(app, mount, { trigger: "selected", selectedTabIds: selectedTabIds(browser.tabs) }),
      undoLastTidy: () => void runUndo(app, mount),
      openSettings: () => mount.showToast("Open NeuroSort settings from Sine preferences."),
      saveQuickSettings: () => mount.showToast("Settings are managed by Sine preferences."),
    },
    settings: settingsFromPrefs(browser.prefs),
    status: statusFromApp(app),
    toolbarKind: browser.toolbarKind,
  });
  installChromeRetargeting(mount, browser);
  installAutoTidy(app, mount, browser);
  installShortcuts(app, mount, browser);
  return mount;
};

const runTidy = async (app: NeuroSortApp, mount: BrowserChromeMount, request: Parameters<NeuroSortApp["tidy"]>[0]): Promise<void> => {
  mount.update({ kind: "busy", message: "Tidying tabs" });
  const result = await app.tidy(request);
  mount.update(statusFromApp(app));
  mount.showToast(result.status === "tidied" ? "Tabs tidied" : app.state().message);
};

const runUndo = async (app: NeuroSortApp, mount: BrowserChromeMount): Promise<void> => {
  mount.update({ kind: "busy", message: "Restoring tabs" });
  const result = await app.undo();
  mount.update(statusFromApp(app));
  mount.showToast(result.status === "undone" ? "Undo complete" : app.state().message);
};

const installShortcuts = (app: NeuroSortApp, mount: BrowserChromeMount, browser: BrowserRuntime): void => {
  if (browser.addKeyListener === null) {
    return;
  }
  const tidyShortcut = readString(browser.prefs, "extensions.neurosort.keyboard_shortcut", undefined);
  const shortcuts = createShortcutMap(tidyShortcut === undefined ? {} : { tidy: tidyShortcut });
  browser.addKeyListener((event) => {
    const action = getShortcutAction(event, shortcuts);
    if (action === null) {
      return;
    }
    event.preventDefault?.();
    if (action === "tidy") {
      void runTidy(app, mount, { trigger: "shortcut" });
      return;
    }
    void runUndo(app, mount);
  });
};

const installAutoTidy = (app: NeuroSortApp, mount: BrowserChromeMount, browser: BrowserRuntime): void => {
  if (browser.observer === null || browser.tabContainer === null) {
    return;
  }
  const controller = createAutoTidyController(
    {
      enabled: readBool(browser.prefs, "extensions.neurosort.auto_tidy", false),
      threshold: readInt(browser.prefs, "extensions.neurosort.auto_tidy_threshold", 6),
      cooldownMs: 30_000,
    },
    createOperationCoordinator(),
    { now: () => Date.now() },
  );
  const observer = new browser.observer(() => {
    void controller.run(ungroupedTabCount(browser.tabs, browser.workspaceId), () => runTidy(app, mount, { trigger: "auto" }));
  });
  observer.observe(browser.tabContainer, { childList: true });
};

const chromeMountRetryDelays = [500, 1_500, 3_000] as const;

const installChromeRetargeting = (mount: BrowserChromeMount, browser: BrowserRuntime): void => {
  const scheduleTimeout = browser.scheduleTimeout;
  if (browser.toolbarKind === "preferred" || scheduleTimeout === null) {
    return;
  }
  chromeMountRetryDelays.forEach((delayMs) => {
    scheduleTimeout(() => {
      const target = resolvePreferredChromeToolbar(browser.document);
      if (target === null || mount.root.parentNode === target) {
        return;
      }
      target.appendChild(mount.root);
      mount.root.classList.remove("neurosort-chrome-fallback");
    }, delayMs);
  });
};

const statusFromApp = (app: NeuroSortApp): BrowserChromeStatus => {
  const state = app.state();
  switch (state.status) {
    case "idle":
    case "partial":
      return { kind: "ready", message: state.message, badgeText: state.canUndo ? "Undo" : "" };
    case "running":
      return { kind: "busy", message: state.message };
    case "blocked":
      return { kind: "setup", message: state.message };
    case "failed":
      return { kind: "error", message: state.message, actionLabel: "Open settings" };
  }
};
