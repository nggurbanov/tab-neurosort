import { FakeContainer, FakeDocument, FakeMutationObserver, FakeTab, type FakeTabInit, FakeTabGroup } from "./fakeDom";
import { FakePrefs, FakeSinePrefs } from "./fakePrefs";

export interface FakeRuntimeInit {
  readonly tabs?: readonly FakeTabInit[];
  readonly activeWorkspace?: string | null;
}

export class FakeGBrowser {
  readonly tabs: FakeTab[];
  readonly tabContainer = new FakeContainer("tabs");

  constructor(tabs: readonly FakeTabInit[]) {
    this.tabs = tabs.map((tab) => new FakeTab(tab));
    this.tabs.forEach((tab) => {
      this.tabContainer.appendChild(tab);
    });
  }

  moveTabToGroup(tab: FakeTab, group: FakeTabGroup): void {
    group.addTab(tab);
  }

  ungroupTab(tab: FakeTab): void {
    tab.group?.removeTab(tab);
    if (tab.parentNode === null) {
      this.tabContainer.appendChild(tab);
    }
  }

  removeTabGroup(group: FakeTabGroup): void {
    [...group.tabs].forEach((tab) => {
      this.ungroupTab(tab);
    });
    group.remove();
  }
}

export class FakeZenWorkspaces {
  activeWorkspace: string | null;
  readonly activeWorkspaceStrip = new FakeContainer("zen-workspace-strip");

  constructor(activeWorkspace: string | null) {
    this.activeWorkspace = activeWorkspace;
  }

  setActiveWorkspace(workspaceId: string | null): void {
    this.activeWorkspace = workspaceId;
  }
}

export interface FakeRuntime {
  readonly Services: { readonly prefs: FakePrefs };
  readonly document: FakeDocument;
  readonly gBrowser: FakeGBrowser;
  readonly gZenWorkspaces: FakeZenWorkspaces;
  readonly MutationObserver: typeof FakeMutationObserver;
  readonly sinePrefs: FakeSinePrefs;
}

export function createFakeRuntime(init: FakeRuntimeInit = {}): FakeRuntime {
  const prefs = new FakePrefs();
  const document = new FakeDocument();
  const gBrowser = new FakeGBrowser(init.tabs ?? []);
  const gZenWorkspaces = new FakeZenWorkspaces(init.activeWorkspace ?? null);
  document.body.appendChild(gBrowser.tabContainer);
  document.body.appendChild(gZenWorkspaces.activeWorkspaceStrip);
  return {
    Services: { prefs },
    document,
    gBrowser,
    gZenWorkspaces,
    MutationObserver: FakeMutationObserver,
    sinePrefs: new FakeSinePrefs(prefs, "extensions.sine.neurosort"),
  };
}
