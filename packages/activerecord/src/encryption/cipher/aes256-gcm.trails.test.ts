import { describe, it, expect } from "vitest";
import { Aes256Gcm as Cipher } from "./aes256-gcm.js";
import { MessageSerializer } from "../message-serializer.js";
import { Message } from "../message.js";
import { Decryption, EncryptedContentIntegrity } from "../errors.js";
import * as crypto from "crypto";

function generateKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

describe("ActiveRecord::Encryption::Aes256GcmTest (trails)", () => {
  it("accepts a Buffer as input (for compressed binary payloads)", () => {
    const key = generateKey();
    const cipher = new Cipher(key);
    const inputBuf = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe]);
    const message = cipher.encrypt(inputBuf);
    const decrypted = new Cipher(key).decrypt(message);
    expect(decrypted).toEqual(inputBuf);
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
});
