export type GroupPlannerTab = {
  readonly id: string;
  readonly workspaceId: string | null;
  readonly groupId: string | null;
  readonly index: number;
  readonly pinned: boolean;
  readonly folder: boolean;
  readonly splitView: boolean;
};

export type PlannedCategory = {
  readonly name: string;
  readonly tabIds: readonly string[];
};

export type GroupPlanInput = {
  readonly tabs: readonly GroupPlannerTab[];
  readonly categories: readonly PlannedCategory[];
};

export type GroupPlanOperation =
  | {
      readonly kind: "createGroup";
      readonly groupId: string;
      readonly title: string;
      readonly workspaceId: string | null;
    }
  | {
      readonly kind: "moveTabToGroup";
      readonly tabId: string;
      readonly groupId: string;
      readonly order: number;
    };

export type GroupPlanOutcome =
  | { readonly kind: "skippedMissingTab"; readonly tabId: string; readonly category: string }
  | {
      readonly kind: "skippedExcludedTab";
      readonly tabId: string;
      readonly category: string;
      readonly reason: "pinned" | "folder" | "splitView";
    }
  | { readonly kind: "skippedEmptyCategory"; readonly category: string };

export type GroupMutationPlan = {
  readonly operations: readonly GroupPlanOperation[];
  readonly outcomes: readonly GroupPlanOutcome[];
};

export const planGroupMutations = (input: GroupPlanInput): GroupMutationPlan => {
  const tabsById = new Map(input.tabs.map((tab) => [tab.id, tab]));
  const operations: GroupPlanOperation[] = [];
  const outcomes: GroupPlanOutcome[] = [];

  for (const category of input.categories) {
    const targets = selectMovableTargets(category, tabsById, outcomes);
    const firstTarget = targets[0];
    if (firstTarget === undefined) {
      outcomes.push({ kind: "skippedEmptyCategory", category: category.name });
      continue;
    }

    const groupId = generatedGroupId(category.name);
    operations.push({
      kind: "createGroup",
      groupId,
      title: category.name,
      workspaceId: firstTarget.workspaceId,
    });

    targets.forEach((target, order) => {
      operations.push({ kind: "moveTabToGroup", tabId: target.id, groupId, order });
    });
  }

  return { operations, outcomes };
};

const selectMovableTargets = (
  category: PlannedCategory,
  tabsById: ReadonlyMap<string, GroupPlannerTab>,
  outcomes: GroupPlanOutcome[],
): readonly GroupPlannerTab[] => {
  const selected: GroupPlannerTab[] = [];
  const seen = new Set<string>();

  for (const tabId of category.tabIds) {
    if (seen.has(tabId)) {
      continue;
    }
    seen.add(tabId);

    const tab = tabsById.get(tabId);
    if (tab === undefined) {
      outcomes.push({ kind: "skippedMissingTab", tabId, category: category.name });
      continue;
    }

    const exclusion = tabExclusion(tab);
    if (exclusion !== null) {
      outcomes.push({ kind: "skippedExcludedTab", tabId, category: category.name, reason: exclusion });
      continue;
    }

    selected.push(tab);
  }

  return selected;
};

const tabExclusion = (tab: GroupPlannerTab): "pinned" | "folder" | "splitView" | null => {
  if (tab.pinned) {
    return "pinned";
  }
  if (tab.folder) {
    return "folder";
  }
  if (tab.splitView) {
    return "splitView";
  }
  return null;
};

const generatedGroupId = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `generated-${slug.length > 0 ? slug : "group"}`;
};
