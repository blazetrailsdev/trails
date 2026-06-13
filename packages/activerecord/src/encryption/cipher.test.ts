import { describe, it, expect } from "vitest";
import * as crypto from "crypto";
import { Cipher } from "./cipher.js";
import { DecryptionError } from "./errors.js";
import { ConfigError } from "./errors.js";

function generateKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

describe("ActiveRecord::Encryption::CipherTest", () => {
  it("encrypts returns a encrypted test that can be decrypted with the same key", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const encrypted = cipher.encrypt("clean text", { key });
    expect(cipher.decrypt(encrypted, { key }).toString("utf-8")).toBe("clean text");
  });

  it("by default, encrypts uses random initialization vectors for each encryption operation", () => {
    const cipher = new Cipher();
    const key = generateKey();
    expect(cipher.encrypt("clean text", { key }).payload).not.toEqual(
      cipher.encrypt("clean text", { key }).payload,
    );
  });

  it("deterministic encryption with :deterministic param", () => {
    const cipher = new Cipher();
    const key = generateKey();
    expect(cipher.encrypt("clean text", { key, deterministic: true }).payload).toEqual(
      cipher.encrypt("clean text", { key, deterministic: true }).payload,
    );
  });

  it("raises an ArgumentError when provided a key with the wrong length", () => {
    const cipher = new Cipher();
    // 4 bytes encoded — well under the 32-byte minimum
    expect(() => cipher.encrypt("clean text", { key: Buffer.alloc(4).toString("base64") })).toThrow(
      ConfigError,
    );
  });

  it("iv_length returns the iv length of the cipher", () => {
    const cipher = new Cipher();
    expect(cipher.ivLength()).toBe(12);
  });

  it("generates different ciphertexts on different invocations with the same key (not deterministic)", () => {
    const cipher = new Cipher();
    const key = generateKey();
    expect(cipher.encrypt("clean text", { key }).payload).not.toEqual(
      cipher.encrypt("clean text", { key }).payload,
    );
  });

  it("decrypt can work with multiple keys", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const encrypted = cipher.encrypt("clean text", { key });
    expect(cipher.decrypt(encrypted, { key: [generateKey(), key] }).toString("utf-8")).toBe(
      "clean text",
    );
    expect(
      cipher.decrypt(encrypted, { key: [generateKey(), key, generateKey()] }).toString("utf-8"),
    ).toBe("clean text");
    expect(
      cipher.decrypt(encrypted, { key: [key, generateKey(), generateKey()] }).toString("utf-8"),
    ).toBe("clean text");
  });

  it("decrypt will raise an ActiveRecord::Encryption::Errors::Decryption error when none of the keys works", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const encrypted = cipher.encrypt("clean text", { key });
    expect(() => cipher.decrypt(encrypted, { key: [generateKey(), generateKey()] })).toThrow(
      DecryptionError,
    );
  });

  it("keep encoding from the source string", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const encrypted = cipher.encrypt("café résumé naïve", { key });
    expect(cipher.decrypt(encrypted, { key }).toString("utf-8")).toBe("café résumé naïve");
  });

  it("can encode unicode strings with emojis", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const encrypted = cipher.encrypt("Getting around with the ⚡️Go Menu", { key });
    expect(cipher.decrypt(encrypted, { key }).toString("utf-8")).toBe(
      "Getting around with the ⚡️Go Menu",
    );
  });
});
