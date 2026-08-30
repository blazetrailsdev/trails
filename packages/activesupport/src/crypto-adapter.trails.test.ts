import { describe, expect, it } from "vitest";
import { Cipher, getCrypto } from "./crypto-adapter.js";

describe("Cipher", () => {
  it("mints a random iv of the cipher's iv length before the underlying cipher exists", () => {
    const cipher = new Cipher("aes-256-gcm");
    cipher.encrypt();
    cipher.key = getCrypto().randomBytes(cipher.keyLen);

    const iv = cipher.randomIv();

    expect(iv.length).toBe(cipher.ivLen);
    expect(cipher.randomIv()).not.toEqual(iv);
  });

  it("round-trips through the iv it minted", () => {
    const key = getCrypto().randomBytes(32);

    const cipher = new Cipher("aes-256-gcm");
    cipher.encrypt();
    cipher.key = key;
    const iv = cipher.randomIv();
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from("some text", "utf-8")),
      cipher.final(),
    ]);
    const authTag = cipher.authTag;

    const decipher = new Cipher("aes-256-gcm");
    decipher.decrypt();
    decipher.key = key;
    decipher.iv = iv;
    decipher.authTag = authTag;

    expect(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8")).toBe(
      "some text",
    );
  });

  it("raises when used before its key or iv is set", () => {
    const cipher = new Cipher("aes-256-gcm");
    cipher.encrypt();

    expect(() => cipher.update(Buffer.from("x"))).toThrow("Cipher key not set");
  });
});
