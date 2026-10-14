import { describe, it, expect } from "vitest";
import { Aes256Gcm as Cipher } from "./aes256-gcm.js";
import * as crypto from "crypto";
import { inspect } from "util";

function generateKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

function assertCipherEncrypts(cipher: Cipher, contentToEncrypt: string) {
  const encryptedContent = cipher.encrypt(contentToEncrypt);
  expect(encryptedContent).not.toEqual(contentToEncrypt);
  expect(cipher.decrypt(encryptedContent).toString("utf-8")).toBe(contentToEncrypt);
}

describe("ActiveRecord::Encryption::Aes256GcmTest", () => {
  it("encrypts strings", () => {
    const key = generateKey();
    const cipher = new Cipher(key);
    assertCipherEncrypts(cipher, "Some clear text");
  });

  it("works with empty strings", () => {
    const key = generateKey();
    const cipher = new Cipher(key);
    assertCipherEncrypts(cipher, "");
  });

  it("uses non-deterministic encryption by default", () => {
    const key = generateKey();
    const cipher = new Cipher(key);
    const m1 = cipher.encrypt("hello");
    const m2 = cipher.encrypt("hello");
    expect(m1.headers.get("iv")).not.toEqual(m2.headers.get("iv"));
  });

  it("in deterministic mode, it generates the same ciphertext for the same inputs", () => {
    const key = generateKey();
    const cipher = new Cipher(key, { deterministic: true });
    assertCipherEncrypts(cipher, "Some clear text");

    expect(cipher.encrypt("Some text").payload).toEqual(cipher.encrypt("Some text").payload);
    expect(cipher.encrypt("Some text").payload).not.toEqual(
      cipher.encrypt("Some other text").payload,
    );
  });

  it("it generates different ivs for different ciphertexts", () => {
    const key = generateKey();
    const cipher = new Cipher(key, { deterministic: true });
    expect(cipher.encrypt("Some text").headers.get("iv")).toEqual(
      cipher.encrypt("Some text").headers.get("iv"),
    );
    expect(cipher.encrypt("Some text").headers.get("iv")).not.toEqual(
      cipher.encrypt("Some other text").headers.get("iv"),
    );
  });

  it("inspect_does not show secrets", () => {
    const secret = generateKey();
    const cipher = new Cipher(secret);
    expect(inspect(cipher)).toMatch(/^#<ActiveRecord::Encryption::Cipher::Aes256Gcm:0x[0-9a-f]+>$/);
  });
});
