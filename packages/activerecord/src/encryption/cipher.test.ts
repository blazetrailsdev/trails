import { describe, it } from "vitest";

describe("ActiveRecord::Encryption::CipherTest", () => {
  it.skip("encrypts returns a encrypted test that can be decrypted with the same key", () => {});
  it.skip("by default, encrypts uses random initialization vectors for each encryption operation", () => {});
  it.skip("deterministic encryption with :deterministic param", () => {});
  it.skip("raises an ArgumentError when provided a key with the wrong length", () => {});
  it.skip("iv_length returns the iv length of the cipher", () => {});
  it.skip("generates different ciphertexts on different invocations with the same key (not deterministic)", () => {});
  it.skip("decrypt can work with multiple keys", () => {});
  it.skip("decrypt will raise an ActiveRecord::Encryption::Errors::Decryption error when none of the keys works", () => {});
  it.skip("keep encoding from the source string", () => {});
  it.skip("can encode unicode strings with emojis", () => {});
});
