export type OperationKind = "manualTidy" | "autoTidy" | "shortcutTidy" | "undo";

export type OperationRejectReason =
  | "manual-tidy-in-progress"
  | "operation-in-progress"
  | "sorting-in-progress"
  | "tidy-in-progress";

export type OperationRunResult<T> =
  | { readonly status: "completed"; readonly value: T }
  | { readonly status: "failed"; readonly error: unknown }
  | { readonly status: "ignored"; readonly reason: OperationRejectReason }
  | { readonly status: "blocked"; readonly reason: OperationRejectReason };

export type OperationContext = {
  readonly kind: OperationKind;
  readonly signal: AbortSignal;
};

export type OperationCoordinator = {
  readonly isBusy: () => boolean;
  readonly current: () => OperationKind | null;
  readonly cancelCurrent: (reason?: string) => boolean;
  readonly run: <T>(
    kind: OperationKind,
    task: (context: OperationContext) => Promise<T> | T,
  ) => Promise<OperationRunResult<T>>;
};

type ActiveOperation = {
  readonly kind: OperationKind;
  readonly abortController: AbortController;
};

export const createOperationCoordinator = (): OperationCoordinator => {
  let active: ActiveOperation | null = null;

  const run = async <T>(
    kind: OperationKind,
    task: (context: OperationContext) => Promise<T> | T,
  ): Promise<OperationRunResult<T>> => {
    const reject = getRejectResult<T>(kind, active?.kind ?? null);
    if (reject !== null) {
      return reject;
    }

    const operation: ActiveOperation = { kind, abortController: new AbortController() };
    active = operation;

    try {
      const value = await task({ kind, signal: operation.abortController.signal });
      return { status: "completed", value };
    } catch (error) {
      return { status: "failed", error };
    } finally {
      if (active === operation) {
        active = null;
      }
    }
  };

  return {
    isBusy: () => active !== null,
    current: () => active?.kind ?? null,
    cancelCurrent: (reason = "operation cancelled") => {
      if (active === null) {
        return false;
      }
      active.abortController.abort(reason);
      return true;
    },
    run,
  };
};

const getRejectResult = <T>(
  requested: OperationKind,
  current: OperationKind | null,
): OperationRunResult<T> | null => {
  if (current === null) {
    return null;
  }
  if (requested === "undo" && isSortingOperation(current)) {
    return { status: "blocked", reason: "sorting-in-progress" };
  }
  if (requested === "autoTidy" && current === "manualTidy") {
    return { status: "ignored", reason: "manual-tidy-in-progress" };
  }
  if (isSortingOperation(requested) && isSortingOperation(current)) {
    return { status: "ignored", reason: "tidy-in-progress" };
  }
  return { status: "blocked", reason: "operation-in-progress" };
};

const isSortingOperation = (kind: OperationKind): boolean => {
  return kind === "manualTidy" || kind === "autoTidy" || kind === "shortcutTidy";
};
