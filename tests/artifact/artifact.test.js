import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { validateArtifact } from "../../scripts/validate-artifact.mjs";

const readArtifact = () => readFileSync("neurosort.uc.js", "utf8");

describe("generated userscript artifact", () => {
  it("Given the generated artifact When validating it Then it is one classic Sine userscript", () => {
    const artifact = readArtifact();
    const result = validateArtifact("neurosort.uc.js");

    expect(result.ok).toBe(true);
    expect(artifact).toContain("// ==UserScript==");
    expect(artifact).toContain("// @name           NeuroSort");
    expect(artifact).toContain("// @version        1.1.15");
    expect(artifact).toContain("// NeuroSort generated artifact version 1.1.15");
    expect(artifact).toContain("var NeuroSort = (() => {");
  });

  it("Given Sine metadata When inspecting script entries Then the generated artifact is referenced", () => {
    const manifest = JSON.parse(readFileSync("theme.json", "utf8"));

    expect(Object.keys(manifest.scripts)).toEqual(["neurosort.uc.js"]);
  });

  it("Given forbidden artifact content When validating Then each issue is reported", () => {
    const dir = mkdtempSync(join(tmpdir(), "neurosort-artifact-"));
    const path = join(dir, "bad.uc.js");
    writeFileSync(
      path,
      [
        "// ==UserScript==",
        "// @name           NeuroSort",
        "// @version        1.1.11",
        "// ==/UserScript==",
        "import('https://example.test/chunk.js');",
        "console.log('FETCH DEBUG INFO', 'Authorization');"
      ].join("\n")
    );

    const result = validateArtifact(path, { checkSyntax: false });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("dynamic import loading is not allowed");
    expect(result.errors).toContain("FETCH DEBUG INFO must not appear in the artifact");
    expect(result.errors).toContain("Authorization must not appear in generated logging code");
  });
});
