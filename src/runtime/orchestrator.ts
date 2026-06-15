import { createCategoryPlan } from "../core/categoryPlan";
import { planGroupMutations } from "../core/groupPlanner";
import { createOperationCoordinator, type OperationCoordinator } from "../core/operations";
import { buildPromptPayload } from "../core/promptPayload";
import { parseCategoryResponse } from "../core/responseParser";
import { captureUndoSnapshot, type UndoSnapshot } from "../core/undo";
import { getProviderReadiness, type ReadinessDenial } from "../privacy/providerReadiness";
import { requestProviderCompletion, type ProviderRequest, type ProviderResult } from "../providers";
import { collectCurrentWorkspaceSnapshots, resolveZenAdapter } from "../zen/adapter";
import { applyGroupMutations } from "../zen/groupMutations";
import { readRuntimePreferencesFromRuntime } from "./preferences";
import { selectScopeSnapshots, toPlannerTabs } from "./scope";
import { createNeuroSortStateStore, type NeuroSortStateStore, type NeuroSortUiState } from "./state";
import { runUndo, snapshotInput, toZenMutations } from "./undoRuntime";

export type TidyTrigger = "defaultClick" | "menu" | "modifier" | "selected" | "auto" | "shortcut";

export type TidyRequest = {
  readonly trigger: TidyTrigger;
  readonly selectedTabIds?: readonly string[];
};

export type TidyResult =
  | { readonly status: "tidied"; readonly movedTabIds: readonly string[] }
  | { readonly status: "partial_failure"; readonly missingTabIds: readonly string[] }
  | { readonly status: "provider_denied"; readonly reason: ReadinessDenial["reason"] }
  | { readonly status: "provider_failed"; readonly reason: Exclude<ProviderResult, { readonly ok: true }>["reason"] }
  | { readonly status: "adapter_failed"; readonly missingApi: string }
  | { readonly status: "busy" }
  | { readonly status: "empty" };

export type UndoResult =
  | { readonly status: "undone"; readonly restoredTabIds: readonly string[] }
  | { readonly status: "no_undo" }
  | { readonly status: "adapter_failed"; readonly missingApi: string }
  | { readonly status: "busy" };

export type NeuroSortProviderCompletion = (request: ProviderRequest) => Promise<ProviderResult>;

export type NeuroSortApp = {
  readonly tidy: (request: TidyRequest) => Promise<TidyResult>;
  readonly undo: () => Promise<UndoResult>;
  readonly state: () => NeuroSortUiState;
};

export type NeuroSortAppOptions = {
  readonly provider?: NeuroSortProviderCompletion;
  readonly stateStore?: NeuroSortStateStore;
  readonly coordinator?: OperationCoordinator;
};

export const createNeuroSortApp = (runtime: unknown, options: NeuroSortAppOptions = {}): NeuroSortApp => {
  const provider = options.provider ?? requestProviderCompletion;
  const stateStore = options.stateStore ?? createNeuroSortStateStore();
  const coordinator = options.coordinator ?? createOperationCoordinator();
  let undoSnapshot: UndoSnapshot | null = null;

  const tidy = async (request: TidyRequest): Promise<TidyResult> => {
    const result = await coordinator.run(operationKind(request.trigger), async (context) => {
      stateStore.set({ status: "running", message: "Tidying tabs", canUndo: undoSnapshot !== null });
      return runTidy(runtime, request, provider, context.signal);
    });
    if (result.status !== "completed") {
      return { status: "busy" };
    }
    if (result.value.undoSnapshot !== null) {
      undoSnapshot = result.value.undoSnapshot;
    }
    stateStore.set(stateAfterTidy(result.value.result, undoSnapshot !== null));
    return result.value.result;
  };

  const undo = async (): Promise<UndoResult> => {
    if (undoSnapshot === null) {
      return { status: "no_undo" };
    }
    const snapshot = undoSnapshot;
    const result = await coordinator.run("undo", () => runUndo(runtime, snapshot));
    if (result.status !== "completed") {
      return { status: "busy" };
    }
    if (result.value.status === "undone") {
      undoSnapshot = null;
      stateStore.set({ status: "idle", message: "Undo complete", canUndo: false });
    }
    return result.value;
  };

  return { tidy, undo, state: stateStore.get };
};

