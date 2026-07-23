import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KeyProvider } from "./key-provider.js";
import { Key } from "./key.js";
import { Message } from "./message.js";
import { Encryptor } from "./encryptor.js";
import { Configurable } from "./configurable.js";
import * as crypto from "crypto";

function makeKey(): Key {
  return new Key(crypto.randomBytes(32).toString("base64"));
}

function buildKeys(count: number): Key[] {
  return Array.from({ length: count }, () => makeKey());
}

describe("ActiveRecord::Encryption::KeyProviderTest", () => {
  let message: Message;
  let keys: Key[];
  let keyProvider: KeyProvider;
  let originalStoreKeyReferences: boolean;

  beforeEach(() => {
    originalStoreKeyReferences = Configurable.config.storeKeyReferences;
    message = new Message("some secret");
    keys = buildKeys(3);
    keyProvider = new KeyProvider(keys);
  });

  afterEach(() => {
    Configurable.config.storeKeyReferences = originalStoreKeyReferences;
  });

  it("serves a single key for encrypting and decrypting", () => {
    const key = keys[0];
    const provider = new KeyProvider(key);

    expect(provider.encryptionKey()).toBe(key);
    expect(provider.decryptionKeys(message)).toEqual([provider.encryptionKey()]);
  });

  it("serves the last key for encrypting", () => {
    expect(keyProvider.encryptionKey()).toBe(keys[keys.length - 1]);
  });

  it("when store_key_references is false, the encryption key contains a reference to the key itself", () => {
    expect(keyProvider.encryptionKey().publicTags.encryptedDataKeyId).toBeUndefined();
  });

  it("when store_key_references is true, the encryption key contains a reference to the key itself", () => {
    Configurable.config.storeKeyReferences = true;

    expect(keyProvider.encryptionKey().publicTags.encryptedDataKeyId).toBe(
      keys[keys.length - 1].id,
    );
  });

  it("when the message does not contain any key reference, it returns all the keys", () => {
    expect(keyProvider.decryptionKeys(message)).toEqual(keys);
  });

  it("when the message to decrypt contains a reference to the key id, it will return an array only with that message", () => {
    const targetKey = keys[1];

    message.headers.encryptedDataKeyId = targetKey.id;

    expect(keyProvider.decryptionKeys(message)).toEqual([targetKey]);
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

function assertEncryptorWorksWith(keyProvider: KeyProvider): void {
  const encryptor = new Encryptor();
  const encryptedMessage = encryptor.encrypt("some text", { keyProvider });
  expect(encryptor.decrypt(encryptedMessage, { keyProvider })).toBe("some text");
}
