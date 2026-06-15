import { appendLabeledText, appendText, clearChildren, type ChromeDocument, type ChromeElement } from "./dom";

export type BrowserChromeStatus =
  | { readonly kind: "ready"; readonly message: string; readonly badgeText?: string }
  | { readonly kind: "busy"; readonly message: string; readonly badgeText?: string }
  | { readonly kind: "disabled"; readonly message: string }
  | { readonly kind: "setup"; readonly message: string }
  | { readonly kind: "error"; readonly message: string; readonly actionLabel: string };

export type BrowserChromeSettings = {
  readonly providerLabel: string;
  readonly modelLabel: string;
  readonly endpointLabel: string;
  readonly apiKey: string;
};

export type BrowserChromeActions = {
  readonly tidyUngrouped: () => void;
  readonly tidyAll: () => void;
  readonly tidySelected: () => void;
  readonly undoLastTidy: () => void;
  readonly openSettings: () => void;
  readonly saveQuickSettings: () => void;
};

export type BrowserChromeMountOptions = {
  readonly document: ChromeDocument;
  readonly toolbar: ChromeElement;
  readonly workspaceId: string;
  readonly actions: BrowserChromeActions;
  readonly settings: BrowserChromeSettings;
  readonly status: BrowserChromeStatus;
};

export type BrowserChromeToast = {
  readonly element: ChromeElement;
  readonly dismiss: () => void;
};

export type BrowserChromeMount = {
  readonly button: ChromeElement;
  readonly root: ChromeElement;
  readonly update: (status: BrowserChromeStatus) => void;
  readonly showToast: (message: string) => BrowserChromeToast;
  readonly clickMenuItem: (command: BrowserChromeCommand) => void;
  readonly clickQuickSave: () => void;
  readonly destroy: () => void;
};

export type BrowserChromeCommand = "tidy-ungrouped" | "tidy-all" | "tidy-selected" | "undo" | "settings";

type MountedChrome = {
  readonly workspaceId: string;
  readonly button: ChromeElement;
  readonly statusPanel: ChromeElement;
  readonly badge: ChromeElement;
};

const mountedChromes: MountedChrome[] = [];
let nextChromeId = 1;

export const mountBrowserChrome = (options: BrowserChromeMountOptions): BrowserChromeMount => {
  const root = options.document.createElement("div");
  root.classList.add("neurosort-chrome");
  root.setAttribute("data-workspace-id", options.workspaceId);

  const button = createBroomButton(options.document, options.workspaceId, options.actions);
  const badge = options.document.createElement("span");
  badge.classList.add("neurosort-badge");
  button.appendChild(badge);
  root.appendChild(button);

  const menu = createContextMenu(options.document, options.actions);
  const quickSettings = createQuickSettings(options.document, options.settings, options.actions);
  const statusPanel = options.document.createElement("section");
  statusPanel.classList.add("neurosort-status");
  root.appendChild(menu);
  root.appendChild(quickSettings);
  root.appendChild(statusPanel);

  options.toolbar.appendChild(root);
  const mounted = { workspaceId: options.workspaceId, button, statusPanel, badge };
  mountedChromes.push(mounted);
  updateMountedChrome(mounted, options.status, options.document);

  return {
    button,
    root,
    update(status): void {
      mountedChromes
        .filter((chrome) => chrome.workspaceId === options.workspaceId)
        .forEach((chrome) => {
          updateMountedChrome(chrome, status, options.document);
        });
    },
    showToast(message): BrowserChromeToast {
      return showToast(options.document, root, message);
    },
    clickMenuItem(command): void {
      runCommand(command, options.actions);
    },
    clickQuickSave(): void {
      options.actions.saveQuickSettings();
    },
    destroy(): void {
      const index = mountedChromes.indexOf(mounted);
      if (index !== -1) {
        mountedChromes.splice(index, 1);
      }
      root.remove();
    },
  };
};

const createBroomButton = (
  document: ChromeDocument,
  workspaceId: string,
  actions: BrowserChromeActions,
): ChromeElement => {
  const button = document.createElement("button");
  button.id = `neurosort-broom-${safeIdPart(workspaceId)}-${nextChromeId}`;
  nextChromeId += 1;
  button.classList.add("neurosort-broom");
  button.setAttribute("type", "button");
  appendText(document, button, "Broom");
  button.addEventListener("click", actions.tidyUngrouped);
  return button;
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

const createQuickSettings = (
  document: ChromeDocument,
  settings: BrowserChromeSettings,
  actions: BrowserChromeActions,
): ChromeElement => {
  const panel = document.createElement("section");
  panel.classList.add("neurosort-quick-settings");
  appendLabeledText(document, panel, "Provider", settings.providerLabel);
  appendLabeledText(document, panel, "Model", settings.modelLabel);
  appendLabeledText(document, panel, "Endpoint", settings.endpointLabel);
  appendLabeledText(document, panel, "API key", maskSecret(settings.apiKey));
  const save = document.createElement("button");
  save.classList.add("neurosort-save-settings");
  save.setAttribute("type", "button");
  appendText(document, save, "Save");
  save.addEventListener("click", actions.saveQuickSettings);
  panel.appendChild(save);
  return panel;
};

const updateMountedChrome = (chrome: MountedChrome, status: BrowserChromeStatus, document: ChromeDocument): void => {
  clearChildren(chrome.badge);
  clearChildren(chrome.statusPanel);
  const badgeText = getBadgeText(status);
  appendText(document, chrome.badge, badgeText);
  appendText(document, chrome.statusPanel, status.message);
  if (status.kind === "error") {
    appendText(document, chrome.statusPanel, ` ${status.actionLabel}`);
  }
};

const showToast = (document: ChromeDocument, root: ChromeElement, message: string): BrowserChromeToast => {
  const toast = document.createElement("aside");
  toast.classList.add("neurosort-toast");
  appendText(document, toast, message);
  root.appendChild(toast);
  return {
    element: toast,
    dismiss(): void {
      toast.remove();
    },
  };
};

const runCommand = (command: BrowserChromeCommand, actions: BrowserChromeActions): void => {
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

const getBadgeText = (status: BrowserChromeStatus): string => {
  switch (status.kind) {
    case "ready":
    case "busy":
      return status.badgeText ?? "";
    case "disabled":
      return "Off";
    case "setup":
      return "?";
    case "error":
      return "!";
    default:
      return assertNever(status);
  }
};

const maskSecret = (secret: string): string => {
  if (secret.length === 0) {
    return "Not set";
  }
  if (secret.length <= 10) {
    return "Set";
  }
  return `${secret.slice(0, 7)}...${secret.slice(-4)}`;
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
  throw new UnexpectedChromeVariantError(value);
};

export class UnexpectedChromeVariantError extends Error {
  public override readonly name = "UnexpectedChromeVariantError";

  public constructor(readonly value: never) {
    super("Unexpected browser chrome variant");
  }
}
