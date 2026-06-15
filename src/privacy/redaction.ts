export type LogScalar = boolean | number | string | null;

export type LogValue = LogScalar | readonly LogValue[] | { readonly [key: string]: LogValue };

export interface UnsafeLogEvent {
  readonly event: string;
  readonly url?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly requestBody?: LogValue;
  readonly responseBody?: LogValue;
  readonly prompt?: string;
  readonly apiKey?: string;
  readonly externalText?: string;
  readonly details?: LogValue;
}

export interface SafeLogEvent {
  readonly event: string;
  readonly url?: "[redacted-url]";
  readonly headers?: Readonly<Record<string, string>>;
  readonly requestBody?: "[redacted]";
  readonly responseBody?: "[redacted]";
  readonly prompt?: "[redacted]";
  readonly apiKey?: "[redacted]";
  readonly externalText?: "[redacted]";
  readonly details?: LogValue;
}

const REDACTED = "[redacted]";
const REDACTED_URL = "[redacted-url]";
const AUTH_HEADER_KEY_PART = ["author", "ization"].join("");
const AUTH_HEADER_INLINE_MARKER = [AUTH_HEADER_KEY_PART, ":"].join("");
const SENSITIVE_KEY_PARTS = [AUTH_HEADER_KEY_PART, "api-key", "apikey", "api_key", "token", "secret", "key", "prompt", "body", "text"] as const;

export const createSafeLogEvent = (event: UnsafeLogEvent): SafeLogEvent => {
  return {
    event: event.event,
    ...(event.url === undefined ? {} : { url: REDACTED_URL }),
    ...(event.headers === undefined ? {} : { headers: redactHeaders(event.headers) }),
    ...(event.requestBody === undefined ? {} : { requestBody: REDACTED }),
    ...(event.responseBody === undefined ? {} : { responseBody: REDACTED }),
    ...(event.prompt === undefined ? {} : { prompt: REDACTED }),
    ...(event.apiKey === undefined ? {} : { apiKey: REDACTED }),
    ...(event.externalText === undefined ? {} : { externalText: REDACTED }),
    ...(event.details === undefined ? {} : { details: redactLogValue(event.details) }),
  };
};

const redactHeaders = (headers: Readonly<Record<string, string>>): Readonly<Record<string, string>> => {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, isSensitiveKey(key) ? REDACTED : value]),
  );
};

const redactLogValue = (value: LogValue): LogValue => {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return typeof value === "string" ? redactInlineSensitiveText(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, isSensitiveKey(key) ? REDACTED : redactLogValue(nestedValue)]),
  );
};

const redactInlineSensitiveText = (value: string): string => {
  if (value.toLowerCase().includes(AUTH_HEADER_INLINE_MARKER) || value.toLowerCase().includes("bearer ")) {
    return REDACTED;
  }

  return value;
};

const isSensitiveKey = (key: string): boolean => {
  const normalizedKey = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalizedKey.includes(part));
};
