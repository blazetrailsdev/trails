import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { DerivedSecretKeyProvider } from "../../../lib/encryption/derived-secret-key-provider.js";
import { assertEncryptorWorksWith } from "./helper.js";
import { Encryption } from "../../../lib/encryption.js";
import { Message } from "../../../lib/encryption/message.js";
import { Key } from "../../../lib/encryption/key.js";
import { KeyProvider } from "../../../lib/encryption/key-provider.js";
import type { KeyGenerator } from "../../../lib/encryption/key-generator.js";

describe("ActiveRecord::Encryption::DerivedSecretKeyProviderTest", () => {
  let originalSalt: string | undefined;
  beforeAll(() => {
    originalSalt = Encryption.config.keyDerivationSalt;
    Encryption.config.keyDerivationSalt = "test-derivation-salt";
  });
  afterAll(() => {
    Encryption.config.keyDerivationSalt = originalSalt;
  });
  afterEach(() => {
    Encryption.config.storeKeyReferences = false;
  });

  let keyProvider: KeyProvider;
  beforeEach(() => {
    const keys = Array.from(
      { length: 3 },
      (_v, index) =>
        new Key((Encryption.keyGenerator as KeyGenerator).deriveKeyFrom(`some secret ${index}`)),
    );
    keyProvider = new KeyProvider(keys);
  });

  it("will derive a key with the right length from the given password", () => {
    const keyProvider = new DerivedSecretKeyProvider("some password");
    const key = keyProvider.encryptionKey();

    expect([key]).toEqual(keyProvider.decryptionKeys(new Message({ payload: "some secret" })));
    expect(Encryption.cipher.keyLength()).toEqual(Buffer.from(key.secret, "base64").byteLength);
  });

  it("work with multiple keys when config.store_key_references is false", () => {
    Encryption.config.storeKeyReferences = false;
    assertEncryptorWorksWith(keyProvider);
  });

  it("work with multiple keys when config.store_key_references is true", () => {
    Encryption.config.storeKeyReferences = true;
    assertEncryptorWorksWith(keyProvider);
  });
});
