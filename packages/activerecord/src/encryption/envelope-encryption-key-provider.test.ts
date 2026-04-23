import { describe, it, expect } from "vitest";
import { EnvelopeEncryptionKeyProvider } from "./envelope-encryption-key-provider.js";
import { KeyProvider } from "./key-provider.js";
import { Key } from "./key.js";
import { Encryptor } from "./encryptor.js";
import * as crypto from "crypto";

function makeKey(): Key {
  return new Key(crypto.randomBytes(32).toString("base64"));
}

describe("ActiveRecord::Encryption::EnvelopeEncryptionKeyProviderTest", () => {
  it("encryption_key returns random encryption keys", () => {
    const primaryProvider = new KeyProvider(makeKey());
    const provider = new EnvelopeEncryptionKeyProvider(primaryProvider);
    const k1 = provider.encryptionKey();
    const k2 = provider.encryptionKey();
    expect(k1.secret).not.toBe(k2.secret);
  });

  it("generate_random_encryption_key generates keys of 32 bytes", () => {
    const primaryProvider = new KeyProvider(makeKey());
    const provider = new EnvelopeEncryptionKeyProvider(primaryProvider);
    const keyStr = provider.generateRandomEncryptionKey();
    const buf = Buffer.from(keyStr, "base64");
    expect(buf.length).toBe(32);
  });

  it("generated random keys carry their secret encrypted with the primary key", () => {
    const primaryProvider = new KeyProvider(makeKey());
    const provider = new EnvelopeEncryptionKeyProvider(primaryProvider);
    const key = provider.encryptionKey();
    expect(key.publicTags.encrypted_data_key).toBeTruthy();
  });

  it("decryption_key_for returns the decryption key for a message that was encrypted with a generated encryption key", () => {
    const primaryProvider = new KeyProvider(makeKey());
    const provider = new EnvelopeEncryptionKeyProvider(primaryProvider);
    const enc = new Encryptor({ compress: false });
    const encrypted = enc.encrypt("hello", { keyProvider: provider });
    const decrypted = enc.decrypt(encrypted, { keyProvider: provider });
    expect(decrypted).toBe("hello");
  });

  it("work with multiple keys when config.store_key_references is false", () => {
    const primaryProvider = new KeyProvider([makeKey(), makeKey()]);
    const provider = new EnvelopeEncryptionKeyProvider(primaryProvider);
    const enc = new Encryptor({ compress: false });
    const encrypted = enc.encrypt("hello", { keyProvider: provider });
    const decrypted = enc.decrypt(encrypted, { keyProvider: provider });
    expect(decrypted).toBe("hello");
  });

  it("active_primary_key returns and memoizes the primary key", () => {
    let callCount = 0;
    const primaryKey = makeKey();
    const trackingProvider = {
      encryptionKey() {
        callCount++;
        return primaryKey;
      },
      decryptionKeys: () => [primaryKey],
    } as unknown as KeyProvider;

    const provider = new EnvelopeEncryptionKeyProvider(trackingProvider);
    const k1 = provider.activePrimaryKey;
    const k2 = provider.activePrimaryKey;
    expect(k1).toBe(primaryKey);
    expect(k2).toBe(k1);
    expect(callCount).toBe(1);
  });

  it("work with multiple keys when config.store_key_references is true", () => {
    const primaryProvider = new KeyProvider([makeKey(), makeKey()]);
    const provider = new EnvelopeEncryptionKeyProvider(primaryProvider);
    const enc = new Encryptor({ compress: false });
    const encrypted = enc.encrypt("hello", { keyProvider: provider });
    const decrypted = enc.decrypt(encrypted, { keyProvider: provider });
    expect(decrypted).toBe("hello");
  });
});
