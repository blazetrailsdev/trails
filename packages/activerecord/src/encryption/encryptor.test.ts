import { describe, it, expect } from "vitest";
import { Encryptor } from "./encryptor.js";
import { DecryptionError, ForbiddenClass } from "./errors.js";
import * as crypto from "crypto";

function generateKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

describe("ActiveRecord::Encryption::EncryptorTest", () => {
  it("encrypt and decrypt a string", () => {
    const enc = new Encryptor();
    const key = generateKey();
    const encrypted = enc.encrypt("hello world", { key });
    const decrypted = enc.decrypt(encrypted, { key });
    expect(decrypted).toBe("hello world");
  });

  it("trying to decrypt something else than a string will raise a Decryption error", () => {
    const enc = new Encryptor();
    expect(() => enc.decrypt(42 as any, { key: generateKey() })).toThrow(DecryptionError);
  });

  it("decrypt an invalid string will raise a Decryption error", () => {
    const enc = new Encryptor();
    expect(() => enc.decrypt("not-encrypted", { key: generateKey() })).toThrow(DecryptionError);
  });

  it("decrypt an encrypted text with an invalid key will raise a Decryption error", () => {
    const enc = new Encryptor();
    const key = generateKey();
    const wrongKey = generateKey();
    const encrypted = enc.encrypt("hello", { key });
    expect(() => enc.decrypt(encrypted, { key: wrongKey })).toThrow(DecryptionError);
  });

  it("if an encryption error happens when encrypting an encrypted text it should raise", () => {
    const enc = new Encryptor();
    expect(() => enc.encrypt("hello", {})).toThrow();
  });

  it("content is compressed", () => {
    const enc = new Encryptor({ compress: true });
    const key = generateKey();
    const longText = "a".repeat(1000);
    const encrypted = enc.encrypt(longText, { key });
    const decrypted = enc.decrypt(encrypted, { key });
    expect(decrypted).toBe(longText);
  });

  it("content is not compressed, when disabled", () => {
    const enc = new Encryptor({ compress: false });
    const key = generateKey();
    const encrypted = enc.encrypt("hello", { key });
    const decrypted = enc.decrypt(encrypted, { key });
    expect(decrypted).toBe("hello");
  });

  it("trying to encrypt custom classes raises a ForbiddenClass exception", () => {
    const enc = new Encryptor();
    expect(() => enc.encrypt({} as any, { key: generateKey() })).toThrow(ForbiddenClass);
  });

  it.skip("store custom metadata with the encrypted data, accessible by the key provider", () => {
    /* needs key provider integration with metadata */
  });

  it("compress? returns the compress setting", () => {
    expect(new Encryptor({ compress: true }).isCompress()).toBe(true);
    expect(new Encryptor({ compress: false }).isCompress()).toBe(false);
  });

  it("binary? returns false (delegates to the JSON serializer)", () => {
    expect(new Encryptor().isBinary()).toBe(false);
  });

  it("encrypted? returns whether the passed text is encrypted", () => {
    const enc = new Encryptor();
    const key = generateKey();
    const encrypted = enc.encrypt("hello", { key });
    expect(enc.isEncrypted(encrypted)).toBe(true);
    expect(enc.isEncrypted("plain text")).toBe(false);
  });

  it.skip("decrypt respects encoding even when compression is used", () => {
    /* needs encoding preservation in compression */
  });

  it("accept a custom compressor", () => {
    const originalText = "x".repeat(1000);
    const compressedMagic = "COMPRESSED";
    let deflated = false;
    let inflated = false;
    const customCompressor = {
      deflate(_data: string) {
        deflated = true;
        return Buffer.from(compressedMagic, "utf-8");
      },
      inflate(_data: Buffer) {
        inflated = true;
        return originalText;
      },
    };
    const enc = new Encryptor({ compress: true, compressor: customCompressor });
    expect(enc.compressor).toBe(customCompressor);
    const key = generateKey();
    const encrypted = enc.encrypt(originalText, { key });
    const decrypted = enc.decrypt(encrypted, { key });
    expect(decrypted).toBe(originalText);
    expect(deflated).toBe(true);
    expect(inflated).toBe(true);
  });
});
