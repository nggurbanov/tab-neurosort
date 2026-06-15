import { describe, expect, it } from "vitest";

import { mountBrowserChrome, type BrowserChromeActions } from "../../src/ui/browserChrome";
import { FakeChromeDocument } from "./fakeChromeDom";

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
  it("Given malicious settings strings When chrome mounts Then user values are text nodes and API keys are masked", () => {
    // Given
    const document = new FakeChromeDocument();
    const { actions } = actionsWithLog();

    // When
    mountBrowserChrome({
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

    // Then
    expect(document.innerHtmlWrites).toEqual([]);
    expect(document.body.text()).toContain("<img src=x onerror=alert(1)>");
    expect(document.body.text()).toContain("Paste key <script>alert(1)</script>");
    expect(document.body.text()).not.toContain("sk-live-secret-123456");
    expect(document.body.text()).toContain("sk-live...3456");
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
    expect(document.body.text()).toContain("Provider failed");
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

  it("Given actionable and disabled states When chrome updates Then state text stays visible", () => {
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
    expect(setupText).toContain("Choose a provider");
    expect(document.body.text()).toContain("Missing model");
    expect(document.body.text()).toContain("Open setup");
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
