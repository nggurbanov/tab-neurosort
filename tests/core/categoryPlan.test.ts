import { describe, expect, it } from "vitest";
import { createCategoryPlan } from "../../src/core/categoryPlan";
import type { PromptTab } from "../../src/core/types";

const makeTabs = (count: number): readonly PromptTab[] => {
  const domains = ["docs.example.com", "news.example.com", "shop.example.com", "mail.example.com"] as const;
  return Array.from({ length: count }, (_, index) => {
    const domain = domains[index % domains.length] ?? "docs.example.com";
    return {
      id: `tab-${index + 1}`,
      title: `Fixture tab ${index + 1}`,
      url: `https://${domain}/page-${index + 1}`,
      domain,
      workspaceId: "workspace-a",
      pinned: false,
    };
  });
};

describe("createCategoryPlan", () => {
  it("merges duplicate categories and removes too-small groups when planning 25 tabs", () => {
    // Given
    const tabs = makeTabs(25);
    const assignments = [
      { tabId: "tab-1", category: "Work" },
      { tabId: "tab-2", category: "work " },
      { tabId: "tab-3", category: "Solo" },
    ];

    // When
    const plan = createCategoryPlan(tabs, assignments, { minGroupSize: 2, maxGroupSize: 12 });

    // Then
    expect(plan.groups.slice(0, 1)).toEqual([
      { name: "Work", tabIds: ["tab-1", "tab-2"], source: "ai" },
    ]);
    expect(plan.groups.some((group) => group.name === "Solo")).toBe(false);
    expect(plan.groups.find((group) => group.name === "shop.example.com")).toEqual({
      name: "shop.example.com",
      tabIds: ["tab-3", "tab-7", "tab-11", "tab-15", "tab-19", "tab-23"],
      source: "domain",
    });
  });

  it("splits oversized groups deterministically when planning 80 tabs", () => {
    // Given
    const tabs = makeTabs(80);
    const assignments = tabs.slice(0, 31).map((tab) => ({ tabId: tab.id, category: "Research" }));

    // When
    const plan = createCategoryPlan(tabs, assignments, { minGroupSize: 2, maxGroupSize: 10 });

    // Then
    expect(plan.groups.slice(0, 3)).toEqual([
      { name: "Research 1", tabIds: ["tab-1", "tab-2", "tab-3", "tab-4", "tab-5", "tab-6", "tab-7", "tab-8", "tab-9", "tab-10"], source: "ai" },
      { name: "Research 2", tabIds: ["tab-11", "tab-12", "tab-13", "tab-14", "tab-15", "tab-16", "tab-17", "tab-18", "tab-19", "tab-20"], source: "ai" },
      { name: "Research 3", tabIds: ["tab-21", "tab-22", "tab-23", "tab-24", "tab-25", "tab-26", "tab-27", "tab-28", "tab-29", "tab-30"], source: "ai" },
    ]);
    expect(plan.groups.every((group) => group.tabIds.length <= 10)).toBe(true);
  });

  it("uses deterministic domain fallback for malformed output when planning 200 tabs", () => {
    // Given
    const tabs = makeTabs(200);

    // When
    const firstPlan = createCategoryPlan(tabs, [], { minGroupSize: 3, maxGroupSize: 25 });
    const secondPlan = createCategoryPlan(tabs, [], { minGroupSize: 3, maxGroupSize: 25 });

    // Then
    expect(firstPlan).toEqual(secondPlan);
    expect(firstPlan.groups.slice(0, 2)).toEqual([
      {
        name: "docs.example.com 1",
        tabIds: [
          "tab-1", "tab-5", "tab-9", "tab-13", "tab-17", "tab-21", "tab-25", "tab-29", "tab-33", "tab-37",
          "tab-41", "tab-45", "tab-49", "tab-53", "tab-57", "tab-61", "tab-65", "tab-69", "tab-73", "tab-77",
          "tab-81", "tab-85", "tab-89", "tab-93", "tab-97",
        ],
        source: "domain",
      },
      {
        name: "docs.example.com 2",
        tabIds: [
          "tab-101", "tab-105", "tab-109", "tab-113", "tab-117", "tab-121", "tab-125", "tab-129", "tab-133", "tab-137",
          "tab-141", "tab-145", "tab-149", "tab-153", "tab-157", "tab-161", "tab-165", "tab-169", "tab-173", "tab-177",
          "tab-181", "tab-185", "tab-189", "tab-193", "tab-197",
        ],
        source: "domain",
      },
    ]);
  });
});
