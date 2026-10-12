import { describe, it, expect } from "vitest";
import { DeterministicKeyProvider } from "./deterministic-key-provider.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";

describe("ActiveRecord::Encryption::DeterministicKeyProviderTest (trails)", () => {
  it("extends DerivedSecretKeyProvider", () => {
    expect(DeterministicKeyProvider.prototype instanceof DerivedSecretKeyProvider).toBe(true);
  });
});
