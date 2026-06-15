export type TabExclusion =
  | { readonly reason: "closing" }
  | { readonly reason: "disconnected" }
  | { readonly reason: "folder" }
  | { readonly reason: "grouped"; readonly groupId: string }
  | { readonly reason: "pinned" }
  | { readonly reason: "splitView" };

export type TabSnapshot = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly domain: string | null;
  readonly workspaceId: string | null;
  readonly pinned: boolean;
  readonly exclusion: TabExclusion | null;
  readonly description?: string;
};

export type PromptTab = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly domain: string | null;
  readonly workspaceId: string | null;
  readonly pinned: boolean;
  readonly description?: string;
};

export type PromptPayload = {
  readonly tabs: readonly PromptTab[];
};
