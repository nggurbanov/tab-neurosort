import { describe, expect, it } from "vitest";

import { createBootstrapMessage, NEUROSORT_VERSION } from "../../src/main";

describe("NeuroSort toolchain bootstrap", () => {
  it("Given the initial TypeScript entry When it is imported Then it exposes a stable bootstrap message", () => {
    const message = createBootstrapMessage();

    expect(message).toBe(`NeuroSort ${NEUROSORT_VERSION} toolchain bootstrap loaded`);
  });
});
