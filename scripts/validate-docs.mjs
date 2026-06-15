import { existsSync, readFileSync } from "node:fs";

if (!existsSync("README.md")) {
  console.error("validate-docs: README.md is missing");
  process.exitCode = 1;
} else {
  const readme = readFileSync("README.md", "utf8");
  const theme = JSON.parse(readFileSync("theme.json", "utf8"));
  const failures = [
    ...requiredTextChecks(readme),
    ...forbiddenTextChecks(readme),
    ...metadataChecks(readme, theme),
  ];

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`validate-docs: ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("validate-docs: README.md behavior and metadata checks passed");
  }
}

function requiredTextChecks(readme) {
  return [
    ["canonical repository path", "nggurbanov/tab-neurosort"],
    ["provider disabled default", "provider starts as `disabled`"],
    ["data consent default", "data-sending consent starts off"],
    ["descriptions default", "page description fetching starts off"],
    ["tidy shortcut", "Alt+Shift+T"],
    ["undo shortcut", "Alt+Shift+Z"],
    ["plain click ungrouped behavior", "Ungrouped tabs in the current workspace"],
    ["explicit tidy all behavior", "Sort All Tabs"],
    ["explicit selected tidy behavior", "Sort Selected Tabs"],
    ["session-local undo caveat", "Undo is session-local and best effort"],
    ["optional Advanced Tab Groups compatibility", "Advanced Tab Groups compatibility is optional"],
    ["Zen stable compatibility target", "Zen stable `1.21.1b`"],
    ["Zen Twilight compatibility target", "Zen Twilight `1.22t`"],
    ["Sine stable compatibility target", "Sine stable `v2.3.3`"],
    ["Sine unsafe-JS behavior", "Allow unsafe JS"],
    ["no store listing claim", "not currently documented as a Sine store listing"],
    ["privacy logging caveat", "must not include API keys, Authorization headers, request bodies, raw prompts, full URLs, or response bodies"],
  ]
    .filter(([, needle]) => !readme.includes(needle))
    .map(([label, needle]) => `missing ${label}: ${needle}`);
}

function forbiddenTextChecks(readme) {
  const forbiddenPatterns = [
    ["obsolete hidden endpoint", /ai\.redivo\.ru/i],
    ["obsolete default tidy shortcut", /default\s+Ctrl\+Shift\+T/i],
    ["obsolete undo shortcut", /Ctrl\/Cmd\+Z/i],
    ["hard Advanced Tab Groups install requirement", /ensure\s+Advanced Tab Groups\s+is\s+installed/i],
    ["Sine store listing claim", /available\s+(?:on|in)\s+the\s+Sine\s+store/i],
  ];

  return forbiddenPatterns
    .filter(([, pattern]) => pattern.test(readme))
    .map(([label]) => `contains ${label}`);
}

function metadataChecks(readme, theme) {
  const homepage = typeof theme.homepage === "string" ? theme.homepage : "";
  const repositoryPath = homepage.replace(/^https:\/\/github\.com\//, "");

  if (repositoryPath.length === 0 || readme.includes(repositoryPath)) {
    return [];
  }

  return [`README canonical repository path does not match theme.json homepage: ${homepage}`];
}
