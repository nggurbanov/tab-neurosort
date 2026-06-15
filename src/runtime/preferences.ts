import type { PlatformPrefs } from "../platform";
import type { ProviderSettings } from "../privacy/providerReadiness";

export type RuntimePreferences = {
  readonly enabled: boolean;
  readonly fetchDescriptions: boolean;
  readonly minGroupSize: number;
  readonly preservePinned: boolean;
  readonly provider: ProviderSettings;
};

export const readRuntimePreferences = (prefs: PlatformPrefs): RuntimePreferences => {
  const provider = readString(prefs, "extensions.neurosort.provider", "disabled");
  return {
    enabled: readBool(prefs, "extensions.neurosort.enabled", true),
    fetchDescriptions: readBool(prefs, "extensions.neurosort.fetch_descriptions", false),
    minGroupSize: readInt(prefs, "extensions.neurosort.min_group_size", 2),
    preservePinned: readBool(prefs, "extensions.neurosort.preserve_pinned", true),
    provider: providerSettings(provider, prefs),
  };
};

export const readRuntimePreferencesFromRuntime = (runtime: unknown): RuntimePreferences | null => {
  const services = getProperty(runtime, "Services");
  const prefs = getProperty(services, "prefs");
  return isPlatformPrefs(prefs) ? readRuntimePreferences(prefs) : null;
};

const providerSettings = (provider: string, prefs: PlatformPrefs): ProviderSettings => {
  switch (provider) {
    case "openai":
      return {
        provider,
        consentToSendData: readBool(prefs, "extensions.neurosort.data_consent", false),
        endpoint: readString(prefs, "extensions.neurosort.openai.endpoint", ""),
        apiKey: readString(prefs, "extensions.neurosort.openai.api_key", ""),
        model: readString(prefs, "extensions.neurosort.openai.model", ""),
      };
    case "gemini":
      return {
        provider,
        consentToSendData: readBool(prefs, "extensions.neurosort.data_consent", false),
        apiKey: readString(prefs, "extensions.neurosort.gemini.api_key", ""),
        model: readString(prefs, "extensions.neurosort.gemini.model", ""),
      };
    case "ollama":
      return {
        provider,
        consentToSendData: readBool(prefs, "extensions.neurosort.data_consent", false),
        endpoint: readString(prefs, "extensions.neurosort.ollama.endpoint", ""),
        model: readString(prefs, "extensions.neurosort.ollama.model", ""),
      };
    case "custom":
      return {
        provider,
        consentToSendData: readBool(prefs, "extensions.neurosort.data_consent", false),
        endpoint: readString(prefs, "extensions.neurosort.custom.endpoint", ""),
        apiKey: readString(prefs, "extensions.neurosort.custom.api_key", ""),
        model: readString(prefs, "extensions.neurosort.custom.model", ""),
        format: readCustomFormat(prefs),
      };
    default:
      return { provider: "disabled", consentToSendData: readBool(prefs, "extensions.neurosort.data_consent", false) };
  }
};

const readCustomFormat = (prefs: PlatformPrefs): "openai" | "ollama" => {
  const value = readString(prefs, "extensions.neurosort.custom.format", "openai_chat");
  return value === "ollama_generate" || value === "ollama" ? "ollama" : "openai";
};

const readString = (prefs: PlatformPrefs, name: string, fallback: string): string => {
  return prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_STRING ? prefs.getStringPref(name) : fallback;
};

const readBool = (prefs: PlatformPrefs, name: string, fallback: boolean): boolean => {
  return prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_BOOL ? prefs.getBoolPref(name) : fallback;
};

const readInt = (prefs: PlatformPrefs, name: string, fallback: number): number => {
  return prefs.prefHasUserValue(name) && prefs.getPrefType(name) === prefs.PREF_INT ? prefs.getIntPref(name) : fallback;
};

const isPlatformPrefs = (value: unknown): value is PlatformPrefs => {
  return (
    typeof getProperty(value, "PREF_STRING") === "number" &&
    typeof getProperty(value, "PREF_INT") === "number" &&
    typeof getProperty(value, "PREF_BOOL") === "number" &&
    isCallable(getProperty(value, "prefHasUserValue")) &&
    isCallable(getProperty(value, "getPrefType")) &&
    isCallable(getProperty(value, "getStringPref")) &&
    isCallable(getProperty(value, "getIntPref")) &&
    isCallable(getProperty(value, "getBoolPref"))
  );
};

const isCallable = (value: unknown): value is (...args: readonly unknown[]) => unknown => {
  return typeof value === "function";
};

const getProperty = (value: unknown, key: string): unknown => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return Reflect.get(value, key);
};
