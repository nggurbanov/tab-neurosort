import type { KeyboardShortcutEvent } from "./core/shortcuts";
import type { PlatformElementContainer, PlatformPrefs } from "./platform";
import type { BrowserChromeSettings } from "./ui/browserChrome";
import type { ChromeDocument, ChromeElement } from "./ui/dom";

export type BrowserRuntime = {
  readonly document: ChromeDocument;
  readonly toolbar: ChromeElement;
  readonly toolbarKind: ChromeToolbarKind;
  readonly workspaceId: string;
  readonly prefs: PlatformPrefs | null;
  readonly tabs: readonly unknown[];
  readonly tabContainer: PlatformElementContainer | null;
  readonly observer: MutationObserverConstructor | null;
  readonly addKeyListener: ((listener: RuntimeKeyListener) => void) | null;
  readonly scheduleTimeout: TimeoutScheduler | null;
};

export type MutationObserverConstructor = new (callback: () => void) => {
  observe(target: PlatformElementContainer, options: { readonly childList: true }): void;
  disconnect(): void;
};

export type ChromeToolbarKind = "preferred" | "fallback";

export type TimeoutScheduler = (callback: () => void, delayMs: number) => void;

export type RuntimeKeyListener = (event: RuntimeKeyboardEvent) => void;

export type RuntimeKeyboardEvent = KeyboardShortcutEvent & {
  readonly preventDefault?: () => void;
};

const chromeMountSelectors = [
  ".pinned-tabs-container-separator",
  "#zen-workspaces-button",
  "#zen-sidebar-top-buttons-customization-target",
  ".zen-sidebar-top",
  "#zen-sidebar",
  ".zen-vertical-tabs",
  "#TabsToolbar",
  "#tabbrowser-tabs",
  "#navigator-toolbox",
  "tabbox",
] as const;

export const resolveBrowserRuntime = (runtime: unknown): BrowserRuntime | null => {
  const document = getProperty(runtime, "document");
  const workspace = getProperty(runtime, "gZenWorkspaces");
  const toolbar = isChromeDocument(document) ? resolveChromeToolbar(document) : null;
  const gBrowser = getProperty(runtime, "gBrowser");
  if (!isChromeDocument(document) || toolbar === null) {
    return null;
  }
  const tabContainer = getProperty(gBrowser, "tabContainer");
  return {
    document,
    toolbar: toolbar.element,
    toolbarKind: toolbar.kind,
    workspaceId: readWorkspaceId(workspace),
    prefs: readPrefs(runtime),
    tabs: readTabs(gBrowser),
    tabContainer: isElementContainer(tabContainer) ? tabContainer : null,
    observer: readObserver(runtime),
    addKeyListener: readKeyListener(runtime, document),
    scheduleTimeout: readTimeoutScheduler(runtime),
  };
};

export const settingsFromPrefs = (prefs: PlatformPrefs | null): BrowserChromeSettings => {
  const provider = readString(prefs, "extensions.neurosort.provider", "disabled") ?? "disabled";
  const prefix = `extensions.neurosort.${provider}`;
  return {
    providerLabel: provider,
    modelLabel: readString(prefs, `${prefix}.model`, "") ?? "",
    endpointLabel: readString(prefs, `${prefix}.endpoint`, "") ?? "",
    apiKey: readString(prefs, `${prefix}.api_key`, "") ?? "",
  };
};

export const selectedTabIds = (tabs: readonly unknown[]): readonly string[] => {
  return tabs.filter(isSelectedTab).map((tab) => tab.id);
};

export const ungroupedTabCount = (tabs: readonly unknown[], workspaceId: string): number => {
  return tabs.filter((tab) => isCurrentWorkspaceTab(tab, workspaceId) && getProperty(tab, "group") === null).length;
};

export const readString = (prefs: PlatformPrefs | null, name: string, fallback: string | undefined): string | undefined => {
  return prefs !== null && prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_STRING
    ? prefs.getStringPref(name)
    : fallback;
};

export const readBool = (prefs: PlatformPrefs | null, name: string, fallback: boolean): boolean => {
  return prefs !== null && prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_BOOL
    ? prefs.getBoolPref(name)
    : fallback;
};

export const readInt = (prefs: PlatformPrefs | null, name: string, fallback: number): number => {
  return prefs !== null && prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_INT
    ? prefs.getIntPref(name)
    : fallback;
};

export const resolvePreferredChromeToolbar = (document: ChromeDocument): ChromeElement | null => {
  for (const selector of chromeMountSelectors) {
    const candidate = document.querySelector(selector);
    if (candidate !== null) {
      return candidate;
    }
  }
  return null;
};

const chromeFallbackSelectors = ["#browser", "#appcontent", "#main-window"] as const;

const resolveChromeToolbar = (document: ChromeDocument): { readonly element: ChromeElement; readonly kind: ChromeToolbarKind } => {
  const preferred = resolvePreferredChromeToolbar(document);
  if (preferred !== null) {
    return { element: preferred, kind: "preferred" };
  }
  for (const selector of chromeFallbackSelectors) {
    const candidate = document.querySelector(selector);
    if (candidate !== null) {
      return { element: candidate, kind: "fallback" };
    }
  }
  return { element: document.body, kind: "fallback" };
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

const readTimeoutScheduler = (runtime: unknown): TimeoutScheduler | null => {
  const runtimeTimer = getProperty(runtime, "setTimeout");
  if (typeof runtimeTimer === "function") {
    return (callback, delayMs) => {
      void runtimeTimer.call(runtime, callback, delayMs);
    };
  }
  const globalTimer = getProperty(globalThis, "setTimeout");
  if (typeof globalTimer === "function") {
    return (callback, delayMs) => {
      void globalTimer.call(globalThis, callback, delayMs);
    };
  }
  return null;
};

const isSelectedTab = (tab: unknown): tab is { readonly id: string } => {
  return typeof getProperty(tab, "id") === "string"
    && (getProperty(tab, "selected") === true || getProperty(tab, "multiselected") === true);
};

const isCurrentWorkspaceTab = (tab: unknown, workspaceId: string): boolean => {
  const tabWorkspace = getProperty(tab, "workspaceId");
  return typeof tabWorkspace !== "string" || tabWorkspace === workspaceId;
};

const isChromeDocument = (value: unknown): value is ChromeDocument => {
  return typeof getProperty(value, "createElement") === "function"
    && typeof getProperty(value, "createTextNode") === "function"
    && typeof getProperty(value, "querySelector") === "function"
    && typeof getProperty(value, "querySelectorAll") === "function";
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
