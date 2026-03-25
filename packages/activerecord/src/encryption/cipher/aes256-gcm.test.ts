import { describe, it, expect } from "vitest";
import { Cipher } from "./aes256-gcm.js";
import * as crypto from "crypto";

function generateKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

describe("ActiveRecord::Encryption::Aes256GcmTest", () => {
  it("encrypts strings", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const result = cipher.encrypt("hello world", key);
    const decrypted = cipher.decrypt(result.payload, key, result.iv, result.authTag);
    expect(decrypted).toBe("hello world");
  });

  it("works with empty strings", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const result = cipher.encrypt("", key);
    const decrypted = cipher.decrypt(result.payload, key, result.iv, result.authTag);
    expect(decrypted).toBe("");
  });

  it("uses non-deterministic encryption by default", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const r1 = cipher.encrypt("hello", key);
    const r2 = cipher.encrypt("hello", key);
    expect(r1.iv).not.toBe(r2.iv);
  });

  it("in deterministic mode, it generates the same ciphertext for the same inputs", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const r1 = cipher.encrypt("hello", key, { deterministic: true });
    const r2 = cipher.encrypt("hello", key, { deterministic: true });
    expect(r1.payload).toBe(r2.payload);
    expect(r1.iv).toBe(r2.iv);
  });

  it("it generates different ivs for different ciphertexts", () => {
    const cipher = new Cipher();
    const key = generateKey();
    const r1 = cipher.encrypt("hello", key);
    const r2 = cipher.encrypt("world", key);
    expect(r1.iv).not.toBe(r2.iv);
  });

  it.skip("inspect_does not show secrets", () => {
    /* needs custom inspect/toString */
  });
});
