import { describe, it } from "vitest";

describe("ActiveRecord::Encryption::EncryptorTest", () => {
  it.skip("encrypt and decrypt a string", () => {});
  it.skip("trying to decrypt something else than a string will raise a Decryption error", () => {});
  it.skip("decrypt an invalid string will raise a Decryption error", () => {});
  it.skip("decrypt an encrypted text with an invalid key will raise a Decryption error", () => {});
  it.skip("if an encryption error happens when encrypting an encrypted text it should raise", () => {});
  it.skip("content is compressed", () => {});
  it.skip("content is not compressed, when disabled", () => {});
  it.skip("trying to encrypt custom classes raises a ForbiddenClass exception", () => {});
  it.skip("store custom metadata with the encrypted data, accessible by the key provider", () => {});
  it.skip("encrypted? returns whether the passed text is encrypted", () => {});
  it.skip("decrypt respects encoding even when compression is used", () => {});
  it.skip("accept a custom compressor", () => {});
});
