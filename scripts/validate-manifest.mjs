import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CANONICAL_REPO = "nggurbanov/tab-neurosort";
const GITHUB_BASE = `https://github.com/${CANONICAL_REPO}`;
const RAW_BASE = `https://raw.githubusercontent.com/${CANONICAL_REPO}/main`;

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJson = (rootDir, fileName, errors) => {
  const filePath = resolve(rootDir, fileName);
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (!isRecord(parsed)) {
      errors.push(`${fileName} must contain a JSON object`);
      return {};
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${fileName} is not valid JSON: ${message}`);
    return {};
  }
};

const expectValue = (errors, label, actual, expected) => {
  if (actual !== expected) {
    errors.push(`${label} must be ${expected}`);
  }
};

const expectLocalFile = (rootDir, errors, label, value) => {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${label} must reference a local file`);
    return;
  }

  if (!existsSync(resolve(rootDir, value))) {
    errors.push(`${label} references missing file ${value}`);
  }
};

const validateScripts = (rootDir, theme, errors) => {
  if (!isRecord(theme.scripts)) {
    errors.push("scripts must be an object");
    return;
  }

  const scriptNames = Object.keys(theme.scripts);
  if (!scriptNames.includes("neurosort.uc.js")) {
    errors.push("scripts must point to generated neurosort.uc.js");
  }

  for (const scriptName of scriptNames) {
    expectLocalFile(rootDir, errors, `scripts.${scriptName}`, scriptName);
  }
};

const validateCssComments = (rootDir, theme, errors) => {
  if (!isRecord(theme.style)) {
    errors.push("style must be an object");
    return;
  }

  expectValue(errors, "style.chrome", theme.style.chrome, "userChrome.css");
  expectLocalFile(rootDir, errors, "style.chrome", theme.style.chrome);

  if (theme.style.chrome !== "userChrome.css") {
    return;
  }

  const css = readFileSync(resolve(rootDir, "userChrome.css"), "utf8");
  let insideComment = false;
  for (let index = 0; index < css.length - 1; index += 1) {
    const token = css.slice(index, index + 2);
    if (token === "/*") {
      if (insideComment) {
        errors.push("userChrome.css contains a nested or malformed CSS comment");
        return;
      }
      insideComment = true;
      index += 1;
    } else if (token === "*/") {
      if (!insideComment) {
        errors.push("userChrome.css contains an unmatched CSS comment close");
        return;
      }
      insideComment = false;
      index += 1;
    }
  }

  if (insideComment) {
    errors.push("userChrome.css contains an unterminated CSS comment");
  }
};

export const validateManifest = (rootDir = process.cwd()) => {
  const errors = [];
  const theme = readJson(rootDir, "theme.json", errors);

  expectValue(errors, "homepage", theme.homepage, GITHUB_BASE);
  expectValue(errors, "readme", theme.readme, `${RAW_BASE}/README.md`);
  expectValue(errors, "image", theme.image, `${RAW_BASE}/image.png`);
  expectValue(errors, "preferences", theme.preferences, "preferences.json");
  expectLocalFile(rootDir, errors, "preferences", theme.preferences);

  validateScripts(rootDir, theme, errors);
  validateCssComments(rootDir, theme, errors);

  return { ok: errors.length === 0, errors };
};

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  const result = validateManifest();
  if (!result.ok) {
    console.error(result.errors.join("\n"));
    process.exit(1);
  }
  console.log("manifest-ok");
}
