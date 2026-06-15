export type PreferenceOption = {
  readonly value: string | boolean
  readonly label: string
}

export type PreferenceCondition = {
  readonly if: { readonly property: string; readonly value: string | boolean }
}

export type PreferenceDefinition = {
  readonly property: string
  readonly type: "checkbox" | "dropdown" | "number" | "string"
  readonly label: string
  readonly defaultValue?: string | boolean | number
  readonly placeholder?: string | boolean
  readonly value?: "number" | "bool"
  readonly min?: number
  readonly max?: number
  readonly options?: readonly PreferenceOption[]
  readonly conditions?: readonly PreferenceCondition[]
}

export type PreferenceStaticEntry = {
  readonly type: "text" | "separator"
  readonly label: string
  readonly size?: string
  readonly margin?: string
}

export type PreferenceEntry = PreferenceDefinition | PreferenceStaticEntry

export type PreferenceValidationResult =
  | { readonly ok: true; readonly preferences: readonly PreferenceEntry[] }
  | { readonly ok: false; readonly errors: readonly string[] }

export const unsupportedLegacyPreferenceKeys = [
  "extensions.neurosort.auto_tidy_cooldown", "extensions.neurosort.setup_complete", "extensions.neurosort.use_existing_groups",
] as const satisfies readonly string[]

