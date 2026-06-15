import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { qaPaths, runDetect } from "../../scripts/qa-detect.mjs";
import { runRealQa } from "../../scripts/qa-real.mjs";

const evidenceDir = mkdtempSync(join(tmpdir(), "neurosort-qa-evidence-"));
const paths = qaPaths(evidenceDir);

function cleanTask18Evidence() {
  rmSync(paths.availabilityPath, { force: true });
  rmSync(paths.detectSkipPath, { force: true });
  rmSync(paths.realQaLogPath, { force: true });
  rmSync(paths.realQaSkipPath, { force: true });
  rmSync(paths.disposableProfilePath, { recursive: true, force: true });
}

beforeEach(() => {
  cleanTask18Evidence();
});

afterAll(() => {
  rmSync(evidenceDir, { recursive: true, force: true });
});

describe("QA harness", () => {
  it("detects Zen from mdfind and creates disposable availability evidence", () => {
    // Given: mdfind reports a Zen bundle and common paths do not exist.
    const tempDir = mkdtempSync(join(tmpdir(), "neurosort-qa-"));
    const appBundle = join(tempDir, "Zen Browser.app");
    mkdirSync(appBundle);

    // When: the detection script runs.
    const result = runDetect({
      evidencePaths: paths,
      home: "",
      pathExists: (path) => path === appBundle,
      runMdfind: () => `${appBundle}\n`
    });

    // Then: availability evidence points only at the disposable QA profile.
    expect(result.kind).toBe("available");
    const evidence = JSON.parse(readFileSync(paths.availabilityPath, "utf8"));
    expect(evidence.zen.selectedAppBundle).toBe(appBundle);
    expect(evidence.profile.path).toBe(paths.disposableProfilePath);
    expect(evidence.profile.safety).toContain("disposable");
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes an exact skip when Zen is unavailable", () => {
    // Given: neither mdfind nor common macOS paths locate Zen.
    const result = runDetect({
      evidencePaths: paths,
      home: "",
      pathExists: () => false,
      runMdfind: () => ""
    });

    // Then: skip evidence explains the blocker and no availability is left stale.
    expect(result.kind).toBe("skipped");
    expect(existsSync(paths.availabilityPath)).toBe(false);
    const skip = readFileSync(paths.detectSkipPath, "utf8");
    expect(skip).toContain("No Zen app bundle was found");
    expect(skip).toContain("no active browser profile was read or mutated");
  });

  it("refuses real QA unless availability uses the disposable profile", () => {
    // Given: detection did not create safe availability evidence.
    expect(existsSync(paths.availabilityPath)).toBe(false);

    // When: real QA is requested.
    const result = runRealQa(["--dry-run"], paths);

    // Then: it writes a blocker skip instead of launching Zen.
    expect(result.kind).toBe("skipped");
    const skip = readFileSync(paths.realQaSkipPath, "utf8");
    expect(skip).toContain("missing Todo 18 availability evidence");
    expect(skip).toContain("Zen was not launched");
  });

  it("records harness readiness for a disposable profile without launching Zen", () => {
    // Given: detection created availability for a fake Zen bundle and disposable profile.
    const tempDir = mkdtempSync(join(tmpdir(), "neurosort-qa-"));
    const appBundle = join(tempDir, "Zen Browser.app");
    mkdirSync(appBundle);
    runDetect({
      evidencePaths: paths,
      home: "",
      pathExists: (path) => path === appBundle,
      runMdfind: () => `${appBundle}\n`
    });

    // When: real QA harness is dry-run.
    const result = runRealQa(["--dry-run"], paths);

    // Then: the log proves the disposable path and no-launch mode.
    expect(result.kind).toBe("ready");
    const log = readFileSync(paths.realQaLogPath, "utf8");
    expect(log).toContain(`zen=${appBundle}`);
    expect(log).toContain(`profile=${paths.disposableProfilePath}`);
    expect(log).toContain("launch=not-performed-in-todo-18");
    rmSync(tempDir, { recursive: true, force: true });
  });
});
