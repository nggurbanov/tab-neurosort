export type NeuroSortUiStatus = "idle" | "running" | "blocked" | "failed" | "partial";

export type NeuroSortUiState = {
  readonly status: NeuroSortUiStatus;
  readonly message: string;
  readonly canUndo: boolean;
};

export type NeuroSortStateStore = {
  readonly get: () => NeuroSortUiState;
  readonly set: (state: NeuroSortUiState) => void;
};

export const createNeuroSortStateStore = (): NeuroSortStateStore => {
  let state: NeuroSortUiState = { status: "idle", message: "Ready", canUndo: false };
  return {
    get: () => state,
    set: (next) => {
      state = next;
    },
  };
};
