import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const defaultArtifactPath = process.argv[2] ?? "neurosort.uc.js";
const defaultSourceRoot = "src";
const sourceExtensions = new Set([".js", ".mjs", ".ts", ".tsx"]);
const forbiddenTextChecks = [
  ["FETCH DEBUG INFO", "FETCH DEBUG INFO debug marker must not appear"],
  ["https://ai.redivo.ru/v1", "hidden default remote endpoint must not appear"],
];
const loggingCallPattern = /\b(?:console\.(?:debug|error|info|log|warn)|logger\.(?:debug|error|info|warn))\s*\(([\s\S]{0,900}?)\)/g;
const loggedSecretChecks = [
  [/\bAuthorization\b/i, "Authorization inside a logging call is forbidden"],
  [/\bheaders\b/i, "headers inside a logging call are forbidden"],
  [/\brequestBody\b|\bbody\b/i, "requestBody inside a logging call is forbidden"],
  [/\bresponseBody\b/i, "responseBody inside a logging call is forbidden"],
  [/\bprompt\b/i, "prompt inside a logging call is forbidden"],
  [/\bapiKey\b|\bapi[_-]?key\b/i, "apiKey inside a logging call is forbidden"],
];

export const validateSecurity = (options = {}) => {
  const artifactPath = options.artifactPath ?? defaultArtifactPath;
  const sourceRoot = options.sourceRoot ?? defaultSourceRoot;
  const errors = [];
  const targets = collectTargets(artifactPath, sourceRoot);

  for (const target of targets) {
    const source = readFileSync(target, "utf8");
    errors.push(...collectForbiddenTextErrors(target, source));
    errors.push(...collectLoggingErrors(target, source));
    errors.push(...collectUiSafetyErrors(target, source, sourceRoot));
  }

  return { ok: errors.length === 0, errors };
};

const collectTargets = (artifactPath, sourceRoot) => {
  const targets = [];
  if (existsSync(artifactPath)) {
    targets.push(artifactPath);
  }
  if (existsSync(sourceRoot)) {
    targets.push(...collectSourceFiles(sourceRoot));
  }
  return targets;
};

const collectSourceFiles = (root) => {
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(path));
      continue;
    }
    if (stats.isFile() && hasSourceExtension(path)) {
      files.push(path);
    }
  }
  return files;
};

const hasSourceExtension = (path) => {
  return [...sourceExtensions].some((extension) => path.endsWith(extension));
};

const collectForbiddenTextErrors = (path, source) => {
  return forbiddenTextChecks.flatMap(([needle, message]) => {
    return source.includes(needle) ? [`${formatPath(path)}: ${message}: ${needle}`] : [];
  });
};

const collectLoggingErrors = (path, source) => {
  const errors = [];
  for (const match of source.matchAll(loggingCallPattern)) {
    const callText = match[0];
    for (const [pattern, message] of loggedSecretChecks) {
      if (pattern.test(callText)) {
        errors.push(`${formatPath(path)}: ${message}`);
      }
    }
  }
  return errors;
};

const collectUiSafetyErrors = (path, source, sourceRoot) => {
  if (!isUiSource(path, sourceRoot) || !/\binnerHTML\b/.test(source)) {
    return [];
  }
  return [`${formatPath(path)}: innerHTML is forbidden in UI source modules`];
};

const isUiSource = (path, sourceRoot) => {
  const normalized = relative(sourceRoot, path).split(sep).join("/");
  return normalized.startsWith("ui/");
};

const formatPath = (path) => relative(process.cwd(), path) || path;

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  const result = validateSecurity();
  for (const error of result.errors) {
    console.error(`validate-security: ${error}`);
  }

  if (result.ok) {
    console.log("validate-security: privacy and UI safety scan passed");
  } else {
    process.exitCode = 1;
  }
}
