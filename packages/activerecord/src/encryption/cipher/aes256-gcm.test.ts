import { describe, it, expect } from "vitest";
import { Aes256Gcm as Cipher } from "./aes256-gcm.js";
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
    expect(m1.headers.get("iv")).not.toBe(m2.headers.get("iv"));
  });

  it("in deterministic mode, it generates the same ciphertext for the same inputs", () => {
    const key = generateKey();
    const cipher = new Cipher(key, { deterministic: true });
    const m1 = cipher.encrypt("hello");
    const m2 = cipher.encrypt("hello");
    expect(m1.payload).toBe(m2.payload);
    expect(m1.headers.get("iv")).toBe(m2.headers.get("iv"));
  });

  it("deterministic IV matches Rails HMAC-SHA256 derivation (fixed vector)", () => {
    // Fixed key and plaintext — verify the IV equals HMAC-SHA256(key_bytes, plaintext)[0..12].
    // To verify with Ruby:
    //   key_bytes = Base64.strict_decode64(key)[0,32]
    //   iv = OpenSSL::HMAC.digest("SHA256", key_bytes, "hello world")[0, 12]
    //   puts Base64.strict_encode64(iv)
    const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // 32 zero bytes base64
    const keyBuf = Buffer.from(key, "base64").subarray(0, 32);
    const expectedIv = crypto
      .createHmac("sha256", keyBuf)
      .update("hello world")
      .digest()
      .subarray(0, 12)
      .toString("base64");

    const cipher = new Cipher(key, { deterministic: true });
    const message = cipher.encrypt("hello world");
    expect(message.headers.get("iv")).toBe(expectedIv);
  });

  it("it generates different ivs for different ciphertexts", () => {
    const key = generateKey();
    const cipher = new Cipher(key);
    const m1 = cipher.encrypt("hello");
    const m2 = cipher.encrypt("world");
    expect(m1.headers.get("iv")).not.toBe(m2.headers.get("iv"));
  });

  it("inspect_does not show secrets", () => {
    const secret = generateKey();
    const cipher = new Cipher(secret);
    expect(inspect(cipher)).not.toContain(secret);
    expect(JSON.stringify(cipher)).not.toContain(secret);
    expect(Object.keys(cipher)).not.toContain("secret");
  });
});
