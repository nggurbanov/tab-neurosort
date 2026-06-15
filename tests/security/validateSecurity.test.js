import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { validateSecurity } from "../../scripts/validate-security.mjs";

const createSecurityFixture = () => {
  const dir = mkdtempSync(join(tmpdir(), "neurosort-security-"));
  mkdirSync(join(dir, "src", "ui"), { recursive: true });
  mkdirSync(join(dir, "src", "providers"), { recursive: true });
  const artifactPath = join(dir, "neurosort.uc.js");
  const safeSourcePath = join(dir, "src", "providers", "safe.ts");
  writeFileSync(artifactPath, "var NeuroSort = (() => { logger.debug(event); })();\n");
  writeFileSync(safeSourcePath, "export const endpoint = '';\n");
  return { artifactPath, dir };
};

describe("security validator", () => {
  it("Given safe source and artifact When scanning Then validation passes", () => {
    const fixture = createSecurityFixture();

    const result = validateSecurity({ artifactPath: fixture.artifactPath, sourceRoot: join(fixture.dir, "src") });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("Given forbidden debug marker or legacy endpoint When scanning Then both regressions fail", () => {
    const fixture = createSecurityFixture();
    writeFileSync(
      fixture.artifactPath,
      "console.log('FETCH DEBUG INFO'); fetch('https://ai.redivo.ru/v1');\n",
    );

    const result = validateSecurity({ artifactPath: fixture.artifactPath, sourceRoot: join(fixture.dir, "src") });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("FETCH DEBUG INFO"),
        expect.stringContaining("https://ai.redivo.ru/v1"),
      ]),
    );
  });

  it("Given Authorization or request data inside logging calls When scanning Then secret-bearing logs fail", () => {
    const fixture = createSecurityFixture();
    writeFileSync(
      join(fixture.dir, "src", "providers", "unsafe.ts"),
      [
        "export const logSecrets = (logger) => {",
        "  logger.debug({ headers: { Authorization: 'Bearer sk-test' }, requestBody: prompt });",
        "};",
      ].join("\n"),
    );

    const result = validateSecurity({ artifactPath: fixture.artifactPath, sourceRoot: join(fixture.dir, "src") });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Authorization inside a logging call"),
        expect.stringContaining("requestBody inside a logging call"),
      ]),
    );
  });

  it("Given UI source writes innerHTML When scanning Then UI safety validation fails", () => {
    const fixture = createSecurityFixture();
    writeFileSync(join(fixture.dir, "src", "ui", "unsafe.ts"), "node.innerHTML = userText;\n");

    const result = validateSecurity({ artifactPath: fixture.artifactPath, sourceRoot: join(fixture.dir, "src") });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([expect.stringContaining("innerHTML")]);
  });
});
