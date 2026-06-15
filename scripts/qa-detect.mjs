import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function qaPaths(evidenceRoot = process.env.NEUROSORT_QA_EVIDENCE_DIR ?? ".omo/evidence") {
  const evidenceDir = resolve(evidenceRoot);
  return {
    evidenceDir,
    availabilityPath: resolve(evidenceDir, "task-18-real-qa-available.json"),
    detectSkipPath: resolve(evidenceDir, "task-18-real-qa-skipped.md"),
    disposableProfilePath: resolve(evidenceDir, "zen-qa-profile"),
    realQaLogPath: resolve(evidenceDir, "task-18-real-qa.log"),
    realQaSkipPath: resolve(evidenceDir, "task-18-real-qa-skipped.md")
  };
}

const defaultQaPaths = qaPaths();
export const availabilityPath = defaultQaPaths.availabilityPath;
export const detectSkipPath = defaultQaPaths.detectSkipPath;
export const disposableProfilePath = defaultQaPaths.disposableProfilePath;

const mdfindQuery = 'kMDItemCFBundleIdentifier == "app.zen-browser.zen"';

export function commonZenAppPaths(home = process.env.HOME ?? "") {
  const homeApps = home === "" ? [] : [
    `${home}/Applications/Zen Browser.app`,
    `${home}/Applications/Zen.app`,
    `${home}/Applications/Zen Twilight.app`
  ];

  return [
    "/Applications/Zen Browser.app",
    "/Applications/Zen.app",
    "/Applications/Zen Twilight.app",
    ...homeApps
  ];
}

function unique(values) {
  return [...new Set(values.filter((value) => value.trim() !== ""))];
}

export function detectZenApps({ runMdfind = execFileSync, pathExists = existsSync, home = process.env.HOME ?? "" } = {}) {
  const commonMatches = commonZenAppPaths(home).filter((candidate) => pathExists(candidate));
  let mdfindMatches = [];
  let mdfindError = null;

  try {
    const output = runMdfind("mdfind", [mdfindQuery], { encoding: "utf8" });
    mdfindMatches = output.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch (error) {
    mdfindError = error instanceof Error ? error.message : String(error);
  }

  const appBundles = unique([...mdfindMatches, ...commonMatches]);

  return {
    appBundles,
    commonMatches,
    mdfindError,
    mdfindMatches,
    query: mdfindQuery
  };
}

function removeIfExists(path) {
  rmSync(path, { force: true });
}

export function writeDetectSkip(reason, details = {}, paths = defaultQaPaths) {
  mkdirSync(paths.evidenceDir, { recursive: true });
  removeIfExists(paths.availabilityPath);

  const body = [
    "# Task 18 Real Zen/Sine QA Skipped",
    "",
    `Reason: ${reason}`,
    "",
    "Safety decision: no Zen process was launched and no active browser profile was read or mutated.",
    "",
    "Detection details:",
    `- mdfind query: \`${mdfindQuery}\``,
    `- mdfind matches: ${JSON.stringify(details.mdfindMatches ?? [])}`,
    `- common path matches: ${JSON.stringify(details.commonMatches ?? [])}`,
    `- mdfind error: ${details.mdfindError === null || details.mdfindError === undefined ? "none" : JSON.stringify(details.mdfindError)}`,
    "",
    "Fallback: rely on fake Zen/Sine integration and static validation evidence until a disposable QA run is available.",
    ""
  ].join("\n");

  writeFileSync(paths.detectSkipPath, body);
  return { path: paths.detectSkipPath, reason };
}

export function writeAvailability(appBundles, details = {}, paths = defaultQaPaths) {
  mkdirSync(paths.disposableProfilePath, { recursive: true });
  removeIfExists(paths.detectSkipPath);

  const evidence = {
    status: "available",
    generatedAt: new Date().toISOString(),
    zen: {
      selectedAppBundle: appBundles[0],
      detectedAppBundles: appBundles,
      mdfindQuery,
      mdfindMatches: details.mdfindMatches ?? [],
      commonMatches: details.commonMatches ?? [],
      mdfindError: details.mdfindError ?? null
    },
    profile: {
      path: paths.disposableProfilePath,
      safety: "repo-owned disposable profile; active user profiles are forbidden"
    },
    sine: {
      state: "unknown",
      reason: "Sine/Cosine state is only inspected inside the disposable QA profile during a later real run"
    }
  };

  writeFileSync(paths.availabilityPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

export function runDetect(options = {}) {
  const { evidencePaths = defaultQaPaths, ...detectionOptions } = options;
  const detection = detectZenApps(detectionOptions);

  if (detection.appBundles.length === 0) {
    const reason = "No Zen app bundle was found via mdfind or common macOS application paths.";
    writeDetectSkip(reason, detection, evidencePaths);
    console.log(`qa:detect: skipped real QA: ${reason}`);
    return { kind: "skipped", reason };
  }

  const evidence = writeAvailability(detection.appBundles, detection, evidencePaths);
  console.log(`qa:detect: available; Zen=${evidence.zen.selectedAppBundle}; profile=${evidence.profile.path}`);
  return { kind: "available", evidence };
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  runDetect();
}
