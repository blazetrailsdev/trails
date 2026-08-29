import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { assertEncryptorWorksWith } from "./test-helpers.js";
import { Configurable } from "./configurable.js";
import { Message } from "./message.js";
import { Key } from "./key.js";
import { KeyProvider } from "./key-provider.js";
import type { KeyGenerator } from "./key-generator.js";

describe("ActiveRecord::Encryption::DerivedSecretKeyProviderTest", () => {
  let originalSalt: string | undefined;
  beforeAll(() => {
    originalSalt = Configurable.config.keyDerivationSalt;
    Configurable.config.keyDerivationSalt = "test-derivation-salt";
  });
  afterAll(() => {
    Configurable.config.keyDerivationSalt = originalSalt;
  });
  afterEach(() => {
    Configurable.config.storeKeyReferences = false;
  });

  let keyProvider: KeyProvider;
  beforeEach(() => {
    const keys = Array.from(
      { length: 3 },
      (_v, index) =>
        new Key((Configurable.keyGenerator as KeyGenerator).deriveKeyFrom(`some secret ${index}`)),
    );
    keyProvider = new KeyProvider(keys);
  });

  it("will derive a key with the right length from the given password", () => {
    const keyProvider = new DerivedSecretKeyProvider("some password");
    const key = keyProvider.encryptionKey();

    expect([key]).toEqual(keyProvider.decryptionKeys(new Message({ payload: "some secret" })));
    expect(Configurable.cipher.keyLength()).toEqual(Buffer.from(key.secret, "base64").byteLength);
  });

  it("work with multiple keys when config.store_key_references is false", () => {
    Configurable.config.storeKeyReferences = false;
    assertEncryptorWorksWith(keyProvider);
  });

  it("work with multiple keys when config.store_key_references is true", () => {
    Configurable.config.storeKeyReferences = true;
    assertEncryptorWorksWith(keyProvider);
  });
});
