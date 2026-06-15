import { describe, expect, it } from "vitest";
import { createOperationCoordinator } from "../../src/core/operations";

const deferred = <T>(_example: T) => {
  let resolveValue: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });
  return { promise, resolve: resolveValue };
};

describe("operation coordinator", () => {
  it("ignores duplicate tidy while sorting", async () => {
    const coordinator = createOperationCoordinator();
    const sorting = deferred("sorted");

    const first = coordinator.run("manualTidy", () => sorting.promise);
    const duplicate = await coordinator.run("shortcutTidy", () => "should-not-run");

    expect(duplicate).toEqual({ status: "ignored", reason: "tidy-in-progress" });
    sorting.resolve("sorted");
    await expect(first).resolves.toEqual({ status: "completed", value: "sorted" });
  });

  it("blocks undo while sorting", async () => {
    const coordinator = createOperationCoordinator();
    const sorting = deferred("sorted");

    const first = coordinator.run("manualTidy", () => sorting.promise);
    const undo = await coordinator.run("undo", () => "undone");

    expect(undo).toEqual({ status: "blocked", reason: "sorting-in-progress" });
    sorting.resolve("sorted");
    await first;
  });

  it("releases the lock after a failed operation so another operation can resume", async () => {
    const coordinator = createOperationCoordinator();

    const failed = await coordinator.run("manualTidy", () => {
      throw new TypeError("provider failed");
    });
    const resumed = await coordinator.run("undo", () => "undone");

    expect(failed.status).toBe("failed");
    expect(resumed).toEqual({ status: "completed", value: "undone" });
  });

  it("cancels an in-flight operation and releases after the task observes abort", async () => {
    const coordinator = createOperationCoordinator();
    const cancelled = deferred("cancelled");

    const operation = coordinator.run("manualTidy", ({ signal }) => {
      signal.addEventListener("abort", () => cancelled.resolve("cancelled"), { once: true });
      return cancelled.promise;
    });

    expect(coordinator.cancelCurrent("test cancel")).toBe(true);
    await expect(operation).resolves.toEqual({ status: "completed", value: "cancelled" });
    await expect(coordinator.run("undo", () => "resumed")).resolves.toEqual({
      status: "completed",
      value: "resumed",
    });
  });
});
