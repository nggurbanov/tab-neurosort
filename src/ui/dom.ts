export type ChromeEventName = "click" | "contextmenu";

export type ChromeEvent = {
  readonly preventDefault?: () => void;
  readonly stopPropagation?: () => void;
};

export interface ChromeClassList {
  add(token: string): void;
  remove(token: string): void;
}

export interface ChromeElement {
  id: string;
  textContent: string | null;
  readonly classList: ChromeClassList;
  readonly firstChild: ChromeElement | null;
  readonly parentNode: ChromeElement | null;
  appendChild(child: ChromeElement): void;
  removeChild(child: ChromeElement): void;
  remove(): void;
  addEventListener(name: ChromeEventName, listener: (event: ChromeEvent) => void): void;
  setAttribute(name: string, value: string): void;
  querySelector(selector: string): ChromeElement | null;
  querySelectorAll(selector: string): readonly ChromeElement[];
}

export interface ChromeDocument {
  readonly body: ChromeElement;
  createElement(tagName: string): ChromeElement;
  createXULElement?(tagName: string): ChromeElement;
  createTextNode(text: string): ChromeElement;
  querySelector(selector: string): ChromeElement | null;
  querySelectorAll(selector: string): readonly ChromeElement[];
}

export const createChromeElement = (document: ChromeDocument, tagName: string, fallbackTagName = tagName): ChromeElement => {
  const createXULElement = document.createXULElement;
  return typeof createXULElement === "function"
    ? createXULElement.call(document, tagName)
    : document.createElement(fallbackTagName);
};

export const appendText = (document: ChromeDocument, parent: ChromeElement, text: string): void => {
  parent.appendChild(document.createTextNode(text));
};

export const appendLabeledText = (
  document: ChromeDocument,
  parent: ChromeElement,
  label: string,
  value: string,
): ChromeElement => {
  const row = document.createElement("div");
  row.classList.add("neurosort-row");
  appendText(document, row, `${label}: ${value}`);
  parent.appendChild(row);
  return row;
};

export const clearChildren = (element: ChromeElement): void => {
  while (element.firstChild !== null) {
    element.removeChild(element.firstChild);
  }
  element.textContent = "";
};
