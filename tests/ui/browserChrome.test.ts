import { describe, expect, it } from "vitest";

import { mountBrowserChrome, type BrowserChromeActions } from "../../src/ui/browserChrome";
import { FakeChromeDocument, FakeChromeElement } from "./fakeChromeDom";

const actionsWithLog = (): { readonly actions: BrowserChromeActions; readonly calls: readonly string[] } => {
  const calls: string[] = [];
  return {
    actions: {
      tidyUngrouped(): void {
        calls.push("tidyUngrouped");
      },
      tidyAll(): void {
        calls.push("tidyAll");
      },
      tidySelected(): void {
        calls.push("tidySelected");
      },
      undoLastTidy(): void {
        calls.push("undoLastTidy");
      },
      openSettings(): void {
        calls.push("openSettings");
      },
      saveQuickSettings(): void {
        calls.push("saveQuickSettings");
      },
    },
    calls,
  };
};

describe("browser chrome", () => {
  it("Given malicious settings strings When command panel opens Then settings text is not rendered in browser chrome", () => {
    // Given
    const document = new FakeChromeDocument();
    const { actions } = actionsWithLog();

    // When
    const mount = mountBrowserChrome({
      document,
      toolbar: document.body,
      workspaceId: "work<script>",
      actions,
      settings: {
        providerLabel: "<img src=x onerror=alert(1)>",
        modelLabel: "gpt-tabs<script>",
        endpointLabel: "https://example.test/<script>",
        apiKey: "sk-live-secret-123456",
      },
      status: { kind: "setup", message: "Paste key <script>alert(1)</script>" },
    });
    requireFakeElement(mount.button).dispatch("contextmenu");

    // Then
    expect(document.innerHtmlWrites).toEqual([]);
    expect(document.body.text()).not.toContain("<img src=x onerror=alert(1)>");
    expect(document.body.text()).not.toContain("Paste key <script>alert(1)</script>");
    expect(document.body.text()).not.toContain("sk-live-secret-123456");
    expect(document.body.text()).not.toContain("sk-live...3456");
    expect(document.body.text()).toContain("Tidy ungrouped tabs");
  });

  it("Given repeated workspace mounts When chrome mounts Then buttons have unique IDs and visible badges update", () => {
    // Given
    const document = new FakeChromeDocument();
    const { actions } = actionsWithLog();

    // When
    const first = mountBrowserChrome({
      document,
      toolbar: document.body,
      workspaceId: "alpha",
      actions,
      settings: { providerLabel: "Ollama", modelLabel: "llama3", endpointLabel: "local", apiKey: "" },
      status: { kind: "ready", badgeText: "3", message: "Ready" },
    });
    const sameWorkspace = mountBrowserChrome({
      document,
      toolbar: document.body,
      workspaceId: "alpha",
      actions,
      settings: { providerLabel: "Ollama", modelLabel: "llama3", endpointLabel: "local", apiKey: "" },
      status: { kind: "ready", badgeText: "1", message: "Ready" },
    });
    const otherWorkspace = mountBrowserChrome({
      document,
      toolbar: document.body,
      workspaceId: "beta",
      actions,
      settings: { providerLabel: "Gemini", modelLabel: "gemini", endpointLabel: "remote", apiKey: "AIza-secret" },
      status: { kind: "disabled", message: "Provider disabled" },
    });
    first.update({ kind: "error", message: "Provider failed", actionLabel: "Fix" });
    const firstButton = document.body.querySelector(`#${first.button.id}`);
    const sameWorkspaceButton = document.body.querySelector(`#${sameWorkspace.button.id}`);
    const otherWorkspaceButton = document.body.querySelector(`#${otherWorkspace.button.id}`);

    // Then
    expect(first.button.id).not.toBe(sameWorkspace.button.id);
    expect(first.button.id).not.toBe(otherWorkspace.button.id);
    expect(firstButton?.text()).toContain("!");
    expect(sameWorkspaceButton?.text()).toContain("!");
    expect(document.body.text()).not.toContain("Provider failed");
    expect(otherWorkspaceButton?.text()).toContain("Off");
  });

  it("Given mounted chrome When menu commands are clicked Then the matching actions run", () => {
    // Given
    const document = new FakeChromeDocument();
    const { actions, calls } = actionsWithLog();
    const mount = mountBrowserChrome({
      document,
      toolbar: document.body,
      workspaceId: "alpha",
      actions,
      settings: { providerLabel: "Ollama", modelLabel: "llama3", endpointLabel: "local", apiKey: "" },
      status: { kind: "ready", badgeText: "2", message: "Ready" },
    });

    // When
    mount.clickMenuItem("tidy-selected");
    mount.clickMenuItem("tidy-all");
    mount.clickMenuItem("undo");
    mount.clickMenuItem("settings");
    mount.clickQuickSave();

    // Then
    expect(calls).toEqual(["tidySelected", "tidyAll", "undoLastTidy", "openSettings", "saveQuickSettings"]);
  });

  it("Given chrome mounts When idle Then broom is icon-only and command panel is hidden until context menu", () => {
    // Given
    const document = new FakeChromeDocument();
    const { actions } = actionsWithLog();

    // When
    const mount = mountBrowserChrome({
      document,
      toolbar: document.body,
      workspaceId: "alpha",
      actions,
      settings: { providerLabel: "Ollama", modelLabel: "llama3", endpointLabel: "local", apiKey: "" },
      status: { kind: "ready", badgeText: "2", message: "Ready" },
    });
    const button = requireFakeElement(mount.button);
    const root = requireFakeElement(mount.root);
    const initialText = document.body.text();
    button.dispatch("contextmenu");
    const menuElement = requireFakeElement(mount.root.querySelector(".neurosort-menu"));

    // Then
    expect(initialText).not.toContain("Tidy ungrouped tabs");
    expect(initialText).not.toContain("Settings");
    expect(initialText).not.toContain("Provider");
    expect(initialText).toContain("🧹");
    expect(mount.root.querySelector(".neurosort-menu")).not.toBeNull();
    expect(button.text()).not.toContain("Broom");
    expect(button.dataset["aria-label"]).toBe("NeuroSort");
    expect(menuElement.classList.has("neurosort-menu-hidden")).toBe(false);
    expect(root.classList.has("neurosort-menu-open")).toBe(true);
  });

  it("Given actionable and disabled states When chrome updates Then only badge state stays visible", () => {
    // Given
    const document = new FakeChromeDocument();
    const { actions } = actionsWithLog();
    const mount = mountBrowserChrome({
      document,
      toolbar: document.body,
      workspaceId: "alpha",
      actions,
      settings: { providerLabel: "Disabled", modelLabel: "", endpointLabel: "", apiKey: "" },
      status: { kind: "disabled", message: "Provider disabled" },
    });

    // When
    mount.update({ kind: "setup", message: "Choose a provider" });
    const setupText = document.body.text();
    mount.update({ kind: "error", message: "Missing model", actionLabel: "Open setup" });

    // Then
    expect(document.body.querySelector(`#${mount.button.id}`)?.text()).toContain("!");
    expect(setupText).not.toContain("Choose a provider");
    expect(document.body.text()).not.toContain("Missing model");
    expect(document.body.text()).not.toContain("Open setup");
  });

  it("Given adapter failure When chrome updates Then no internal status text is rendered", () => {
    // Given
    const document = new FakeChromeDocument();
    const { actions } = actionsWithLog();
    const mount = mountBrowserChrome({
      document,
      toolbar: document.body,
      workspaceId: "alpha",
      actions,
      settings: { providerLabel: "Ollama", modelLabel: "llama3", endpointLabel: "local", apiKey: "" },
      status: { kind: "ready", badgeText: "2", message: "Ready" },
    });

    // When
    mount.update({ kind: "error", message: "adapter_failed", actionLabel: "Open settings" });

    // Then
    expect(document.body.text()).not.toContain("adapter_failed");
    expect(document.body.text()).not.toContain("Tab grouping is unavailable");
    expect(document.body.text()).toBe("🧹!");
  });

  it("Given toast text includes malformed provider output When shown and dismissed Then it never writes innerHTML", () => {
    // Given
    const document = new FakeChromeDocument();
    const { actions } = actionsWithLog();
    const mount = mountBrowserChrome({
      document,
      toolbar: document.body,
      workspaceId: "alpha",
      actions,
      settings: { providerLabel: "Custom", modelLabel: "tabs", endpointLabel: "remote", apiKey: "secret-value" },
      status: { kind: "ready", message: "Ready" },
    });

    // When
    const toast = mount.showToast("Malformed: </button><script>steal()</script>");
    toast.dismiss();

    // Then
    expect(document.innerHtmlWrites).toEqual([]);
    expect(document.body.text()).not.toContain("Malformed:");
  });
});

const requireFakeElement = (element: unknown): FakeChromeElement => {
  if (element instanceof FakeChromeElement) {
    return element;
  }
  throw new Error("Expected fake chrome element");
};
