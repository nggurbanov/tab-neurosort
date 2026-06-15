import { readFileSync, writeFileSync } from "node:fs"

const schemaPath = "src/prefs/schema.ts"
const preferencesPath = "preferences.json"
const unsupportedLegacyKeys = [
  "extensions.neurosort.auto_tidy_cooldown",
  "extensions.neurosort.setup_complete",
  "extensions.neurosort.use_existing_groups",
]
const forbiddenDefaultValues = new Set([
  "https://ai.redivo.ru/v1",
  "https://api.openai.com/v1",
  "http://localhost:11434",
  "cx/gpt-5.1-codex-mini",
  "gpt-4o-mini",
  "gemini-2.0-flash",
  "llama3.2",
  "custom",
])

const text = readFileSync(schemaPath, "utf8")
const preferenceDefinitions = extractPreferenceDefinitions(text)
const generatedPreferences = buildPreferences(preferenceDefinitions)

if (process.argv.includes("--write")) {
  writeFileSync(preferencesPath, `${JSON.stringify(generatedPreferences, null, 2)}\n`)
  console.log(`preferences-written ${preferencesPath}`)
  process.exit(0)
}

const targetPath = process.argv.find((arg) => arg.startsWith("--file="))?.slice("--file=".length) ?? preferencesPath
const checkedPreferences = parseJsonFile(targetPath)
const errors = validatePreferences(checkedPreferences, generatedPreferences)

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`preferences-error ${error}`)
  }
  process.exit(1)
}

console.log(`preferences-ok ${targetPath}`)

function extractPreferenceDefinitions(sourceText) {
  const marker = "export const preferenceDefinitions = "
  const start = sourceText.indexOf(marker)
  if (start < 0) {
    throw new Error(`missing ${marker.trim()}`)
  }

  const arrayStart = sourceText.indexOf("[", start)
  const arrayEndMarker = "\n] as const"
  const arrayEnd = sourceText.indexOf(arrayEndMarker, arrayStart)
  if (arrayStart < 0 || arrayEnd < 0) {
    throw new Error("could not extract preferenceDefinitions array")
  }

  return JSON.parse(sourceText.slice(arrayStart, arrayEnd + 2))
}

function parseJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`preferences-error malformed JSON in ${path}: ${message}`)
    process.exit(1)
  }
}

function buildPreferences(definitions) {
  return [
    {
      type: "text",
      label: "**NeuroSort** - privacy-first AI tab organization",
      size: "14px",
      margin: "0 0 10px 0",
    },
    { type: "separator", label: "Settings" },
    ...definitions.slice(0, 11),
    { type: "separator", label: "Provider fields" },
    ...definitions.slice(11),
  ]
}

function validatePreferences(input, expected) {
  const errors = []
  if (!Array.isArray(input)) {
    return ["preferences root must be an array"]
  }

  const properties = input.flatMap((entry) => (typeof entry?.property === "string" ? [entry.property] : []))
  const duplicateProperties = properties.filter((property, index) => properties.indexOf(property) !== index)
  for (const property of new Set(duplicateProperties)) {
    errors.push(`duplicate property ${property}`)
  }

  for (const property of unsupportedLegacyKeys) {
    if (properties.includes(property)) {
      errors.push(`unsupported legacy preference present: ${property}`)
    }
  }

  for (const entry of input) {
    const defaultValue = entry?.defaultValue ?? entry?.default
    if (forbiddenDefaultValues.has(defaultValue)) {
      errors.push(`forbidden legacy default present: ${defaultValue}`)
    }
  }

  if (JSON.stringify(input) !== JSON.stringify(expected)) {
    errors.push("preferences.json is stale; run node scripts/validate-preferences.mjs --write")
  }

  return errors
}