type TidyExecution = {
  readonly result: TidyResult;
  readonly undoSnapshot: UndoSnapshot | null;
};

const runTidy = async (
  runtime: unknown,
  request: TidyRequest,
  provider: NeuroSortProviderCompletion,
  signal: AbortSignal,
): Promise<TidyExecution> => {
  const adapterResult = resolveZenAdapter(runtime);
  if (!adapterResult.ok) {
    return { result: { status: "adapter_failed", missingApi: adapterResult.error.missingApi }, undoSnapshot: null };
  }
  const prefs = readRuntimePreferencesFromRuntime(runtime);
  if (prefs === null) {
    return { result: { status: "adapter_failed", missingApi: "Services.prefs" }, undoSnapshot: null };
  }
  if (!prefs.enabled) {
    return { result: { status: "empty" }, undoSnapshot: null };
  }
  const readiness = getProviderReadiness(prefs.provider);
  if (!readiness.ok) {
    return { result: { status: "provider_denied", reason: readiness.reason }, undoSnapshot: null };
  }

  const snapshots = collectCurrentWorkspaceSnapshots(adapterResult.value, { preservePinnedTabs: prefs.preservePinned });
  const scopedSnapshots = selectScopeSnapshots(snapshots, request.trigger, request.selectedTabIds);
  const payload = buildPromptPayload(scopedSnapshots, { includeDescriptions: prefs.fetchDescriptions });
  if (payload.tabs.length === 0) {
    return { result: { status: "empty" }, undoSnapshot: null };
  }

  const providerResult = await provider({
    settings: prefs.provider,
    prompt: JSON.stringify(payload),
    maxTokens: 800,
    signal,
  });
  if (!providerResult.ok) {
    return { result: { status: "provider_failed", reason: providerResult.reason }, undoSnapshot: null };
  }

  const assignments = parseCategoryResponse(providerResult.text, payload.tabs.map((tab) => tab.id));
  const categoryPlan = createCategoryPlan(payload.tabs, assignments, { minGroupSize: prefs.minGroupSize });
  const mutationPlan = planGroupMutations({ tabs: toPlannerTabs(scopedSnapshots), categories: categoryPlan.groups });
  const undoSnapshot = captureUndoSnapshot(snapshotInput(adapterResult.value));
  const mutationResult = applyGroupMutations(adapterResult.value, toZenMutations(mutationPlan.operations));
  if (!mutationResult.ok) {
    return { result: { status: "adapter_failed", missingApi: mutationResult.error.missingApi }, undoSnapshot: null };
  }
  if (mutationResult.value.missingTabIds.length > 0) {
    return { result: { status: "partial_failure", missingTabIds: mutationResult.value.missingTabIds }, undoSnapshot };
  }
  return { result: { status: "tidied", movedTabIds: mutationResult.value.movedTabIds }, undoSnapshot };
};

const operationKind = (trigger: TidyTrigger): "manualTidy" | "autoTidy" | "shortcutTidy" => {
  switch (trigger) {
    case "auto":
      return "autoTidy";
    case "shortcut":
      return "shortcutTidy";
    case "defaultClick":
    case "menu":
    case "modifier":
    case "selected":
      return "manualTidy";
    default:
      return assertNever(trigger);
  }
};

const stateAfterTidy = (result: TidyResult, canUndo: boolean): NeuroSortUiState => {
  switch (result.status) {
    case "tidied":
      return { status: "idle", message: "Tabs tidied", canUndo };
    case "partial_failure":
      return { status: "partial", message: "Tidy partially completed", canUndo };
    case "provider_denied":
      return { status: "blocked", message: result.reason, canUndo };
    case "provider_failed":
      return { status: "failed", message: "Provider request failed", canUndo };
    case "adapter_failed":
      return { status: "failed", message: `Tab grouping is unavailable: ${result.missingApi}`, canUndo };
    case "busy":
      return { status: "running", message: "Operation in progress", canUndo };
    case "empty":
      return { status: "idle", message: "No eligible tabs", canUndo };
    default:
      return assertNever(result);
  }
};

const assertNever = (value: never): never => {
  throw new UnexpectedRuntimeVariantError(value);
};

class UnexpectedRuntimeVariantError extends Error {
  public override readonly name = "UnexpectedRuntimeVariantError";

  public constructor(readonly value: never) {
    super("Unexpected runtime variant");
  }
}
