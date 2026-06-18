import type { ChromeDocument, ChromeElement, ChromeEvent, ChromeEventName } from "../../src/ui/dom";

type Listener = (event: ChromeEvent) => void;

class FakeClassList {
  private readonly values = new Set<string>();

  add(token: string): void {
    this.values.add(token);
  }

  remove(token: string): void {
    this.values.delete(token);
  }

  has(token: string): boolean {
    return this.values.has(token);
  }
}

export class FakeChromeElement implements ChromeElement {
  readonly children: FakeChromeElement[] = [];
  readonly classList = new FakeClassList();
  readonly listeners: Partial<Record<ChromeEventName, readonly Listener[]>> = {};
  readonly dataset: Record<string, string> = {};
  id = "";
  textContent = "";
  parentNode: FakeChromeElement | null = null;

  get firstChild(): FakeChromeElement | null {
    return this.children[0] ?? null;
  }

  constructor(
    readonly ownerDocument: FakeChromeDocument,
    readonly tagName: string,
  ) {}

  set innerHTML(value: string) {
    this.ownerDocument.innerHtmlWrites.push(value);
  }

  get innerHTML(): string {
    return "";
  }

  appendChild(child: ChromeElement): void {
    const fakeChild = this.requireFake(child);
    fakeChild.parentNode?.removeChild(fakeChild);
    this.children.push(fakeChild);
    fakeChild.parentNode = this;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  addEventListener(name: ChromeEventName, listener: Listener): void {
    const existing = this.listeners[name] ?? [];
    this.listeners[name] = [...existing, listener];
  }

  setAttribute(name: string, value: string): void {
    if (name === "id") {
      this.id = value;
      return;
    }
    this.dataset[name] = value;
  }

  querySelector(selector: string): FakeChromeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): readonly FakeChromeElement[] {
    const matches: FakeChromeElement[] = [];
    this.visit((child) => {
      if (selector === "*" || selector === `#${child.id}` || selector === child.tagName || child.classList.has(selector.slice(1))) {
        matches.push(child);
      }
    });
    return matches;
  }

  click(): void {
    const event = new FakeChromeEvent();
    this.listeners.click?.forEach((listener) => {
      listener(event);
    });
  }

  dispatch(name: ChromeEventName): FakeChromeEvent {
    const event = new FakeChromeEvent();
    this.listeners[name]?.forEach((listener) => {
      listener(event);
    });
    return event;
  }

  text(): string {
    return [this.textContent, ...this.children.map((child) => child.text())].join("");
  }

  removeChild(child: FakeChromeElement): void {
    const index = this.children.indexOf(child);
    if (index === -1) {
      return;
    }
    this.children.splice(index, 1);
    child.parentNode = null;
  }

  private visit(visitor: (child: FakeChromeElement) => void): void {
    this.children.forEach((child) => {
      visitor(child);
      child.visit(visitor);
    });
  }

  private requireFake(child: ChromeElement): FakeChromeElement {
    if (child instanceof FakeChromeElement) {
      return child;
    }
    throw new Error("FakeChromeElement only accepts fake children");
  }
}

export class FakeChromeDocument implements ChromeDocument {
  readonly body = new FakeChromeElement(this, "body");
  readonly innerHtmlWrites: string[] = [];

  createElement(tagName: string): FakeChromeElement {
    return new FakeChromeElement(this, tagName);
  }

  createXULElement(tagName: string): FakeChromeElement {
    return new FakeChromeElement(this, tagName);
  }

  createTextNode(text: string): FakeChromeElement {
    const node = new FakeChromeElement(this, "#text");
    node.textContent = text;
    return node;
  }

  querySelector(selector: string): FakeChromeElement | null {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector: string): readonly FakeChromeElement[] {
    return this.body.querySelectorAll(selector);
  }
}

export class FakeChromeEvent implements ChromeEvent {
  defaultPrevented = false;
  propagationStopped = false;

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}
