import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import {
  buildPreferences,
  preferenceDefinitions,
  validatePreferences,
} from "../../src/prefs/schema"

const rootPreferences = JSON.parse(readFileSync("preferences.json", "utf8"))

describe("preference schema source of truth", () => {
  it("keeps privacy-first defaults when provider settings are unconfigured", () => {
    const preferences = buildPreferences()
    const byProperty = Object.fromEntries(
      preferences
        .filter((entry) => "property" in entry)
        .map((entry) => [entry.property, entry]),
    )

    expect(byProperty["extensions.neurosort.provider"]).toMatchObject({
      defaultValue: "disabled",
    })
    expect(byProperty["extensions.neurosort.data_consent"]).toMatchObject({
      defaultValue: false,
    })
    expect(byProperty["extensions.neurosort.fetch_descriptions"]).toMatchObject({
      defaultValue: false,
    })

    expect(byProperty["extensions.neurosort.openai.endpoint"]).toMatchObject({
      defaultValue: "",
    })
    expect(byProperty["extensions.neurosort.openai.model"]).toMatchObject({
      defaultValue: "",
    })
    expect(byProperty["extensions.neurosort.custom.endpoint"]).toMatchObject({
      defaultValue: "",
    })
    expect(byProperty["extensions.neurosort.custom.model"]).toMatchObject({
      defaultValue: "",
    })
  })

  it("exposes every supported preference as a flat Sine property", () => {
    const properties = preferenceDefinitions.map((definition) => definition.property)

    expect(properties).toEqual([
      "extensions.neurosort.enabled",
      "extensions.neurosort.provider",
      "extensions.neurosort.data_consent",
      "extensions.neurosort.auto_tidy",
      "extensions.neurosort.auto_tidy_threshold",
      "extensions.neurosort.min_group_size",
      "extensions.neurosort.preserve_pinned",
      "extensions.neurosort.existing_group_behavior",
      "extensions.neurosort.fetch_descriptions",
      "extensions.neurosort.keyboard_shortcut",
      "extensions.neurosort.debug",
      "extensions.neurosort.openai.endpoint",
      "extensions.neurosort.openai.api_key",
      "extensions.neurosort.openai.model",
      "extensions.neurosort.gemini.api_key",
      "extensions.neurosort.gemini.model",
      "extensions.neurosort.ollama.endpoint",
      "extensions.neurosort.ollama.model",
      "extensions.neurosort.custom.endpoint",
      "extensions.neurosort.custom.api_key",
      "extensions.neurosort.custom.model",
      "extensions.neurosort.custom.format",
    ])
  })

  it("validates the checked-in preferences file against the schema", () => {
    expect(validatePreferences(rootPreferences)).toEqual({
      ok: true,
      preferences: buildPreferences(),
    })
  })
})
