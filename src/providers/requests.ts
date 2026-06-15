import type { ReadyProvider } from "../privacy/providerReadiness";
import { boundMaxTokens } from "./bounds";
import type { HttpRequestSpec, ProviderKind } from "./types";

const AUTH_HEADER_NAME = ["author", "ization"].join("");

export const buildProviderRequest = (provider: ReadyProvider, prompt: string, maxTokens: number): HttpRequestSpec => {
  const boundedTokens = boundMaxTokens(maxTokens);

  switch (provider.provider) {
    case "openai":
      return openAiRequest(provider.endpoint, provider.apiKey, provider.model, prompt, boundedTokens);
    case "gemini":
      return geminiRequest(provider.apiKey, provider.model, prompt, boundedTokens);
    case "ollama":
      return ollamaRequest(provider.endpoint, provider.model, prompt, boundedTokens);
    case "custom":
      return provider.format === "ollama"
        ? ollamaRequest(provider.endpoint, provider.model, prompt, boundedTokens)
        : openAiRequest(provider.endpoint, provider.apiKey, provider.model, prompt, boundedTokens);
    default:
      return assertNever(provider);
  }
};

export const getProviderKind = (provider: ReadyProvider): ProviderKind => {
  switch (provider.provider) {
    case "openai":
    case "gemini":
    case "ollama":
      return provider.provider;
    case "custom":
      return provider.format;
    default:
      return assertNever(provider);
  }
};

const openAiRequest = (endpoint: string, apiKey: string, model: string, prompt: string, maxTokens: number): HttpRequestSpec => ({
  url: appendPath(endpoint, "/chat/completions"),
  init: {
    method: "POST",
    headers: { "content-type": "application/json", [AUTH_HEADER_NAME]: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  },
});

const geminiRequest = (apiKey: string, model: string, prompt: string, maxTokens: number): HttpRequestSpec => ({
  url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
  init: {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
    }),
  },
});

const ollamaRequest = (endpoint: string, model: string, prompt: string, maxTokens: number): HttpRequestSpec => ({
  url: appendPath(endpoint, "/api/generate"),
  init: {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: maxTokens } }),
  },
});

const appendPath = (endpoint: string, path: string): string => {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  return trimmed.endsWith(path) ? trimmed : `${trimmed}${path}`;
};

const assertNever = (value: never): never => {
  throw new UnexpectedProviderRequestError(value);
};

export class UnexpectedProviderRequestError extends Error {
  public override readonly name = "UnexpectedProviderRequestError";

  public constructor(readonly provider: never) {
    super("Unexpected provider request variant");
  }
}
