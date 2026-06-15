import { collectTabSnapshots, type TabSnapshotOptions } from "../core/tabSnapshot";
import type {
  PlatformDocument,
  PlatformElementContainer,
  PlatformGBrowser,
  PlatformTab,
  PlatformTabGroup,
} from "../platform";
import type { TabSnapshot } from "../core/types";

export type ZenAdapterErrorCode = "malformed_input";

export type ZenAdapterError = {
  readonly code: ZenAdapterErrorCode;
  readonly missingApi: string;
  readonly message: string;
  readonly setupHint: string;
};

export type ZenAdapterResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ZenAdapterError };

export type ZenAdapter = {
  readonly activeWorkspaceId: string | null;
  readonly activeWorkspaceStrip: PlatformElementContainer;
  readonly document: PlatformDocument;
  readonly gBrowser: ZenGBrowser;
  readonly tabs: readonly PlatformTab[];
  readonly tabGroups: readonly PlatformTabGroup[];
  createGroup(label: string, color?: string): PlatformTabGroup;
  readonly moveTabToGroup: ((tab: PlatformTab, group: PlatformTabGroup) => void) | undefined;
  ungroupTab(tab: PlatformTab): void;
  removeTabGroup(group: PlatformTabGroup): void;
};

export type ZenGBrowser = PlatformGBrowser & {
  readonly tabGroups?: readonly PlatformTabGroup[];
};

export const resolveZenAdapter = (runtime: unknown): ZenAdapterResult<ZenAdapter> => {
  const gBrowser = getProperty(runtime, "gBrowser");
  if (!isZenGBrowser(gBrowser)) {
    return missingCapability("gBrowser.moveTabToGroup");
  }

  const gZenWorkspaces = getProperty(runtime, "gZenWorkspaces");
  if (!isZenWorkspaces(gZenWorkspaces)) {
    return missingCapability("gZenWorkspaces.activeWorkspace");
  }

  const document = getProperty(runtime, "document");
  if (!isPlatformDocument(document)) {
    return missingCapability("document.createXULElement");
  }

  return {
    ok: true,
    value: {
      activeWorkspaceId: gZenWorkspaces.activeWorkspace,
      activeWorkspaceStrip: gZenWorkspaces.activeWorkspaceStrip,
      document,
      gBrowser,
      tabs: gBrowser.tabs,
      tabGroups: getTabGroups(gBrowser, document),
      createGroup: (label, color) => createGroup(document, label, color),
      moveTabToGroup: (tab, group) => gBrowser.moveTabToGroup(tab, group),
      ungroupTab: (tab) => gBrowser.ungroupTab(tab),
      removeTabGroup: (group) => gBrowser.removeTabGroup(group),
    },
  };
};

export const collectCurrentWorkspaceSnapshots = (
  adapter: ZenAdapter,
  options: TabSnapshotOptions = {},
): readonly TabSnapshot[] => {
  const activeWorkspaceTabs = adapter.tabs.filter((tab) => {
    return adapter.activeWorkspaceId === null || tab.workspaceId === adapter.activeWorkspaceId;
  });
  return collectTabSnapshots(activeWorkspaceTabs.map((tab) => withGroupExclusion(tab, adapter.tabGroups)), options);
};

export const missingCapability = (missingApi: string): ZenAdapterResult<never> => ({
  ok: false,
  error: {
    code: "malformed_input",
    missingApi,
    message: `Zen tab group API is unavailable: missing ${missingApi}.`,
    setupHint: "Update Zen Browser/Sine or enable a build with native tab group APIs.",
  },
});

const createGroup = (document: PlatformDocument, label: string, color = "blue"): PlatformTabGroup => {
  const group = document.createXULElement("tab-group");
  Reflect.set(group, "id", `neurosort-group-${slugify(label)}`);
  Reflect.set(group, "label", label);
  Reflect.set(group, "color", color);
  return group;
};

const getTabGroups = (gBrowser: ZenGBrowser, document: PlatformDocument): readonly PlatformTabGroup[] => {
  if (Array.isArray(gBrowser.tabGroups)) {
    return gBrowser.tabGroups;
  }
  return document.querySelectorAll("tab-group").filter(isPlatformTabGroup);
};

const withGroupExclusion = (tab: PlatformTab, groups: readonly PlatformTabGroup[]): PlatformTab & { readonly groupId?: string } => {
  const group = groups.find((candidate) => candidate.tabs.some((groupedTab) => groupedTab.id === tab.id));
  if (group === undefined) {
    return tab;
  }
  return { ...tab, groupId: group.id };
};

const isZenGBrowser = (value: unknown): value is ZenGBrowser => {
  return (
    hasTabArray(value, "tabs") &&
    isElementContainer(getProperty(value, "tabContainer")) &&
    isCallable(getProperty(value, "moveTabToGroup")) &&
    isCallable(getProperty(value, "ungroupTab")) &&
    isCallable(getProperty(value, "removeTabGroup"))
  );
};

const isZenWorkspaces = (
  value: unknown,
): value is { readonly activeWorkspace: string | null; readonly activeWorkspaceStrip: PlatformElementContainer } => {
  const activeWorkspace = getProperty(value, "activeWorkspace");
  return (
    (typeof activeWorkspace === "string" || activeWorkspace === null) &&
    isElementContainer(getProperty(value, "activeWorkspaceStrip"))
  );
};

const isPlatformDocument = (value: unknown): value is PlatformDocument => {
  return (
    isCallable(getProperty(value, "createXULElement")) &&
    isCallable(getProperty(value, "querySelector")) &&
    isCallable(getProperty(value, "querySelectorAll")) &&
    isElementContainer(getProperty(value, "body"))
  );
};

const isPlatformTabGroup = (value: unknown): value is PlatformTabGroup => {
  return (
    typeof getProperty(value, "id") === "string" &&
    typeof getProperty(value, "label") === "string" &&
    typeof getProperty(value, "color") === "string" &&
    hasTabArray(value, "tabs") &&
    isCallable(getProperty(value, "addTabs"))
  );
};

const hasTabArray = (value: unknown, key: string): boolean => {
  const tabs = getProperty(value, key);
  return Array.isArray(tabs) && tabs.every(isPlatformTab);
};

const isPlatformTab = (value: unknown): value is PlatformTab => {
  const workspaceId = getProperty(value, "workspaceId");
  return (
    typeof getProperty(value, "id") === "string" &&
    typeof getProperty(value, "title") === "string" &&
    typeof getProperty(value, "url") === "string" &&
    typeof getProperty(value, "pinned") === "boolean" &&
    typeof getProperty(value, "closing") === "boolean" &&
    (typeof workspaceId === "string" || workspaceId === null)
  );
};

const isElementContainer = (value: unknown): value is PlatformElementContainer => {
  return (
    isCallable(getProperty(value, "appendChild")) &&
    isCallable(getProperty(value, "insertBefore")) &&
    isCallable(getProperty(value, "removeChild")) &&
    isCallable(getProperty(value, "querySelector")) &&
    isCallable(getProperty(value, "querySelectorAll"))
  );
};

const isCallable = (value: unknown): value is (...args: readonly unknown[]) => unknown => {
  return typeof value === "function";
};

const getProperty = (value: unknown, key: string): unknown => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return Reflect.get(value, key);
};

const slugify = (label: string): string => {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug.length > 0 ? slug : "untitled";
};
