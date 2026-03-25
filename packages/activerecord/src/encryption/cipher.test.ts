import { describe, it, expect } from "vitest";
import { Cipher } from "./cipher/aes256-gcm.js";
import { DecryptionError } from "./errors.js";
import * as crypto from "crypto";

function generateKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

describe("ActiveRecord::Encryption::CipherTest", () => {
  it("encrypts returns a encrypted test that can be decrypted with the same key", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const result = cipher.encrypt("hello world", key);
    const decrypted = cipher.decrypt(result.payload, key, result.iv, result.authTag);
    expect(decrypted).toBe("hello world");
  });

  it("by default, encrypts uses random initialization vectors for each encryption operation", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const r1 = cipher.encrypt("hello", key);
    const r2 = cipher.encrypt("hello", key);
    expect(r1.iv).not.toBe(r2.iv);
  });

  it("deterministic encryption with :deterministic param", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const r1 = cipher.encrypt("hello", key, { deterministic: true });
    const r2 = cipher.encrypt("hello", key, { deterministic: true });
    expect(r1.payload).toBe(r2.payload);
    expect(r1.iv).toBe(r2.iv);
  });

  it("raises an ArgumentError when provided a key with the wrong length", () => {
    const cipher = new Cipher();
    const shortKey = Buffer.from("short").toString("base64");
    expect(() => cipher.encrypt("hello", shortKey)).toThrow();
  });

  it("iv_length returns the iv length of the cipher", () => {
    expect(Cipher.ivLength).toBe(12);
  });

  it("generates different ciphertexts on different invocations with the same key (not deterministic)", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const r1 = cipher.encrypt("hello", key);
    const r2 = cipher.encrypt("hello", key);
    expect(r1.payload).not.toBe(r2.payload);
  });

  it("decrypt can work with multiple keys", () => {
    const cipher = new Cipher();
    const key1 = generateKey();
    const key2 = generateKey();
    const result = cipher.encrypt("hello", key2);
    const decrypted = cipher.decrypt(result.payload, [key1, key2], result.iv, result.authTag);
    expect(decrypted).toBe("hello");
  });

  it("decrypt will raise an ActiveRecord::Encryption::Errors::Decryption error when none of the keys works", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const wrongKey = generateKey();
    const result = cipher.encrypt("hello", key);
    expect(() => cipher.decrypt(result.payload, wrongKey, result.iv, result.authTag)).toThrow(
      DecryptionError,
    );
  });

  it("keep encoding from the source string", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const text = "héllo wörld";
    const result = cipher.encrypt(text, key);
    const decrypted = cipher.decrypt(result.payload, key, result.iv, result.authTag);
    expect(decrypted).toBe(text);
  });

  it("can encode unicode strings with emojis", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const text = "Hello 🌍🚀";
    const result = cipher.encrypt(text, key);
    const decrypted = cipher.decrypt(result.payload, key, result.iv, result.authTag);
    expect(decrypted).toBe(text);
  });
});
