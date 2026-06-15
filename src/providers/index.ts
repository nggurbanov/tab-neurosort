import type { SafeLogger } from "../logging/safeLogger";
import { createSafeLogEvent } from "../privacy/redaction";
import { requestProviderFetch } from "../privacy/providerReadiness";
import { createTimeoutSignal } from "./abort";
import { isJsonBodyWithinBounds, isPromptWithinBounds } from "./bounds";
import { parseGeminiText, parseJson, parseOllamaText, parseOpenAiText } from "./parsing";
import { buildProviderRequest, getProviderKind } from "./requests";
import type { ProviderFetcher, ProviderRequest, ProviderResult } from "./types";

export type { ProviderFetcher, ProviderRequest, ProviderResult } from "./types";

const defaultFetcher: ProviderFetcher = (url, init) => globalThis.fetch(url, init);

export const requestProviderCompletion = async (request: ProviderRequest): Promise<ProviderResult> => {
  if (!isPromptWithinBounds(request.prompt)) {
    return { ok: false, reason: "request_too_large" };
  }

  const result = await requestProviderFetch<ProviderResult>(request.settings, async (readyProvider) => {
    const spec = buildProviderRequest(readyProvider, request.prompt, request.maxTokens);
    if (typeof spec.init.body !== "string" || !isJsonBodyWithinBounds(spec.init.body)) {
      return { ok: false, reason: "request_too_large" };
    }

    const abort = createTimeoutSignal({
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    try {
      const response = await (request.fetcher ?? defaultFetcher)(spec.url, { ...spec.init, signal: abort.signal });
      if (!response.ok) {
        await logFailure(request.logger, spec.url, spec.init, response);
        return { ok: false, reason: "provider_http_error", status: response.status };
      }

      const text = await response.text();
      return parseResponse(getProviderKind(readyProvider), text);
    } catch (error) {
      if (isAbortError(error)) {
        return abortResult(abort.getReason());
      }

      throw error;
    } finally {
      abort.dispose();
    }
  });

  return result.ok ? result.value : result;
};

const parseResponse = (kind: "openai" | "gemini" | "ollama", text: string): ProviderResult => {
  const parsedText = kind === "ollama" ? parseOllamaText(text) : parseStructuredResponse(kind, text);
  return parsedText === null ? { ok: false, reason: "malformed_response" } : { ok: true, text: parsedText };
};

const parseStructuredResponse = (kind: "openai" | "gemini", text: string): string | null => {
  const json = parseJson(text);
  return kind === "openai" ? parseOpenAiText(json) : parseGeminiText(json);
};

const logFailure = async (logger: SafeLogger | undefined, url: string, init: RequestInit, response: Response): Promise<void> => {
  if (logger === undefined) {
    return;
  }

  const responseBody = await response.text();
  const headers = headersToRecord(init.headers);
  const event = createSafeLogEvent({
    event: "provider_fetch_failed",
    url,
    responseBody: { body: responseBody },
    details: { status: response.status },
    ...(headers === undefined ? {} : { headers }),
    ...(typeof init.body === "string" ? { requestBody: { body: init.body } } : {}),
  });
  logger.debug(event);
};

const headersToRecord = (headers: HeadersInit | undefined): Readonly<Record<string, string>> | undefined => {
  if (headers === undefined) {
    return undefined;
  }

  if (headers instanceof Headers) {
    const entries: Record<string, string> = {};
    headers.forEach((value, key) => {
      entries[key] = value;
    });
    return entries;
  }

  return Array.isArray(headers) ? Object.fromEntries(headers) : headers;
};

const isAbortError = (error: unknown): boolean => {
  return error instanceof DOMException && error.name === "AbortError";
};

const abortResult = (reason: "aborted" | "timeout"): ProviderResult => {
  switch (reason) {
    case "aborted":
      return { ok: false, reason: "aborted" };
    case "timeout":
      return { ok: false, reason: "timeout" };
    default:
      return assertNever(reason);
  }
};

const assertNever = (value: never): never => {
  throw new UnexpectedAbortReasonError(value);
};

class UnexpectedAbortReasonError extends Error {
  public override readonly name = "UnexpectedAbortReasonError";

  public constructor(readonly reason: never) {
    super("Unexpected abort reason");
  }
}
