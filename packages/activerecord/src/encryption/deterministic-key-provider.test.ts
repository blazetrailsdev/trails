import { describe, it, expect } from "vitest";
import { DeterministicKeyProvider } from "./deterministic-key-provider.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { Configuration } from "./errors.js";

describe("ActiveRecord::Encryption::DeterministicKeyProviderTest", () => {
  it("will raise a configuration error when trying to configure multiple keys", () => {
    expect(() => new DeterministicKeyProvider(["secret1", "secret2"])).toThrow(Configuration);
  });

  it("extends DerivedSecretKeyProvider", () => {
    expect(DeterministicKeyProvider.prototype instanceof DerivedSecretKeyProvider).toBe(true);
  });
});
