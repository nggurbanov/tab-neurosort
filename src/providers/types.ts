import type { SafeLogger } from "../logging/safeLogger";
import type { ReadinessDenial } from "../privacy/providerReadiness";

export type ProviderFetcher = (url: string, init: RequestInit) => Promise<Response>;

export type ProviderRequest = {
  readonly settings: import("../privacy/providerReadiness").ProviderSettings;
  readonly prompt: string;
  readonly maxTokens: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly fetcher?: ProviderFetcher;
  readonly logger?: SafeLogger;
};

export type ProviderResult =
  | { readonly ok: true; readonly text: string }
  | ReadinessDenial
  | { readonly ok: false; readonly reason: "request_too_large" }
  | { readonly ok: false; readonly reason: "provider_http_error"; readonly status: number }
  | { readonly ok: false; readonly reason: "malformed_response" }
  | { readonly ok: false; readonly reason: "aborted" }
  | { readonly ok: false; readonly reason: "timeout" };

export type HttpRequestSpec = {
  readonly url: string;
  readonly init: RequestInit;
};

export type ProviderKind = "openai" | "gemini" | "ollama";
