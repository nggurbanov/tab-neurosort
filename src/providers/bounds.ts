export const MAX_PROMPT_CHARS = 24_000;
export const MAX_REQUEST_BYTES = 32_000;
export const DEFAULT_TIMEOUT_MS = 30_000;

const MIN_MAX_TOKENS = 1;
const MAX_MAX_TOKENS = 4_096;

export const boundMaxTokens = (maxTokens: number): number => {
  if (!Number.isFinite(maxTokens)) {
    return MIN_MAX_TOKENS;
  }

  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, Math.round(maxTokens)));
};

export const isPromptWithinBounds = (prompt: string): boolean => {
  return prompt.length <= MAX_PROMPT_CHARS;
};

export const isJsonBodyWithinBounds = (body: string): boolean => {
  return new TextEncoder().encode(body).byteLength <= MAX_REQUEST_BYTES;
};
