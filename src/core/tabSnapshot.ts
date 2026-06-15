import type { PlatformTab } from "../platform";
import type { TabExclusion, TabSnapshot } from "./types";

export type SnapshotSourceTab = PlatformTab & {
  readonly description?: string;
  readonly folder?: boolean;
  readonly groupId?: string | null;
  readonly parentNode?: object | null;
  readonly splitView?: boolean;
};

export type TabSnapshotOptions = {
  readonly includeDescriptions?: boolean;
  readonly preservePinnedTabs?: boolean;
};

export const collectTabSnapshots = (
  tabs: readonly SnapshotSourceTab[],
  options: TabSnapshotOptions = {},
): readonly TabSnapshot[] => {
  return tabs.map((tab) => createTabSnapshot(tab, options));
};

const createTabSnapshot = (tab: SnapshotSourceTab, options: TabSnapshotOptions): TabSnapshot => {
  const baseSnapshot = {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    domain: parseDomain(tab.url),
    workspaceId: tab.workspaceId,
    pinned: tab.pinned,
    exclusion: getTabExclusion(tab, options),
  };

  const description = getDescription(tab, options);
  if (description === null) {
    return baseSnapshot;
  }

  return { ...baseSnapshot, description };
};

const getTabExclusion = (tab: SnapshotSourceTab, options: TabSnapshotOptions): TabExclusion | null => {
  if (tab.parentNode === null) {
    return { reason: "disconnected" };
  }
  if (tab.closing) {
    return { reason: "closing" };
  }
  if (options.preservePinnedTabs === true && tab.pinned) {
    return { reason: "pinned" };
  }
  if (tab.folder === true) {
    return { reason: "folder" };
  }
  if (tab.splitView === true) {
    return { reason: "splitView" };
  }
  if (typeof tab.groupId === "string" && tab.groupId.trim().length > 0) {
    return { reason: "grouped", groupId: tab.groupId };
  }
  return null;
};

const getDescription = (tab: SnapshotSourceTab, options: TabSnapshotOptions): string | null => {
  if (options.includeDescriptions !== true) {
    return null;
  }
  if (typeof tab.description !== "string") {
    return null;
  }
  const description = tab.description.trim();
  return description.length > 0 ? description : null;
};

const parseDomain = (url: string): string | null => {
  if (url.startsWith("about:")) {
    return "about";
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.length > 0 ? parsedUrl.hostname : null;
  } catch (error) {
    if (error instanceof TypeError) {
      return null;
    }
    throw error;
  }
};
