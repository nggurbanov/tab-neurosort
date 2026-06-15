import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { qaPaths } from "./qa-detect.mjs";

const defaultQaPaths = qaPaths();

function removeIfExists(path) {
  rmSync(path, { force: true });
}

function writeSkip(reason, paths) {
  removeIfExists(paths.realQaLogPath);

  const body = [
    "# Task 18 Real Zen/Sine QA Skipped",
    "",
    `Reason: ${reason}`,
    "",
    "Safety decision: Zen was not launched. No active browser profile was read or mutated.",
    "",
    "Required condition: run `npm run qa:detect` successfully so `.omo/evidence/task-18-real-qa-available.json` points to `.omo/evidence/zen-qa-profile`.",
    "",
    "Fallback: rely on fake Zen/Sine integration and static validation evidence.",
    ""
  ].join("\n");

  writeFileSync(paths.realQaSkipPath, body);
  console.log(`qa:real: skipped: ${reason}`);
  return { kind: "skipped", reason };
}

function parseAvailability(paths) {
  if (!existsSync(paths.availabilityPath)) {
    const detectReason = existsSync(paths.detectSkipPath)
      ? "qa:detect recorded a skip instead of disposable-profile availability"
      : "missing Todo 18 availability evidence";
    return { ok: false, reason: detectReason };
  }

  try {
    return { ok: true, evidence: JSON.parse(readFileSync(paths.availabilityPath, "utf8")) };
  } catch (error) {
    return {
      ok: false,
      reason: `invalid availability JSON: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function isDisposableProfilePath(path, paths) {
  return resolve(path) === paths.disposableProfilePath;
}

function validateAvailability(evidence, paths) {
  const appBundle = evidence?.zen?.selectedAppBundle;
  const profilePath = evidence?.profile?.path;

  if (typeof appBundle !== "string" || appBundle.trim() === "") {
    return { ok: false, reason: "availability evidence does not name a Zen app bundle" };
  }

  if (!existsSync(appBundle)) {
    return { ok: false, reason: `Zen app bundle no longer exists: ${appBundle}` };
  }

  if (typeof profilePath !== "string" || !isDisposableProfilePath(profilePath, paths)) {
    return { ok: false, reason: "availability evidence does not point to the repo-owned disposable QA profile" };
  }

  if (!existsSync(profilePath)) {
    return { ok: false, reason: `disposable QA profile no longer exists: ${profilePath}` };
  }

  return { ok: true, appBundle, profilePath };
}

export function runRealQa(args = process.argv.slice(2), paths = defaultQaPaths) {
  const dryRun = args.includes("--dry-run");
  const parsed = parseAvailability(paths);

  if (!parsed.ok) {
    return writeSkip(parsed.reason, paths);
  }

  const validated = validateAvailability(parsed.evidence, paths);
  if (!validated.ok) {
    return writeSkip(validated.reason, paths);
  }

  removeIfExists(paths.realQaSkipPath);

  const lines = [
    "Task 18 Real Zen/Sine QA Harness",
    `mode=${dryRun ? "dry-run" : "prepared-no-launch"}`,
    `zen=${validated.appBundle}`,
    `profile=${validated.profilePath}`,
    "primaryProfileMutation=forbidden",
    "launch=not-performed-in-todo-18",
    "sineState=unknown-until-disposable-profile-launch",
    "result=harness-ready"
  ];

  writeFileSync(paths.realQaLogPath, `${lines.join("\n")}\n`);
  console.log(`qa:real: harness ready; log=${paths.realQaLogPath}`);
  return { kind: "ready", dryRun, logPath: paths.realQaLogPath };
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  runRealQa();
}
