import { describe, it } from "vitest";

describe("ActiveRecord::Encryption::EncryptionSchemesTest", () => {
  it.skip("can decrypt encrypted_value encrypted with a different encryption scheme", () => {});
  it.skip("when defining previous encryption schemes, you still get Decryption errors when using invalid clear values", () => {});
  it.skip("use a custom encryptor", () => {});
  it.skip("support previous contexts", () => {});
  it.skip("use global previous schemes to decrypt data encrypted with previous schemes", () => {});
  it.skip("use global previous schemes to decrypt data encrypted with previous schemes with unencrypted data", () => {});
  it.skip("returns ciphertext all the previous schemes fail to decrypt and support for unencrypted data is on", () => {});
  it.skip("raise decryption error when all the previous schemes fail to decrypt", () => {});
  it.skip("deterministic encryption is fixed by default: it will always use the oldest scheme to encrypt data", () => {});
  it.skip("don't use global previous schemes with a different deterministic nature", () => {});
  it.skip("deterministic encryption will use the newest encryption scheme to encrypt data when setting it to { fixed: false }", () => {});
  it.skip("use global previous schemes when performing queries", () => {});
  it.skip("don't use global previous schemes with a different deterministic nature when performing queries", () => {});
});
