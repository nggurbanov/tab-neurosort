import type { OperationCoordinator, OperationRunResult } from "./operations";

export type Clock = {
  readonly now: () => number;
};

export type AutoTidyPolicy = {
  readonly enabled: boolean;
  readonly threshold: number;
  readonly cooldownMs: number;
};

export type AutoTidyState = {
  readonly lastRunAt: number | null;
};

export type AutoTidyCheck =
  | { readonly shouldRun: true }
  | { readonly shouldRun: false; readonly reason: "cooldown" | "disabled" | "threshold" };
export type AutoTidySkipReason = Extract<AutoTidyCheck, { readonly shouldRun: false }>["reason"];

export type AutoTidyController = {
  readonly shouldRun: (ungroupedTabCount: number) => AutoTidyCheck;
  readonly run: <T>(
    ungroupedTabCount: number,
    task: () => Promise<T> | T,
  ) => Promise<OperationRunResult<T> | { readonly status: "skipped"; readonly reason: AutoTidySkipReason }>;
  readonly state: () => AutoTidyState;
};

export const createAutoTidyController = (
  policy: AutoTidyPolicy,
  coordinator: OperationCoordinator,
  clock: Clock,
): AutoTidyController => {
  let lastRunAt: number | null = null;

  const shouldRun = (ungroupedTabCount: number): AutoTidyCheck => {
    if (!policy.enabled) {
      return { shouldRun: false, reason: "disabled" };
    }
    if (ungroupedTabCount < policy.threshold) {
      return { shouldRun: false, reason: "threshold" };
    }
    if (lastRunAt !== null && clock.now() - lastRunAt < policy.cooldownMs) {
      return { shouldRun: false, reason: "cooldown" };
    }
    return { shouldRun: true };
  };

  return {
    shouldRun,
    run: async (ungroupedTabCount, task) => {
      const check = shouldRun(ungroupedTabCount);
      if (!check.shouldRun) {
        return { status: "skipped", reason: check.reason };
      }

      const result = await coordinator.run("autoTidy", task);
      if (result.status === "completed") {
        lastRunAt = clock.now();
      }
      return result;
    },
    state: () => ({ lastRunAt }),
  };
};
