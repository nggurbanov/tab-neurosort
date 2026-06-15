import { describe, expect, it } from "vitest";
import { createAutoTidyController, type Clock } from "../../src/core/autoTidy";
import { createOperationCoordinator } from "../../src/core/operations";

const createClock = (initialNow: number): Clock & { readonly advance: (ms: number) => void } => {
  let currentNow = initialNow;
  return {
    now: () => currentNow,
    advance: (ms) => {
      currentNow += ms;
    },
  };
};

describe("auto tidy policy", () => {
  it("skips when disabled or below threshold", () => {
    const coordinator = createOperationCoordinator();
    const clock = createClock(1_000);
    const disabled = createAutoTidyController(
      { enabled: false, threshold: 3, cooldownMs: 500 },
      coordinator,
      clock,
    );
    const belowThreshold = createAutoTidyController(
      { enabled: true, threshold: 3, cooldownMs: 500 },
      coordinator,
      clock,
    );

    expect(disabled.shouldRun(10)).toEqual({ shouldRun: false, reason: "disabled" });
    expect(belowThreshold.shouldRun(2)).toEqual({ shouldRun: false, reason: "threshold" });
  });

  it("uses an injected clock for cooldown without sleeps", async () => {
    const coordinator = createOperationCoordinator();
    const clock = createClock(1_000);
    const autoTidy = createAutoTidyController(
      { enabled: true, threshold: 3, cooldownMs: 500 },
      coordinator,
      clock,
    );

    await expect(autoTidy.run(3, () => "tidied")).resolves.toEqual({
      status: "completed",
      value: "tidied",
    });
    await expect(autoTidy.run(3, () => "too-soon")).resolves.toEqual({
      status: "skipped",
      reason: "cooldown",
    });

    clock.advance(500);
    await expect(autoTidy.run(3, () => "tidied-again")).resolves.toEqual({
      status: "completed",
      value: "tidied-again",
    });
  });

  it("never starts auto tidy during manual tidy", async () => {
    const coordinator = createOperationCoordinator();
    const clock = createClock(1_000);
    const autoTidy = createAutoTidyController(
      { enabled: true, threshold: 1, cooldownMs: 0 },
      coordinator,
      clock,
    );
    const manual = coordinator.run("manualTidy", () => new Promise(() => undefined));

    await expect(autoTidy.run(1, () => "auto")).resolves.toEqual({
      status: "ignored",
      reason: "manual-tidy-in-progress",
    });
    expect(coordinator.cancelCurrent()).toBe(true);
    void manual;
  });
});
