import { describe, expect, it } from "vitest";

import { buildVitestArgs } from "../../scripts/run-tests.mjs";

describe("test runner defaults", () => {
  it("Given no focused args When npm test runs Then Vitest receives the full suite", () => {
    expect(buildVitestArgs([])).toEqual(["run"]);
  });

  it("Given focused args When npm test runs Then Vitest keeps the requested focus", () => {
    expect(buildVitestArgs(["tests/toolchain", "--reporter=verbose"])).toEqual([
      "run",
      "tests/toolchain",
      "--reporter=verbose",
    ]);
  });
});
