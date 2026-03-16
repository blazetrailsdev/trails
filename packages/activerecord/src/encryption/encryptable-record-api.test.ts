import { describe, it } from "vitest";

describe("ActiveRecord::Encryption::EncryptableRecordApiTest", () => {
  it.skip("encrypt encrypts all the encryptable attributes", () => {});
  it.skip("encrypt won't fail for classes without attributes to encrypt", () => {});
  it.skip("decrypt decrypts encrypted attributes", () => {});
  it.skip("decrypt can be invoked multiple times", () => {});
  it.skip("encrypt can be invoked multiple times", () => {});
  it.skip("encrypted_attribute? returns false for regular attributes", () => {});
  it.skip("encrypted_attribute? returns true for encrypted attributes which content is encrypted", () => {});
  it.skip("encrypted_attribute? returns false for encrypted attributes which content is not encrypted", () => {});
  it.skip("ciphertext_for returns the ciphertext for a given attribute", () => {});
  it.skip("ciphertext_for returns the persisted ciphertext for a non-deterministically encrypted attribute", () => {});
  it.skip("ciphertext_for returns the ciphertext of a new value", () => {});
  it.skip("ciphertext_for returns the ciphertext of a decrypted value", () => {});
  it.skip("ciphertext_for returns the ciphertext of a value when the record is new", () => {});
  it.skip("encrypt won't change the encoding of strings even when compression is used", () => {});
  it.skip("encrypt will honor forced encoding for deterministic attributes", () => {});
  it.skip("encrypt won't force encoding for deterministic attributes when option is nil", () => {});
  it.skip("encrypt will preserve case when :ignore_case option is used", () => {});
  it.skip("re-encrypting will preserve case when :ignore_case option is used", () => {});
  it.skip("encrypt attributes encrypted with a previous encryption scheme", () => {});
});