export const preferenceDefinitions = [
  {
    "property": "extensions.neurosort.enabled",
    "type": "checkbox",
    "label": "Enable NeuroSort",
    "defaultValue": true
  },
  {
    "property": "extensions.neurosort.provider",
    "type": "dropdown",
    "label": "AI provider",
    "defaultValue": "disabled",
    "placeholder": false,
    "options": [
      { "value": "disabled", "label": "Disabled" },
      { "value": "openai", "label": "OpenAI-compatible" },
      { "value": "gemini", "label": "Gemini" },
      { "value": "ollama", "label": "Ollama" },
      { "value": "custom", "label": "Custom OpenAI-compatible" }
    ]
  },
  {
    "property": "extensions.neurosort.data_consent",
    "type": "checkbox",
    "label": "Allow sending tab titles and URLs to the selected provider",
    "defaultValue": false
  },
  {
    "property": "extensions.neurosort.auto_tidy",
    "type": "checkbox",
    "label": "Auto-tidy tabs",
    "defaultValue": false
  },
  {
    "property": "extensions.neurosort.auto_tidy_threshold",
    "type": "number",
    "label": "Auto-tidy threshold",
    "defaultValue": 6,
    "min": 2,
    "max": 50
  },
  {
    "property": "extensions.neurosort.min_group_size",
    "type": "number",
    "label": "Minimum group size",
    "defaultValue": 2,
    "min": 2,
    "max": 20
  },
  {
    "property": "extensions.neurosort.preserve_pinned",
    "type": "checkbox",
    "label": "Preserve pinned tabs",
    "defaultValue": true
  },
  {
    "property": "extensions.neurosort.existing_group_behavior",
    "type": "dropdown",
    "label": "Existing group behavior",
    "defaultValue": "prefer",
    "placeholder": false,
    "options": [
      { "value": "ignore", "label": "Ignore existing groups" },
      { "value": "prefer", "label": "Prefer matching existing groups" },
      { "value": "force_new", "label": "Always create new groups" }
    ]
  },
  {
    "property": "extensions.neurosort.fetch_descriptions",
    "type": "checkbox",
    "label": "Fetch page descriptions",
    "defaultValue": false
  },
  {
    "property": "extensions.neurosort.keyboard_shortcut",
    "type": "string",
    "label": "Keyboard shortcut",
    "defaultValue": "alt+shift+t",
    "placeholder": "alt+shift+t"
  },
  {
    "property": "extensions.neurosort.debug",
    "type": "checkbox",
    "label": "Debug logging",
    "defaultValue": false
  },
  {
    "property": "extensions.neurosort.openai.endpoint",
    "type": "string",
    "label": "OpenAI-compatible endpoint",
    "defaultValue": "",
    "placeholder": "endpoint URL",
    "conditions": [{ "if": { "property": "extensions.neurosort.provider", "value": "openai" } }]
  },
  {
    "property": "extensions.neurosort.openai.api_key",
    "type": "string",
    "label": "OpenAI-compatible API key",
    "defaultValue": "",
    "placeholder": "sk-...",
    "conditions": [{ "if": { "property": "extensions.neurosort.provider", "value": "openai" } }]
  },
  {
    "property": "extensions.neurosort.openai.model",
    "type": "string",
    "label": "OpenAI-compatible model",
    "defaultValue": "",
    "placeholder": "model name",
    "conditions": [{ "if": { "property": "extensions.neurosort.provider", "value": "openai" } }]
  },
  {
    "property": "extensions.neurosort.gemini.api_key",
    "type": "string",
    "label": "Gemini API key",
    "defaultValue": "",
    "placeholder": "AIza...",
    "conditions": [{ "if": { "property": "extensions.neurosort.provider", "value": "gemini" } }]
  },
  {
    "property": "extensions.neurosort.gemini.model",
    "type": "string",
    "label": "Gemini model",
    "defaultValue": "",
    "placeholder": "gemini model name",
    "conditions": [{ "if": { "property": "extensions.neurosort.provider", "value": "gemini" } }]
  },
  {
    "property": "extensions.neurosort.ollama.endpoint",
    "type": "string",
    "label": "Ollama endpoint",
    "defaultValue": "",
    "placeholder": "local endpoint URL",
    "conditions": [{ "if": { "property": "extensions.neurosort.provider", "value": "ollama" } }]
  },
  {
    "property": "extensions.neurosort.ollama.model",
    "type": "string",
    "label": "Ollama model",
    "defaultValue": "",
    "placeholder": "local model name",
    "conditions": [{ "if": { "property": "extensions.neurosort.provider", "value": "ollama" } }]
  },
  {
    "property": "extensions.neurosort.custom.endpoint",
    "type": "string",
    "label": "Custom endpoint",
    "defaultValue": "",
    "placeholder": "https://example.test/v1",
    "conditions": [{ "if": { "property": "extensions.neurosort.provider", "value": "custom" } }]
  },
  {
    "property": "extensions.neurosort.custom.api_key",
    "type": "string",
    "label": "Custom API key",
    "defaultValue": "",
    "placeholder": "provider API key",
    "conditions": [{ "if": { "property": "extensions.neurosort.provider", "value": "custom" } }]
  },
  {
    "property": "extensions.neurosort.custom.model",
    "type": "string",
    "label": "Custom model",
    "defaultValue": "",
    "placeholder": "model name",
    "conditions": [{ "if": { "property": "extensions.neurosort.provider", "value": "custom" } }]
  },
  {
    "property": "extensions.neurosort.custom.format",
    "type": "dropdown",
    "label": "Custom response format",
    "defaultValue": "openai_chat",
    "placeholder": false,
    "options": [
      { "value": "openai_chat", "label": "OpenAI chat completions" },
      { "value": "ollama_generate", "label": "Ollama generate" }
    ],
    "conditions": [{ "if": { "property": "extensions.neurosort.provider", "value": "custom" } }]
  }
] as const satisfies readonly PreferenceDefinition[]

export function buildPreferences(): readonly PreferenceEntry[] {
  return [
    {
      type: "text",
      label: "**NeuroSort** - privacy-first AI tab organization",
      size: "14px",
      margin: "0 0 10px 0",
    },
    { type: "separator", label: "Settings" },
    ...preferenceDefinitions.slice(0, 11),
    { type: "separator", label: "Provider fields" },
    ...preferenceDefinitions.slice(11),
  ]
}

export function validatePreferences(input: unknown): PreferenceValidationResult {
  const expected = JSON.stringify(buildPreferences())
  const received = JSON.stringify(input)
  const errors = expected === received ? [] : ["preferences.json is not generated from src/prefs/schema.ts"]

  if (Array.isArray(input)) {
    const presentLegacyKeys = input
      .filter(hasProperty)
      .map((entry) => entry.property)
      .filter((property) => unsupportedLegacyPreferenceKeys.some((legacy) => legacy === property))

    for (const property of presentLegacyKeys) {
      errors.push(`unsupported legacy preference present: ${property}`)
    }
  }

  return errors.length === 0
    ? { ok: true, preferences: buildPreferences() }
    : { ok: false, errors }
}

function hasProperty(value: unknown): value is { readonly property: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "property" in value &&
    typeof value.property === "string"
  )
}
