export const PROVIDER_NAMES = ["disabled", "openai", "gemini", "ollama", "custom"] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

export type ProviderSettings =
  | { readonly provider: "disabled"; readonly consentToSendData: boolean }
  | {
      readonly provider: "openai";
      readonly consentToSendData: boolean;
      readonly endpoint: string;
      readonly apiKey: string;
      readonly model: string;
    }
  | {
      readonly provider: "gemini";
      readonly consentToSendData: boolean;
      readonly apiKey: string;
      readonly model: string;
    }
  | {
      readonly provider: "ollama";
      readonly consentToSendData: boolean;
      readonly endpoint: string;
      readonly model: string;
    }
  | {
      readonly provider: "custom";
      readonly consentToSendData: boolean;
      readonly endpoint: string;
      readonly apiKey: string;
      readonly model: string;
      readonly format: "openai" | "ollama";
    };

export type ReadyProvider = Exclude<ProviderSettings, { readonly provider: "disabled" }> & {
  readonly consentToSendData: true;
};

export type ReadinessDenial =
  | { readonly ok: false; readonly reason: "provider_disabled" }
  | { readonly ok: false; readonly reason: "consent_required" }
  | {
      readonly ok: false;
      readonly reason: "missing_required_config";
      readonly missingFields: readonly string[];
    };

export type ReadinessResult =
  | { readonly ok: true; readonly value: ReadyProvider }
  | ReadinessDenial;

export type ProviderFetchResult<T> =
  | { readonly ok: true; readonly value: T }
  | ReadinessDenial;

export const getProviderReadiness = (settings: ProviderSettings): ReadinessResult => {
  if (settings.provider === "disabled") {
    return { ok: false, reason: "provider_disabled" };
  }

  if (!settings.consentToSendData) {
    return { ok: false, reason: "consent_required" };
  }

  const missingFields = getMissingRequiredFields(settings);
  if (missingFields.length > 0) {
    return { ok: false, reason: "missing_required_config", missingFields };
  }

  return { ok: true, value: { ...settings, consentToSendData: true } };
};

export const requestProviderFetch = async <T>(
  settings: ProviderSettings,
  fetchProvider: (readyProvider: ReadyProvider) => Promise<T>,
): Promise<ProviderFetchResult<T>> => {
  const readiness = getProviderReadiness(settings);
  if (!readiness.ok) {
    return readiness;
  }

  return { ok: true, value: await fetchProvider(readiness.value) };
};

const getMissingRequiredFields = (settings: Exclude<ProviderSettings, { readonly provider: "disabled" }>): readonly string[] => {
  switch (settings.provider) {
    case "openai":
      return missingStringFields({ endpoint: settings.endpoint, apiKey: settings.apiKey, model: settings.model });
    case "gemini":
      return missingStringFields({ apiKey: settings.apiKey, model: settings.model });
    case "ollama":
      return missingStringFields({ endpoint: settings.endpoint, model: settings.model });
    case "custom":
      return missingStringFields({
        endpoint: settings.endpoint,
        apiKey: settings.apiKey,
        model: settings.model,
        format: settings.format,
      });
    default:
      return assertNever(settings);
  }
};

const missingStringFields = (fields: Readonly<Record<string, string>>): readonly string[] => {
  return Object.entries(fields)
    .filter(([, value]) => value.trim().length === 0)
    .map(([field]) => field);
};

const assertNever = (value: never): never => {
  throw new UnexpectedProviderError(value);
};

export class UnexpectedProviderError extends Error {
  public override readonly name = "UnexpectedProviderError";

  public constructor(readonly provider: never) {
    super("Unexpected provider variant");
  }
}
