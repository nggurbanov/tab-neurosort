export type PromptChunkOptions = {
  readonly maxTabsPerPrompt?: number;
};

export type MetadataBatchOptions = {
  readonly maxTabsPerBatch?: number;
};

export type OperationChunkOptions = {
  readonly maxSynchronousMs?: number;
  readonly estimatedMsPerOperation?: number;
};

export type OperationChunk<T> = {
  readonly operations: readonly T[];
  readonly estimatedSynchronousMs: number;
};

const DEFAULT_MAX_TABS_PER_PROMPT = 80;
const DEFAULT_MAX_TABS_PER_METADATA_BATCH = 25;
const DEFAULT_MAX_SYNCHRONOUS_MS = 50;
const DEFAULT_ESTIMATED_MS_PER_OPERATION = 1;

export const chunkPromptTabs = <T>(
  tabs: readonly T[],
  options: PromptChunkOptions = {},
): readonly (readonly T[])[] => {
  return chunkItems(tabs, positiveIntegerOrDefault(options.maxTabsPerPrompt, DEFAULT_MAX_TABS_PER_PROMPT));
};

export const batchMetadataTabs = <T>(
  tabs: readonly T[],
  options: MetadataBatchOptions = {},
): readonly (readonly T[])[] => {
  return chunkItems(tabs, positiveIntegerOrDefault(options.maxTabsPerBatch, DEFAULT_MAX_TABS_PER_METADATA_BATCH));
};

export const planOperationChunks = <T>(
  operations: readonly T[],
  options: OperationChunkOptions = {},
): readonly OperationChunk<T>[] => {
  const maxSynchronousMs = positiveIntegerOrDefault(options.maxSynchronousMs, DEFAULT_MAX_SYNCHRONOUS_MS);
  const estimatedMsPerOperation = positiveIntegerOrDefault(
    options.estimatedMsPerOperation,
    DEFAULT_ESTIMATED_MS_PER_OPERATION,
  );
  const maxOperationsPerChunk = Math.max(1, Math.floor(maxSynchronousMs / estimatedMsPerOperation));

  return chunkItems(operations, maxOperationsPerChunk).map((chunk) => ({
    operations: chunk,
    estimatedSynchronousMs: chunk.length * estimatedMsPerOperation,
  }));
};

const chunkItems = <T>(items: readonly T[], size: number): readonly (readonly T[])[] => {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
};

const positiveIntegerOrDefault = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return fallback;
  }
  return value;
};
