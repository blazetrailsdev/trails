import { describe, it, expect, afterEach } from "vitest";
import { Encryption } from "../encryption.js";
import { EnvelopeEncryptionKeyProvider } from "./envelope-encryption-key-provider.js";
import { KeyProvider } from "./key-provider.js";
import type { Message } from "./message.js";
import { Encryptor } from "./encryptor.js";
import { assertEncryptorWorksWith } from "./test-helpers.js";
import * as crypto from "crypto";

function makePrimaryKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

describe("ActiveRecord::Encryption::EnvelopeEncryptionKeyProviderTest", () => {
  const originalPrimaryKey = Encryption.config.primaryKey;

  afterEach(() => {
    Encryption.config.storeKeyReferences = false;
    Encryption.config.primaryKey = originalPrimaryKey;
  });

  it("encryption_key returns random encryption keys", () => {
    Encryption.config.primaryKey = makePrimaryKey();
    const provider = new EnvelopeEncryptionKeyProvider();
    const keys = [1, 2, 3, 4, 5].map(() => provider.encryptionKey());
    expect(new Set(keys.map((k) => k.secret)).size).toBe(5);
  });

  it("generate_random_encryption_key generates keys of 32 bytes", () => {
    Encryption.config.primaryKey = makePrimaryKey();
    const provider = new EnvelopeEncryptionKeyProvider();
    const buf = Buffer.from(provider.encryptionKey().secret, "base64");
    expect(buf.length).toBe(32);
  });

  it("generated random keys carry their secret encrypted with the primary key", () => {
    Encryption.config.primaryKey = makePrimaryKey();
    const provider = new EnvelopeEncryptionKeyProvider();
    const key = provider.encryptionKey();
    const encryptedSecret = key.publicTags.encryptedDataKey;
    expect(
      Encryption.cipher.decrypt(encryptedSecret as Message, {
        key: provider.activePrimaryKey.secret,
      }),
    ).toBe(key.secret);
  });

  it("decryption_key_for returns the decryption key for a message that was encrypted with a generated encryption key", () => {
    Encryption.config.primaryKey = makePrimaryKey();
    const provider = new EnvelopeEncryptionKeyProvider();
    const key = provider.encryptionKey();
    const enc = new Encryptor({ compress: false });
    const encryptedEncodedMessage = enc.encrypt("some message", {
      keyProvider: new KeyProvider(key),
    });
    const encryptedMessage = Encryption.messageSerializer!.load(encryptedEncodedMessage);
    expect(provider.decryptionKeys(encryptedMessage)[0].secret).toBe(key.secret);
  });

  it("work with multiple keys when config.store_key_references is false", () => {
    Encryption.config.primaryKey = [makePrimaryKey(), makePrimaryKey()];
    const provider = new EnvelopeEncryptionKeyProvider();
    assertEncryptorWorksWith(provider);
  });

  it("work with multiple keys when config.store_key_references is true", () => {
    Encryption.config.storeKeyReferences = true;
    Encryption.config.primaryKey = [makePrimaryKey(), makePrimaryKey()];
    const provider = new EnvelopeEncryptionKeyProvider();
    assertEncryptorWorksWith(provider);
  });
});
