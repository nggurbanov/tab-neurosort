export type PlatformPrefValue = boolean | number | string;

export type PlatformPrefType = 32 | 64 | 128 | 0;

export interface PlatformPrefs {
  readonly PREF_STRING: 32;
  readonly PREF_INT: 64;
  readonly PREF_BOOL: 128;
  readonly PREF_INVALID: 0;
  prefHasUserValue(prefName: string): boolean;
  getPrefType(prefName: string): PlatformPrefType;
  getStringPref(prefName: string): string;
  getIntPref(prefName: string): number;
  getBoolPref(prefName: string): boolean;
  setStringPref(prefName: string, value: string): void;
  setIntPref(prefName: string, value: number): void;
  setBoolPref(prefName: string, value: boolean): void;
  clearUserPref(prefName: string): void;
}

export interface PlatformServices {
  readonly prefs: PlatformPrefs;
}

export interface PlatformTab {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly pinned: boolean;
  readonly closing: boolean;
  readonly workspaceId: string | null;
}

export interface PlatformTabGroup extends PlatformElement {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly tabs: readonly PlatformTab[];
  addTabs(tabs: readonly PlatformTab[]): void;
}

export interface PlatformGBrowser {
  readonly tabs: readonly PlatformTab[];
  readonly tabContainer: PlatformElementContainer;
  moveTabToGroup(tab: PlatformTab, group: PlatformTabGroup): void;
  ungroupTab(tab: PlatformTab): void;
  removeTabGroup(group: PlatformTabGroup): void;
}

export interface PlatformElementContainer {
  readonly firstChild: PlatformElement | null;
  appendChild(child: PlatformElement): void;
  insertBefore(child: PlatformElement, referenceChild: PlatformElement | null): void;
  removeChild(child: PlatformElement): void;
  querySelector(selector: string): PlatformElement | null;
  querySelectorAll(selector: string): readonly PlatformElement[];
}

export interface PlatformElement {
  readonly id: string;
  readonly parentNode: PlatformElementContainer | null;
  remove(): void;
}

export interface PlatformDocument {
  readonly body: PlatformElementContainer;
  createXULElement(localName: "tab-group"): PlatformTabGroup;
  querySelector(selector: string): PlatformElement | null;
  querySelectorAll(selector: string): readonly PlatformElement[];
}

export interface PlatformZenWorkspaces {
  readonly activeWorkspace: string | null;
  readonly activeWorkspaceStrip: PlatformElementContainer;
}

export interface PlatformRuntime {
  readonly Services: PlatformServices;
  readonly document: PlatformDocument;
  readonly gBrowser: PlatformGBrowser;
  readonly gZenWorkspaces: PlatformZenWorkspaces;
}
