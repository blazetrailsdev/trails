import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { Configurable } from "./configurable.js";
import { Message } from "./message.js";
import type { KeyGenerator } from "./key-generator.js";

describe("DerivedSecretKeyProvider", () => {
  let originalSalt: string | undefined;
  beforeAll(() => {
    originalSalt = Configurable.config.keyDerivationSalt;
    Configurable.config.keyDerivationSalt = "test-derivation-salt";
  });
  afterAll(() => {
    Configurable.config.keyDerivationSalt = originalSalt;
  });

  it("derives one key per password, in order", () => {
    const keyGenerator = Configurable.keyGenerator as KeyGenerator;
    const keyProvider = new DerivedSecretKeyProvider(["first", "second"]);
    const secrets = keyProvider
      .decryptionKeys(new Message({ payload: "some secret" }))!
      .map((key) => key.secret);
    expect(secrets).toEqual([
      keyGenerator.deriveKeyFrom("first"),
      keyGenerator.deriveKeyFrom("second"),
    ]);
  });
});
