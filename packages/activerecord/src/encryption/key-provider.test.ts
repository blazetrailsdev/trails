import { describe, it } from "vitest";

describe("ActiveRecord::Encryption::KeyProviderTest", () => {
  it.skip("serves a single key for encrypting and decrypting", () => {});
  it.skip("serves the last key for encrypting", () => {});
  it.skip("when store_key_references is false, the encryption key contains a reference to the key itself", () => {});
  it.skip("when store_key_references is true, the encryption key contains a reference to the key itself", () => {});
  it.skip("when the message does not contain any key reference, it returns all the keys", () => {});
  it.skip("when the message to decrypt contains a reference to the key id, it will return an array only with that message", () => {});
  it.skip("work with multiple keys when config.store_key_references is false", () => {});
  it.skip("work with multiple keys when config.store_key_references is true", () => {});
});
