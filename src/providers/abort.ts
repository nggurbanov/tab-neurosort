import { DEFAULT_TIMEOUT_MS } from "./bounds";

export type AbortBundle = {
  readonly signal: AbortSignal;
  readonly getReason: () => "aborted" | "timeout";
  readonly dispose: () => void;
};

export const createTimeoutSignal = (input?: {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}): AbortBundle => {
  const controller = new AbortController();
  let reason: "aborted" | "timeout" = input?.signal?.aborted === true ? "aborted" : "timeout";
  const timeoutMs = input?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const timeoutId = globalThis.setTimeout(() => {
    reason = "timeout";
    controller.abort();
  }, timeoutMs);

  const abortFromCaller = (): void => {
    reason = "aborted";
    controller.abort();
  };

  if (input?.signal?.aborted === true) {
    abortFromCaller();
  } else {
    input?.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  return {
    signal: controller.signal,
    getReason: () => reason,
    dispose: (): void => {
      globalThis.clearTimeout(timeoutId);
      input?.signal?.removeEventListener("abort", abortFromCaller);
    },
  };
};
