import type { GroupPlannerTab } from "../../src/core/groupPlanner";
import type { CategoryAssignment } from "../../src/core/responseParser";
import type { PromptTab, TabSnapshot } from "../../src/core/types";
import type { FakeTabInit } from "../fakes/fakeDom";

export const PERFORMANCE_FIXTURE_SIZES = [25, 80, 200] as const;

const DOMAINS = [
  "docs.example.com",
  "news.example.com",
  "shop.example.com",
  "mail.example.com",
  "code.example.com",
  "learn.example.com",
  "ops.example.com",
  "design.example.com",
] as const;

export const makeTabSnapshots = (count: number): readonly TabSnapshot[] => {
  return Array.from({ length: count }, (_, index) => {
    const domain = domainFor(index);
    const id = tabIdFor(index);
    return {
      id,
      title: `Fixture tab ${index + 1}`,
      url: `https://${domain}/workspace/${index + 1}`,
      domain,
      workspaceId: "workspace-a",
      pinned: false,
      exclusion: null,
      description: `Deterministic description ${index + 1}`,
    };
  });
};

export const makePromptTabs = (count: number): readonly PromptTab[] => {
  return makeTabSnapshots(count).map(({ exclusion: _exclusion, description: _description, ...tab }) => tab);
};

export const makeGroupPlannerTabs = (count: number): readonly GroupPlannerTab[] => {
  return Array.from({ length: count }, (_, index) => ({
    id: tabIdFor(index),
    workspaceId: "workspace-a",
    groupId: null,
    index,
    pinned: false,
    folder: false,
    splitView: false,
  }));
};

export const makeFakeTabs = (count: number): readonly FakeTabInit[] => {
  return makeTabSnapshots(count).map((tab) => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
    pinned: tab.pinned,
    workspaceId: tab.workspaceId,
  }));
};

export const makeRoundRobinAssignments = (tabs: readonly PromptTab[]): readonly CategoryAssignment[] => {
  return tabs.map((tab, index) => ({
    tabId: tab.id,
    category: `Research ${index % 10}`,
  }));
};

const tabIdFor = (index: number): string => `tab-${index + 1}`;

const domainFor = (index: number): string => DOMAINS[index % DOMAINS.length] ?? DOMAINS[0];
