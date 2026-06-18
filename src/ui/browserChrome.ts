import {
  createBroomButton,
  runCommand,
  type BrowserChromeActions,
  type BrowserChromeCommand,
} from "./browserChromeControls";
import type { ChromeToolbarKind } from "../browserRuntime";
import { appendText, clearChildren, createChromeElement, type ChromeDocument, type ChromeElement } from "./dom";

export type { BrowserChromeActions, BrowserChromeCommand } from "./browserChromeControls";

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

export type BrowserChromeMountOptions = {
  readonly document: ChromeDocument;
  readonly toolbar: ChromeElement;
  readonly workspaceId: string;
  readonly actions: BrowserChromeActions;
  readonly settings: BrowserChromeSettings;
  readonly status: BrowserChromeStatus;
  readonly toolbarKind?: ChromeToolbarKind;
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

type MountedChrome = {
  readonly workspaceId: string;
  readonly button: ChromeElement;
  readonly badge: ChromeElement;
};

const mountedChromes: MountedChrome[] = [];

export const mountBrowserChrome = (options: BrowserChromeMountOptions): BrowserChromeMount => {
  const root = createChromeElement(options.document, "hbox", "div");
  root.classList.add("neurosort-chrome");
  if (options.toolbarKind === "fallback") {
    root.classList.add("neurosort-chrome-fallback");
  }
  root.setAttribute("data-workspace-id", options.workspaceId);

  const button = createBroomButton(options.document, options.workspaceId, options.actions);
  const badge = createChromeElement(options.document, "label", "span");
  badge.classList.add("neurosort-badge");
  button.appendChild(badge);
  root.appendChild(button);

  options.toolbar.appendChild(root);
  const mounted = { workspaceId: options.workspaceId, button, badge };
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

const updateMountedChrome = (chrome: MountedChrome, status: BrowserChromeStatus, document: ChromeDocument): void => {
  clearChildren(chrome.badge);
  const badgeText = getBadgeText(status);
  appendText(document, chrome.badge, badgeText);
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

const assertNever = (value: never): never => {
  throw new UnexpectedChromeVariantError(value);
};

export class UnexpectedChromeVariantError extends Error {
  public override readonly name = "UnexpectedChromeVariantError";

  public constructor(readonly value: never) {
    super("Unexpected browser chrome variant");
  }
}
