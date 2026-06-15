import type { PromptPayload, PromptTab, TabSnapshot } from "./types";

export type PromptPayloadOptions = {
  readonly includeDescriptions?: boolean;
};

export const buildPromptPayload = (
  snapshots: readonly TabSnapshot[],
  options: PromptPayloadOptions = {},
): PromptPayload => {
  return {
    tabs: snapshots.filter(isPromptEligible).map((snapshot) => toPromptTab(snapshot, options)),
  };
};

const isPromptEligible = (snapshot: TabSnapshot): boolean => {
  return snapshot.exclusion === null;
};

const toPromptTab = (snapshot: TabSnapshot, options: PromptPayloadOptions): PromptTab => {
  const promptTab = {
    id: snapshot.id,
    title: snapshot.title,
    url: snapshot.url,
    domain: snapshot.domain,
    workspaceId: snapshot.workspaceId,
    pinned: snapshot.pinned,
  };

  if (options.includeDescriptions === true && typeof snapshot.description === "string") {
    return { ...promptTab, description: snapshot.description };
  }

  return promptTab;
};
