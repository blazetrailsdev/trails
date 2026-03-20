import { describe, it, expect } from "vitest";
import { KeyProvider } from "./key-provider.js";
import { Key } from "./key.js";
import { Message } from "./message.js";
import { Encryptor } from "./encryptor.js";
import * as crypto from "crypto";

function makeKey(): Key {
  return new Key(crypto.randomBytes(32).toString("base64"));
}

describe("ActiveRecord::Encryption::KeyProviderTest", () => {
  it("serves a single key for encrypting and decrypting", () => {
    const key = makeKey();
    const provider = new KeyProvider(key);
    const encKey = provider.encryptionKey();
    expect(encKey.secret).toBe(key.secret);
    const decKeys = provider.decryptionKeys(new Message(""));
    expect(decKeys).toHaveLength(1);
    expect(decKeys[0].secret).toBe(key.secret);
  });

  it("serves the last key for encrypting", () => {
    const k1 = makeKey();
    const k2 = makeKey();
    const provider = new KeyProvider([k1, k2]);
    expect(provider.encryptionKey().secret).toBe(k2.secret);
  });

  it("when store_key_references is false, the encryption key contains a reference to the key itself", () => {
    const key = makeKey();
    const provider = new KeyProvider(key);
    const encKey = provider.encryptionKey();
    expect(encKey.id).toBeTruthy();
  });

  it("when store_key_references is true, the encryption key contains a reference to the key itself", () => {
    const key = makeKey();
    const provider = new KeyProvider(key);
    const encKey = provider.encryptionKey();
    expect(encKey.id).toBe(key.id);
  });

  it("when the message does not contain any key reference, it returns all the keys", () => {
    const k1 = makeKey();
    const k2 = makeKey();
    const provider = new KeyProvider([k1, k2]);
    const decKeys = provider.decryptionKeys(new Message(""));
    expect(decKeys).toHaveLength(2);
  });

  it("when the message to decrypt contains a reference to the key id, it will return an array only with that message", () => {
    const k1 = makeKey();
    const k2 = makeKey();
    const provider = new KeyProvider([k1, k2]);
    const message = new Message("");
    message.addHeader("k", k2.id);
    const decKeys = provider.decryptionKeys(message);
    expect(decKeys).toHaveLength(1);
    expect(decKeys[0].secret).toBe(k2.secret);
  });

  it("work with multiple keys when config.store_key_references is false", () => {
    const k1 = makeKey();
    const k2 = makeKey();
    const provider = new KeyProvider([k1, k2]);
    const enc = new Encryptor({ compress: false });
    const encrypted = enc.encrypt("hello", { keyProvider: provider });
    const decrypted = enc.decrypt(encrypted, { keyProvider: provider });
    expect(decrypted).toBe("hello");
  });

  it("work with multiple keys when config.store_key_references is true", () => {
    const k1 = makeKey();
    const k2 = makeKey();
    const provider = new KeyProvider([k1, k2]);
    const enc = new Encryptor({ compress: false });
    const encrypted = enc.encrypt("hello", { keyProvider: provider });
    const decrypted = enc.decrypt(encrypted, { keyProvider: provider });
    expect(decrypted).toBe("hello");
  });
});
