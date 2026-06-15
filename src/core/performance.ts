export type PerformanceClock = {
  readonly now: () => number;
};

export type MeasuredResult<T> = {
  readonly value: T;
  readonly elapsedMs: number;
};

export const measureElapsed = <T>(clock: PerformanceClock, operation: () => T): MeasuredResult<T> => {
  const startMs = clock.now();
  const value = operation();
  return { value, elapsedMs: clock.now() - startMs };
};
