import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateManifest } from "../../scripts/validate-manifest.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("manifest metadata ownership", () => {
  it("passes when the repository manifest uses canonical files and URLs", () => {
    const result = validateManifest(repoRoot);

    expect(result.errors).toEqual([]);
  });

  it("reports inconsistent repository URLs and malformed CSS comments", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "tab-neurosort-manifest-"));

    writeFileSync(
      join(rootDir, "theme.json"),
      JSON.stringify(
        {
          homepage: "https://github.com/example/tab-neurosort",
          image:
            "https://raw.githubusercontent.com/example/tab-neurosort/main/image.png",
          preferences: "preferences.json",
          readme:
            "https://raw.githubusercontent.com/example/tab-neurosort/main/README.md",
          scripts: {
            "neurosort.uc.js": {
              include: ["chrome://browser/content/browser.xhtml"],
            },
          },
          style: {
            chrome: "userChrome.css",
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(join(rootDir, "preferences.json"), "[]");
    writeFileSync(join(rootDir, "neurosort.uc.js"), "");
    writeFileSync(join(rootDir, "userChrome.css"), "/* one\n/* two */\n");

    const result = validateManifest(rootDir);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "homepage must be https://github.com/nggurbanov/tab-neurosort",
        "readme must be https://raw.githubusercontent.com/nggurbanov/tab-neurosort/main/README.md",
        "image must be https://raw.githubusercontent.com/nggurbanov/tab-neurosort/main/image.png",
        "userChrome.css contains a nested or malformed CSS comment",
      ]),
    );
  });
});
