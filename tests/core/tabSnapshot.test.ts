import { describe, expect, it } from "vitest";
import type { PlatformTab } from "../../src/platform";
import { buildPromptPayload } from "../../src/core/promptPayload";
import { collectTabSnapshots } from "../../src/core/tabSnapshot";

type TestTab = PlatformTab & {
  readonly description?: string;
  readonly folder?: boolean;
  readonly groupId?: string;
  readonly parentNode?: object | null;
  readonly splitView?: boolean;
};

const connected = {};

const tab = (overrides: Partial<TestTab>): TestTab => ({
  id: "tab-1",
  title: "Example",
  url: "https://example.com/docs/path?secret=1",
  pinned: false,
  closing: false,
  workspaceId: "workspace-a",
  parentNode: connected,
  ...overrides,
});

describe("collectTabSnapshots", () => {
  it("preserves title, domain, workspace, and pinned state when URL is valid", () => {
    // Given
    const tabs = [tab({ id: "valid", title: "Docs", pinned: true })];

    // When
    const snapshots = collectTabSnapshots(tabs, { preservePinnedTabs: false });

    // Then
    expect(snapshots).toEqual([
      {
        id: "valid",
        title: "Docs",
        url: "https://example.com/docs/path?secret=1",
        domain: "example.com",
        workspaceId: "workspace-a",
        pinned: true,
        exclusion: null,
      },
    ]);
  });

  it("parses about pages without applying shortcut logic", () => {
    // Given
    const tabs = [tab({ id: "about", url: "about:preferences", title: "Settings" })];

    // When
    const snapshots = collectTabSnapshots(tabs);

    // Then
    expect(snapshots[0]).toMatchObject({
      id: "about",
      domain: "about",
      exclusion: null,
    });
  });

  it("keeps invalid URLs as malformed input data without throwing", () => {
    // Given
    const tabs = [tab({ id: "invalid", url: "https://[", title: "Broken URL" })];

    // When
    const snapshots = collectTabSnapshots(tabs);

    // Then
    expect(snapshots[0]).toMatchObject({
      id: "invalid",
      url: "https://[",
      domain: null,
      exclusion: null,
    });
  });

  it("marks disconnected tabs as excluded", () => {
    // Given
    const tabs = [tab({ id: "detached", parentNode: null })];

    // When
    const snapshots = collectTabSnapshots(tabs);

    // Then
    expect(snapshots[0]?.exclusion).toEqual({ reason: "disconnected" });
  });

  it("marks pinned tabs as excluded when pinned preservation is enabled", () => {
    // Given
    const tabs = [tab({ id: "pinned", pinned: true })];

    // When
    const snapshots = collectTabSnapshots(tabs, { preservePinnedTabs: true });

    // Then
    expect(snapshots[0]?.exclusion).toEqual({ reason: "pinned" });
  });

  it("preserves group, folder, and split-view exclusion signals", () => {
    // Given
    const tabs = [
      tab({ id: "grouped", groupId: "group-1" }),
      tab({ id: "folder", folder: true }),
      tab({ id: "split", splitView: true }),
    ];

    // When
    const snapshots = collectTabSnapshots(tabs);

    // Then
    expect(snapshots.map((snapshot) => snapshot.exclusion)).toEqual([
      { reason: "grouped", groupId: "group-1" },
      { reason: "folder" },
      { reason: "splitView" },
    ]);
  });

  it("does not collect descriptions by default", () => {
    // Given
    const tabs = [tab({ id: "described", description: "A private page summary" })];

    // When
    const snapshots = collectTabSnapshots(tabs);

    // Then
    expect(snapshots[0]).not.toHaveProperty("description");
  });

  it("collects optional descriptions only when enabled", () => {
    // Given
    const tabs = [tab({ id: "described", description: "A private page summary" })];

    // When
    const snapshots = collectTabSnapshots(tabs, { includeDescriptions: true });

    // Then
    expect(snapshots[0]).toHaveProperty("description", "A private page summary");
  });
});

describe("buildPromptPayload", () => {
  it("omits excluded tabs and descriptions by default", () => {
    // Given
    const snapshots = collectTabSnapshots([
      tab({ id: "active", description: "Do not send by default" }),
      tab({ id: "pinned", pinned: true, description: "Pinned summary" }),
    ], { includeDescriptions: true, preservePinnedTabs: true });

    // When
    const payload = buildPromptPayload(snapshots);

    // Then
    expect(payload).toEqual({
      tabs: [
        {
          id: "active",
          title: "Example",
          url: "https://example.com/docs/path?secret=1",
          domain: "example.com",
          workspaceId: "workspace-a",
          pinned: false,
        },
      ],
    });
  });

  it("includes descriptions only when explicitly enabled for prompt payloads", () => {
    // Given
    const snapshots = collectTabSnapshots([
      tab({ id: "active", description: "A useful summary" }),
    ], { includeDescriptions: true });

    // When
    const payload = buildPromptPayload(snapshots, { includeDescriptions: true });

    // Then
    expect(payload.tabs[0]).toHaveProperty("description", "A useful summary");
  });
});
