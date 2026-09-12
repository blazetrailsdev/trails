import { describe, it, expect, afterEach } from "vitest";
import { Configurable } from "./configurable.js";
import { EnvelopeEncryptionKeyProvider } from "./envelope-encryption-key-provider.js";
import { KeyProvider } from "./key-provider.js";
import { Encryptor } from "./encryptor.js";
import * as crypto from "crypto";

function makePrimaryKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

describe("ActiveRecord::Encryption::EnvelopeEncryptionKeyProviderTest", () => {
  const originalPrimaryKey = Configurable.config.primaryKey;

  afterEach(() => {
    Configurable.config.storeKeyReferences = false;
    Configurable.config.primaryKey = originalPrimaryKey;
  });

  it("encryption_key returns random encryption keys", () => {
    Configurable.config.primaryKey = makePrimaryKey();
    const provider = new EnvelopeEncryptionKeyProvider();
    const keys = [1, 2, 3, 4, 5].map(() => provider.encryptionKey());
    expect(new Set(keys.map((k) => k.secret)).size).toBe(5);
  });

  it("generate_random_encryption_key generates keys of 32 bytes", () => {
    Configurable.config.primaryKey = makePrimaryKey();
    const provider = new EnvelopeEncryptionKeyProvider();
    const buf = Buffer.from(provider.encryptionKey().secret, "base64");
    expect(buf.length).toBe(32);
  });

  it("generated random keys carry their secret encrypted with the primary key", () => {
    Configurable.config.primaryKey = makePrimaryKey();
    const provider = new EnvelopeEncryptionKeyProvider();
    const key = provider.encryptionKey();
    const encryptedSecret = key.publicTags.encryptedDataKey;
    expect(encryptedSecret).toBeTruthy();
    expect(
      new Encryptor({ compress: false }).decrypt(encryptedSecret as string, {
        key: provider.activePrimaryKey.secret,
      }),
    ).toBe(key.secret);
  });

  it("decryption_key_for returns the decryption key for a message that was encrypted with a generated encryption key", () => {
    Configurable.config.primaryKey = makePrimaryKey();
    const provider = new EnvelopeEncryptionKeyProvider();
    const key = provider.encryptionKey();
    const enc = new Encryptor({ compress: false });
    const encryptedEncodedMessage = enc.encrypt("some message", {
      keyProvider: new KeyProvider(key),
    });
    const encryptedMessage = Configurable.messageSerializer!.load(encryptedEncodedMessage);
    expect(provider.decryptionKeys(encryptedMessage)[0].secret).toBe(key.secret);
  });

  it("work with multiple keys when config.store_key_references is false", () => {
    Configurable.config.primaryKey = [makePrimaryKey(), makePrimaryKey()];
    const provider = new EnvelopeEncryptionKeyProvider();
    const enc = new Encryptor({ compress: false });
    const encrypted = enc.encrypt("hello", { keyProvider: provider });
    expect(enc.decrypt(encrypted, { keyProvider: provider })).toBe("hello");
  });

  it("work with multiple keys when config.store_key_references is true", () => {
    Configurable.config.storeKeyReferences = true;
    Configurable.config.primaryKey = [makePrimaryKey(), makePrimaryKey()];
    const provider = new EnvelopeEncryptionKeyProvider();
    const enc = new Encryptor({ compress: false });
    const encrypted = enc.encrypt("hello", { keyProvider: provider });
    expect(enc.decrypt(encrypted, { keyProvider: provider })).toBe("hello");
  });
});
