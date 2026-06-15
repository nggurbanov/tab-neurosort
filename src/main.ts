import { createAutoTidyController } from "./core/autoTidy";
import { createOperationCoordinator } from "./core/operations";
import { createShortcutMap, getShortcutAction, type KeyboardShortcutEvent } from "./core/shortcuts";
import type { PlatformElementContainer, PlatformPrefs } from "./platform";
import { createNeuroSortApp, type NeuroSortApp } from "./runtime/orchestrator";
import { mountBrowserChrome, type BrowserChromeMount, type BrowserChromeSettings, type BrowserChromeStatus } from "./ui/browserChrome";
import type { ChromeDocument, ChromeElement } from "./ui/dom";

export const NEUROSORT_VERSION = "1.1.14";

type AppFactory = (runtime: unknown) => NeuroSortApp;

type InstallOptions = {
  readonly createApp?: AppFactory;
};

type BrowserRuntime = {
  readonly document: ChromeDocument;
  readonly toolbar: ChromeElement;
  readonly workspaceId: string;
  readonly prefs: PlatformPrefs | null;
  readonly tabs: readonly unknown[];
  readonly tabContainer: PlatformElementContainer | null;
  readonly observer: MutationObserverConstructor | null;
  readonly addKeyListener: ((listener: RuntimeKeyListener) => void) | null;
};

type MutationObserverConstructor = new (callback: () => void) => {
  observe(target: PlatformElementContainer, options: { readonly childList: true }): void;
  disconnect(): void;
};

type RuntimeKeyListener = (event: RuntimeKeyboardEvent) => void;

type RuntimeKeyboardEvent = KeyboardShortcutEvent & {
  readonly preventDefault?: () => void;
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
  });
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

const resolveBrowserRuntime = (runtime: unknown): BrowserRuntime | null => {
  const document = getProperty(runtime, "document");
  const workspace = getProperty(runtime, "gZenWorkspaces");
  const toolbar = getProperty(workspace, "activeWorkspaceStrip");
  const gBrowser = getProperty(runtime, "gBrowser");
  if (!isChromeDocument(document) || !isChromeElement(toolbar)) {
    return null;
  }
  const tabContainer = getProperty(gBrowser, "tabContainer");
  return {
    document,
    toolbar,
    workspaceId: readWorkspaceId(workspace),
    prefs: readPrefs(runtime),
    tabs: readTabs(gBrowser),
    tabContainer: isElementContainer(tabContainer) ? tabContainer : null,
    observer: readObserver(runtime),
    addKeyListener: readKeyListener(runtime, document),
  };
};

const settingsFromPrefs = (prefs: PlatformPrefs | null): BrowserChromeSettings => {
  const provider = readString(prefs, "extensions.neurosort.provider", "disabled") ?? "disabled";
  const prefix = `extensions.neurosort.${provider}`;
  return {
    providerLabel: provider,
    modelLabel: readString(prefs, `${prefix}.model`, "") ?? "",
    endpointLabel: readString(prefs, `${prefix}.endpoint`, "") ?? "",
    apiKey: readString(prefs, `${prefix}.api_key`, "") ?? "",
  };
};

const selectedTabIds = (tabs: readonly unknown[]): readonly string[] => {
  return tabs.filter(isSelectedTab).map((tab) => tab.id);
};

const ungroupedTabCount = (tabs: readonly unknown[], workspaceId: string): number => {
  return tabs.filter((tab) => isCurrentWorkspaceTab(tab, workspaceId) && getProperty(tab, "group") === null).length;
};

const isSelectedTab = (tab: unknown): tab is { readonly id: string } => {
  return typeof getProperty(tab, "id") === "string"
    && (getProperty(tab, "selected") === true || getProperty(tab, "multiselected") === true);
};

const isCurrentWorkspaceTab = (tab: unknown, workspaceId: string): boolean => {
  const tabWorkspace = getProperty(tab, "workspaceId");
  return typeof tabWorkspace !== "string" || tabWorkspace === workspaceId;
};

const readWorkspaceId = (workspace: unknown): string => {
  const activeWorkspace = getProperty(workspace, "activeWorkspace");
  return typeof activeWorkspace === "string" && activeWorkspace.length > 0 ? activeWorkspace : "default";
};

const readPrefs = (runtime: unknown): PlatformPrefs | null => {
  const prefs = getProperty(getProperty(runtime, "Services"), "prefs");
  return isPrefs(prefs) ? prefs : null;
};

const readTabs = (gBrowser: unknown): readonly unknown[] => {
  const tabs = getProperty(gBrowser, "tabs");
  return Array.isArray(tabs) ? tabs : [];
};

const readObserver = (runtime: unknown): MutationObserverConstructor | null => {
  const observer = getProperty(runtime, "MutationObserver") ?? getProperty(globalThis, "MutationObserver");
  return isMutationObserverConstructor(observer) ? observer : null;
};

const readKeyListener = (runtime: unknown, document: ChromeDocument): ((listener: RuntimeKeyListener) => void) | null => {
  const addRuntimeListener = getProperty(runtime, "addEventListener");
  if (typeof addRuntimeListener === "function") {
    return (listener) => {
      addRuntimeListener.call(runtime, "keydown", listener);
    };
  }
  const addDocumentListener = getProperty(document, "addEventListener");
  if (typeof addDocumentListener === "function") {
    return (listener) => {
      addDocumentListener.call(document, "keydown", listener);
    };
  }
  return null;
};

const readString = (prefs: PlatformPrefs | null, name: string, fallback: string | undefined): string | undefined => {
  return prefs !== null && prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_STRING
    ? prefs.getStringPref(name)
    : fallback;
};

const readBool = (prefs: PlatformPrefs | null, name: string, fallback: boolean): boolean => {
  return prefs !== null && prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_BOOL
    ? prefs.getBoolPref(name)
    : fallback;
};

const readInt = (prefs: PlatformPrefs | null, name: string, fallback: number): number => {
  return prefs !== null && prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_INT
    ? prefs.getIntPref(name)
    : fallback;
};

const isChromeDocument = (value: unknown): value is ChromeDocument => {
  return typeof getProperty(value, "createElement") === "function"
    && typeof getProperty(value, "createTextNode") === "function";
};

const isChromeElement = (value: unknown): value is ChromeElement => {
  return typeof getProperty(value, "appendChild") === "function"
    && typeof getProperty(value, "querySelector") === "function"
    && typeof getProperty(value, "classList") === "object";
};

const isElementContainer = (value: unknown): value is PlatformElementContainer => {
  return typeof getProperty(value, "appendChild") === "function"
    && typeof getProperty(value, "querySelectorAll") === "function";
};

const isPrefs = (value: unknown): value is PlatformPrefs => {
  return typeof getProperty(value, "PREF_STRING") === "number"
    && typeof getProperty(value, "prefHasUserValue") === "function"
    && typeof getProperty(value, "getPrefType") === "function";
};

const isMutationObserverConstructor = (value: unknown): value is MutationObserverConstructor => {
  return typeof value === "function"
    && typeof getProperty(getProperty(value, "prototype"), "observe") === "function"
    && typeof getProperty(getProperty(value, "prototype"), "disconnect") === "function";
};

const getProperty = (value: unknown, key: string): unknown => {
  return (typeof value === "object" && value !== null) || typeof value === "function"
    ? Reflect.get(value, key)
    : undefined;
};
