import { describe, expect, it } from "vitest";

import { requestProviderFetch } from "../../src/privacy/providerReadiness";

describe("provider readiness", () => {
  it("Given consent is false When a provider fetch is requested Then fetch is denied and not invoked", async () => {
    // Given
    let fetchCalls = 0;

    // When
    const result = await requestProviderFetch(
      {
        provider: "openai",
        consentToSendData: false,
        endpoint: "https://api.example.test/v1",
        apiKey: "sk-test-secret",
        model: "gpt-4.1-mini",
      },
      async () => {
        fetchCalls += 1;
        return "unexpected";
      },
    );

    // Then
    expect(result).toEqual({ ok: false, reason: "consent_required" });
    expect(fetchCalls).toBe(0);
  });

  it("Given provider is disabled When a provider fetch is requested Then fetch is denied and not invoked", async () => {
    // Given
    let fetchCalls = 0;

    // When
    const result = await requestProviderFetch(
      { provider: "disabled", consentToSendData: true },
      async () => {
        fetchCalls += 1;
        return "unexpected";
      },
    );

    // Then
    expect(result).toEqual({ ok: false, reason: "provider_disabled" });
    expect(fetchCalls).toBe(0);
  });

  it("Given required config is missing When a provider fetch is requested Then fetch is denied and not invoked", async () => {
    // Given
    let fetchCalls = 0;

    // When
    const result = await requestProviderFetch(
      { provider: "custom", consentToSendData: true, endpoint: "https://example.test/v1", apiKey: "", model: "tabs", format: "openai" },
      async () => {
        fetchCalls += 1;
        return "unexpected";
      },
    );

    // Then
    expect(result).toEqual({ ok: false, reason: "missing_required_config", missingFields: ["apiKey"] });
    expect(fetchCalls).toBe(0);
  });

  it("Given provider is ready and consented When a provider fetch is requested Then fetch is invoked once", async () => {
    // Given
    let fetchCalls = 0;

    // When
    const result = await requestProviderFetch(
      { provider: "ollama", consentToSendData: true, endpoint: "http://localhost:11434", model: "llama3.2" },
      async (readyProvider) => {
        fetchCalls += 1;
        return `ready:${readyProvider.provider}`;
      },
    );

    // Then
    expect(result).toEqual({ ok: true, value: "ready:ollama" });
    expect(fetchCalls).toBe(1);
  });
});
