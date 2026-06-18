import { appendText, createChromeElement, type ChromeDocument, type ChromeElement } from "./dom";

export type BrowserChromeActions = {
  readonly tidyUngrouped: () => void;
  readonly tidyAll: () => void;
  readonly tidySelected: () => void;
  readonly undoLastTidy: () => void;
  readonly openSettings: () => void;
  readonly saveQuickSettings: () => void;
};

export type BrowserChromeCommand = "tidy-ungrouped" | "tidy-all" | "tidy-selected" | "undo" | "settings";

let nextChromeId = 1;

export const createBroomButton = (
  document: ChromeDocument,
  workspaceId: string,
  actions: BrowserChromeActions,
): ChromeElement => {
  const button = createChromeElement(document, "toolbarbutton", "button");
  button.id = `neurosort-broom-${safeIdPart(workspaceId)}-${nextChromeId}`;
  nextChromeId += 1;
  button.classList.add("neurosort-broom");
  button.setAttribute("type", "button");
  button.setAttribute("aria-label", "NeuroSort");
  button.setAttribute("title", "NeuroSort");
  button.setAttribute("tooltiptext", "NeuroSort");
  button.setAttribute("style", broomStyle);

  const icon = createChromeElement(document, "label", "span");
  icon.classList.add("neurosort-broom-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("style", broomIconStyle);
  appendText(document, icon, "🧹");
  button.appendChild(icon);

  button.addEventListener("click", (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    actions.tidyUngrouped();
  });
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    const root = button.parentNode;
    if (root === null) {
      return;
    }
    ensureCommandPanel(document, root, actions);
    root.classList.add("neurosort-menu-open");
  });
  return button;
};

export const runCommand = (command: BrowserChromeCommand, actions: BrowserChromeActions): void => {
  switch (command) {
    case "tidy-ungrouped":
      actions.tidyUngrouped();
      return;
    case "tidy-all":
      actions.tidyAll();
      return;
    case "tidy-selected":
      actions.tidySelected();
      return;
    case "undo":
      actions.undoLastTidy();
      return;
    case "settings":
      actions.openSettings();
      return;
    default:
      assertNever(command);
  }
};

const ensureCommandPanel = (
  document: ChromeDocument,
  root: ChromeElement,
  actions: BrowserChromeActions,
): void => {
  if (root.querySelector(".neurosort-menu") !== null) {
    return;
  }
  root.appendChild(createContextMenu(document, actions));
};

const createContextMenu = (document: ChromeDocument, actions: BrowserChromeActions): ChromeElement => {
  const menu = document.createElement("menu");
  menu.classList.add("neurosort-menu");
  appendMenuButton(document, menu, "tidy-ungrouped", "Tidy ungrouped tabs", actions.tidyUngrouped);
  appendMenuButton(document, menu, "tidy-all", "Tidy all tabs", actions.tidyAll);
  appendMenuButton(document, menu, "tidy-selected", "Tidy selected tabs", actions.tidySelected);
  appendMenuButton(document, menu, "undo", "Undo last tidy", actions.undoLastTidy);
  appendMenuButton(document, menu, "settings", "Settings", actions.openSettings);
  return menu;
};

const appendMenuButton = (
  document: ChromeDocument,
  menu: ChromeElement,
  command: BrowserChromeCommand,
  label: string,
  action: () => void,
): void => {
  const item = document.createElement("button");
  item.classList.add("neurosort-menu-item");
  item.setAttribute("type", "button");
  item.setAttribute("data-command", command);
  appendText(document, item, label);
  item.addEventListener("click", action);
  menu.appendChild(item);
};

const safeIdPart = (value: string): string => {
  const safe = value
    .toLowerCase()
    .split("")
    .map((char) => (isIdChar(char) ? char : "-"))
    .join("")
    .replace(/-+/g, "-");
  return safe.length === 0 ? "workspace" : safe;
};

const isIdChar = (char: string): boolean => /^[a-z0-9_-]$/.test(char);

const assertNever = (value: never): never => {
  throw new UnexpectedChromeCommandError(value);
};

export class UnexpectedChromeCommandError extends Error {
  public override readonly name = "UnexpectedChromeCommandError";

  public constructor(readonly value: never) {
    super("Unexpected browser chrome command");
  }
}

const broomStyle = [
  "appearance:none",
  "display:inline-flex",
  "align-items:center",
  "justify-content:center",
  "width:24px",
  "height:24px",
  "min-width:24px",
  "min-height:24px",
  "margin:0",
  "padding:0",
  "border:0",
  "border-radius:6px",
  "background:transparent",
  "color:var(--toolbarbutton-icon-fill, var(--zen-text-primary, CanvasText))",
  "cursor:pointer",
].join(";");

const broomIconStyle = [
  "display:block",
  "font-family:'Apple Color Emoji','Segoe UI Emoji',sans-serif",
  "font-size:15px",
  "line-height:1",
  "pointer-events:none",
  "transform:translateY(-0.5px)",
].join(";");
