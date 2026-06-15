import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const artifactPath = process.argv[2] ?? "neurosort.uc.js";

export const stripCommentsAndStrings = (source) => {
  let output = "";
  let index = 0;
  let state = "code";

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (char === "\n") {
        output += "\n";
        state = "code";
      } else {
        output += " ";
      }
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        output += "  ";
        state = "code";
        index += 2;
      } else {
        output += char === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    if (state === "single-string" || state === "double-string" || state === "template-string") {
      const quote = state === "single-string" ? "'" : state === "double-string" ? "\"" : "`";
      if (char === "\\") {
        output += "  ";
        index += 2;
      } else if (char === quote) {
        output += " ";
        state = "code";
        index += 1;
      } else {
        output += char === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      output += "  ";
      state = "line-comment";
      index += 2;
      continue;
    }

    if (char === "/" && next === "*") {
      output += "  ";
      state = "block-comment";
      index += 2;
      continue;
    }

    if (char === "'") {
      output += " ";
      state = "single-string";
      index += 1;
      continue;
    }

    if (char === "\"") {
      output += " ";
      state = "double-string";
      index += 1;
      continue;
    }

    if (char === "`") {
      output += " ";
      state = "template-string";
      index += 1;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
};

const collectClassicBundleErrors = (source) => {
  const errors = [];
  const stripped = stripCommentsAndStrings(source);
  const checks = [
    [/^\s*import\s/m, "runtime import declarations are not allowed"],
    [/^\s*export\s/m, "runtime export declarations are not allowed"],
    [/\bimport\s*\(/, "dynamic import loading is not allowed"],
    [/\bsourceMappingURL=/, "source maps are not allowed in the generated artifact"]
  ];

  for (const [pattern, message] of checks) {
    if (pattern.test(stripped)) {
      errors.push(message);
    }
  }

  if (!/\(\(\)\s*=>\s*\{/.test(stripped) && !/\(function\(\)/.test(stripped)) {
    errors.push("generated artifact must be an IIFE bundle");
  }

  return errors;
};

const collectArtifactErrors = (source) => {
  const errors = collectClassicBundleErrors(source);
  const checks = [
    [/\/\/ ==UserScript==/, "userscript header is required"],
    [/\/\/ @name\s+NeuroSort/, "userscript name must be NeuroSort"],
    [/\/\/ @version\s+1\.1\.15/, "userscript version must be 1.1.15"],
    [/\/\/ @include\s+chrome:\/\/browser\/content\/browser\.xhtml/, "Sine chrome include is required"],
    [/\/\/ NeuroSort generated artifact version 1\.1\.15/, "generated version comment is required"]
  ];

  for (const [pattern, message] of checks) {
    if (!pattern.test(source)) {
      errors.push(message);
    }
  }

  if (/FETCH DEBUG INFO/.test(source)) {
    errors.push("FETCH DEBUG INFO must not appear in the artifact");
  }

  if (/Authorization/.test(source)) {
    errors.push("Authorization must not appear in generated logging code");
  }

  if (/https:\/\/ai\.redivo\.ru\/v1/.test(source)) {
    errors.push("hidden default remote endpoint must not appear in the artifact");
  }

  return errors;
};

const collectThemeReferenceErrors = () => {
  try {
    const manifest = JSON.parse(readFileSync("theme.json", "utf8"));
    if (manifest?.scripts?.["neurosort.uc.js"] === undefined) {
      return ["theme.json must reference neurosort.uc.js"];
    }

    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [`theme.json could not be checked: ${message}`];
  }
};

export const validateArtifact = (path = artifactPath, options = {}) => {
  const errors = [];

  try {
    const stats = statSync(path);
    if (!stats.isFile()) {
      errors.push(`${path} is not a file`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [message] };
  }

  const source = readFileSync(path, "utf8");
  errors.push(...collectArtifactErrors(source));
  errors.push(...collectThemeReferenceErrors());

  if (options.checkSyntax !== false) {
    try {
      execFileSync(process.execPath, ["--check", path], { stdio: "inherit" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
    }
  }

  return { ok: errors.length === 0, errors };
};

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  const result = validateArtifact();
  for (const error of result.errors) {
    console.error(`validate-artifact: ${error}`);
  }

  if (result.ok) {
    console.log(`validate-artifact: ${artifactPath} is a classic single-file bundle`);
  } else {
    process.exitCode = 1;
  }
}
