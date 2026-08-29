import { describe, it, expect } from "vitest";
import { Aes256Gcm as Cipher } from "./aes256-gcm.js";
import { MessageSerializer } from "../message-serializer.js";
import { Message } from "../message.js";
import { Decryption, EncryptedContentIntegrity } from "../errors.js";
import * as crypto from "crypto";
import { inspect } from "util";

function generateKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

describe("ActiveRecord::Encryption::Aes256GcmTest", () => {
  it("encrypts strings", () => {
    const key = generateKey();
    const cipher = new Cipher(key);
    const message = cipher.encrypt("hello world");
    const decrypted = new Cipher(key).decrypt(message);
    expect(decrypted.toString("utf-8")).toBe("hello world");
  });

  it("works with empty strings", () => {
    const key = generateKey();
    const cipher = new Cipher(key);
    const message = cipher.encrypt("");
    const decrypted = new Cipher(key).decrypt(message);
    expect(decrypted.toString("utf-8")).toBe("");
  });

  it("accepts a Buffer as input (for compressed binary payloads)", () => {
    const key = generateKey();
    const cipher = new Cipher(key);
    const inputBuf = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe]);
    const message = cipher.encrypt(inputBuf);
    const decrypted = new Cipher(key).decrypt(message);
    expect(decrypted).toEqual(inputBuf);
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
    const m1 = cipher.encrypt("hello");
    const m2 = cipher.encrypt("hello");
    expect(m1.payload).toEqual(m2.payload);
    expect(m1.headers.get("iv")).toEqual(m2.headers.get("iv"));
  });

  it("deterministic IV matches Rails HMAC-SHA256 derivation (fixed vector)", () => {
    const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const keyBuf = Buffer.from(key, "base64").subarray(0, 32);
    const expectedIv = crypto
      .createHmac("sha256", keyBuf)
      .update("hello world")
      .digest()
      .subarray(0, 12);

    const cipher = new Cipher(key, { deterministic: true });
    const message = cipher.encrypt("hello world");
    expect(message.headers.get("iv")).toEqual(expectedIv);
  });

  it("serialized envelope is byte-identical to MRI (single base64 hop)", () => {
    const key = "dGVzdC1kZXRlcm1pbmlzdGljLWtleS0zMmJ5dGVzISE=";
    const message = new Cipher(key, { deterministic: true }).encrypt("Hello from Rails 8.0.2");
    expect(new MessageSerializer().dump(message)).toBe(
      '{"p":"aiDvn3GJU0oNJl8gVJvDI8B7acYIBA==","h":{"iv":"wePblsDr4KpYOpQK","at":"91La92jfskP8kAvEw77Q7Q=="}}',
    );
  });

  it("it generates different ivs for different ciphertexts", () => {
    const key = generateKey();
    const cipher = new Cipher(key);
    const m1 = cipher.encrypt("hello");
    const m2 = cipher.encrypt("world");
    expect(m1.headers.get("iv")).not.toEqual(m2.headers.get("iv"));
  });

  it("raises EncryptedContentIntegrity for a truncated auth tag", () => {
    const key = generateKey();
    const fresh = new Cipher(key).encrypt("hello world");
    const iv = fresh.headers.get("iv") as Buffer;
    const realTag = fresh.headers.get("at") as Buffer;

    const forged = new Message({ payload: fresh.payload });
    forged.headers.add({ iv, at: realTag.subarray(0, 10) });
    expect(() => new Cipher(key).decrypt(forged)).toThrow(EncryptedContentIntegrity);
  });

  it("raises a retryable Decryption error (not integrity) when a well-formed tag is decrypted with the wrong key", () => {
    const message = new Cipher(generateKey()).encrypt("hello world");
    expect(() => new Cipher(generateKey()).decrypt(message)).toThrow(Decryption);
  });

  it("inspect_does not show secrets", () => {
    const secret = generateKey();
    const cipher = new Cipher(secret);
    expect(inspect(cipher)).not.toContain(secret);
    expect(JSON.stringify(cipher)).not.toContain(secret);
    expect(Object.keys(cipher)).not.toContain("secret");
  });
});
