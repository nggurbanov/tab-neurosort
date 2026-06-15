import type { PlatformElement, PlatformElementContainer, PlatformTab, PlatformTabGroup } from "../../src/platform";

export interface FakeMutationRecord {
  readonly type: "childList";
  readonly target: FakeContainer;
  readonly addedNodes: readonly FakeElement[];
  readonly removedNodes: readonly FakeElement[];
}

export type FakeMutationCallback = (mutations: readonly FakeMutationRecord[]) => void;

export class FakeMutationObserver {
  private readonly records: FakeMutationRecord[] = [];
  private observedTarget: FakeContainer | null = null;

  constructor(private readonly callback: FakeMutationCallback) {}

  observe(target: FakeContainer, options: { readonly childList?: boolean }): void {
    if (options.childList !== true) {
      return;
    }
    this.disconnect();
    this.observedTarget = target;
    target.addObserver(this);
  }

  disconnect(): void {
    if (this.observedTarget === null) {
      return;
    }
    this.observedTarget.removeObserver(this);
    this.observedTarget = null;
  }

  takeRecords(): readonly FakeMutationRecord[] {
    const records = [...this.records];
    this.records.length = 0;
    return records;
  }

  deliver(record: FakeMutationRecord): void {
    this.records.push(record);
    this.callback([record]);
  }
}

export class FakeElement implements PlatformElement {
  id = "";
  parentNode: FakeContainer | null = null;

  constructor(readonly tagName: string) {}

  remove(): void {
    this.parentNode?.removeChild(this);
  }
}

export class FakeContainer extends FakeElement implements PlatformElementContainer {
  private readonly children: FakeElement[] = [];
  private readonly observers = new Set<FakeMutationObserver>();

  get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  appendChild(child: FakeElement): void {
    this.insertBefore(child, null);
  }

  insertBefore(child: FakeElement, referenceChild: FakeElement | null): void {
    child.parentNode?.removeChild(child);
    const referenceIndex = referenceChild === null ? -1 : this.children.indexOf(referenceChild);
    if (referenceIndex === -1) {
      this.children.push(child);
    } else {
      this.children.splice(referenceIndex, 0, child);
    }
    child.parentNode = this;
    this.notify({ type: "childList", target: this, addedNodes: [child], removedNodes: [] });
  }

  removeChild(child: FakeElement): void {
    const childIndex = this.children.indexOf(child);
    if (childIndex === -1) {
      return;
    }
    this.children.splice(childIndex, 1);
    child.parentNode = null;
    this.notify({ type: "childList", target: this, addedNodes: [], removedNodes: [child] });
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): readonly FakeElement[] {
    const matched: FakeElement[] = [];
    this.visit((child) => {
      if (child.tagName === selector || selector === `#${child.id}`) {
        matched.push(child);
      }
    });
    return matched;
  }

  addObserver(observer: FakeMutationObserver): void {
    this.observers.add(observer);
  }

  removeObserver(observer: FakeMutationObserver): void {
    this.observers.delete(observer);
  }

  private visit(visitor: (child: FakeElement) => void): void {
    this.children.forEach((child) => {
      visitor(child);
      if (child instanceof FakeContainer) {
        child.visit(visitor);
      }
    });
  }

  private notify(record: FakeMutationRecord): void {
    this.observers.forEach((observer) => {
      observer.deliver(record);
    });
  }
}

export interface FakeTabInit {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly pinned?: boolean;
  readonly closing?: boolean;
  readonly workspaceId?: string | null;
}

export class FakeTab extends FakeElement implements PlatformTab {
  readonly title: string;
  readonly url: string;
  readonly pinned: boolean;
  readonly closing: boolean;
  readonly workspaceId: string | null;
  group: FakeTabGroup | null = null;

  constructor(init: FakeTabInit) {
    super("tab");
    this.id = init.id;
    this.title = init.title;
    this.url = init.url;
    this.pinned = init.pinned ?? false;
    this.closing = init.closing ?? false;
    this.workspaceId = init.workspaceId ?? null;
  }
}

export class FakeTabGroup extends FakeContainer implements PlatformTabGroup {
  label = "";
  color = "blue";
  readonly tabs: FakeTab[] = [];

  constructor() {
    super("tab-group");
  }

  addTabs(tabs: readonly FakeTab[]): void {
    tabs.forEach((tab) => {
      this.addTab(tab);
    });
  }

  addTab(tab: FakeTab): void {
    tab.group?.removeTab(tab);
    tab.group = this;
    if (!this.tabs.includes(tab)) {
      this.tabs.push(tab);
    }
    this.appendChild(tab);
  }

  removeTab(tab: FakeTab): void {
    const tabIndex = this.tabs.indexOf(tab);
    if (tabIndex !== -1) {
      this.tabs.splice(tabIndex, 1);
    }
    if (tab.group === this) {
      tab.group = null;
    }
    if (tab.parentNode === this) {
      this.removeChild(tab);
    }
  }
}

export class FakeDocument {
  readonly body = new FakeContainer("body");

  createXULElement(_localName: "tab-group"): FakeTabGroup {
    return new FakeTabGroup();
  }

  querySelector(selector: string): FakeElement | null {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector: string): readonly FakeElement[] {
    return this.body.querySelectorAll(selector);
  }
}
