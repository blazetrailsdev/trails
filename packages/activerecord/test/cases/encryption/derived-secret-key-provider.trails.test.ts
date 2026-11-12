import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DerivedSecretKeyProvider } from "../../../lib/encryption/derived-secret-key-provider.js";
import { Encryption } from "../../../lib/encryption.js";
import { Message } from "../../../lib/encryption/message.js";
import type { KeyGenerator } from "../../../lib/encryption/key-generator.js";

describe("DerivedSecretKeyProvider", () => {
  let originalSalt: string | undefined;
  beforeAll(() => {
    originalSalt = Encryption.config.keyDerivationSalt;
    Encryption.config.keyDerivationSalt = "test-derivation-salt";
  });
  afterAll(() => {
    Encryption.config.keyDerivationSalt = originalSalt;
  });

  it("derives one key per password, in order", () => {
    const keyGenerator = Encryption.keyGenerator as KeyGenerator;
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
