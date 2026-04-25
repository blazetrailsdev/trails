import { describe, it, expect } from "vitest";
import { Encryptor } from "./encryptor.js";
import { DecryptionError, ForbiddenClass } from "./errors.js";
import { MessageSerializer } from "./message-serializer.js";
import { Message } from "./message.js";
import { defaultCompressor } from "./config.js";
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

  it("compresses when raw compressed bytes < original even if base64(compressed) > original", () => {
    // Regression test for C1: the old code compared base64(compressed).length vs original.length,
    // which incorrectly skipped compression when base64 overhead pushed the encoded size above the
    // original. The new code compares raw bytes, so compression is applied whenever deflated bytes
    // are smaller — base64 encoding happens after the decision.
    //
    // Arrange: a compressor that returns 106 raw bytes for 141-byte input.
    //   original = 141 bytes → compressed = 106 bytes → base64(106) = 144 bytes > 141 bytes
    //   Old code: base64(144) NOT < 141 → skipped compression (bug)
    //   New code: 106 < 141 → compresses (correct)
    const originalText = "a".repeat(141);
    const originalByteLen = Buffer.byteLength(originalText, "utf-8"); // 141
    const compressedRaw = Buffer.alloc(106); // 106 raw bytes → base64 = 144 bytes > 141
    const compressedBase64 = compressedRaw.toString("base64"); // 144 bytes
    expect(compressedBase64.length).toBeGreaterThan(originalByteLen); // proves base64 > original

    const spyCompressor = {
      deflate: (_data: string) => compressedRaw,
      inflate: (_data: Buffer | Uint8Array) => originalText, // simulate decompression
    };

    const enc = new Encryptor({ compress: true, compressor: spyCompressor });
    const key = generateKey();
    const encrypted = enc.encrypt(originalText, { key });

    // Verify the c (compressed) header is set in the message
    const serializer = new MessageSerializer();
    const message = serializer.load(encrypted);
    expect(message.headers.get("c")).toBe(true);

    // Full round-trip
    const decrypted = enc.decrypt(encrypted, { key });
    expect(decrypted).toBe(originalText);
  });

  it("short strings under threshold are not compressed even when compress is enabled", () => {
    let deflateCallCount = 0;
    const spyCompressor = {
      deflate: (data: string) => {
        deflateCallCount++;
        return Buffer.from(data, "utf-8");
      },
      inflate: (data: Buffer | Uint8Array) => Buffer.from(data).toString("utf-8"),
    };
    const enc = new Encryptor({ compress: true, compressor: spyCompressor });
    const key = generateKey();

    // Exactly at threshold (140 bytes) — not compressed
    enc.encrypt("x".repeat(140), { key });
    expect(deflateCallCount).toBe(0);

    // One byte above threshold — deflate is called
    enc.encrypt("x".repeat(141), { key });
    expect(deflateCallCount).toBe(1);
  });

  it("trying to encrypt custom classes raises a ForbiddenClass exception", () => {
    const enc = new Encryptor();
    expect(() => enc.encrypt({} as any, { key: generateKey() })).toThrow(ForbiddenClass);
  });

  it("store custom metadata with the encrypted data, accessible by the key provider", () => {
    const secret = generateKey();
    let receivedMessage: Message | null = null;

    // Key provider that stores publicTags in the message headers and reads them back
    // during decryption. Mirrors Rails: key_provider.encryption_key.public_tags are
    // serialized into the message, and decryption_keys receives the full Message.
    const keyProvider = {
      encryptionKey() {
        return { secret, publicTags: { model: "User", attr: "email" } };
      },
      decryptionKeys(message: Message) {
        receivedMessage = message;
        return [{ secret }];
      },
    };

    const enc = new Encryptor();
    const encrypted = enc.encrypt("test@example.com", { keyProvider });
    const decrypted = enc.decrypt(encrypted, { keyProvider });

    expect(decrypted).toBe("test@example.com");

    // Verify the custom metadata was stored in the message headers.
    const serializer = new MessageSerializer();
    const message = serializer.load(encrypted);
    expect(message.headers.get("model")).toBe("User");
    expect(message.headers.get("attr")).toBe("email");

    // Verify the key provider received a Message with the custom metadata headers during decryption.
    expect(receivedMessage).not.toBeNull();
    expect(receivedMessage!.headers.get("model")).toBe("User");
    expect(receivedMessage!.headers.get("attr")).toBe("email");
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

  it("decrypt respects encoding even when compression is used", () => {
    // Use a spy compressor so we can assert deflate/inflate were actually called.
    // The input is non-ASCII (Unicode) to exercise the UTF-8 round-trip path.
    let deflated = false;
    let inflated = false;
    const spyCompressor = {
      deflate(data: string) {
        deflated = true;
        return defaultCompressor.deflate(data);
      },
      inflate(data: Buffer) {
        inflated = true;
        return defaultCompressor.inflate(data);
      },
    };
    const enc = new Encryptor({ compress: true, compressor: spyCompressor });
    const key = generateKey();
    const text = ("The Starfleet is here — こんにちは 🌍 ¡Hola! Привет! " + "終わり！").repeat(40);
    const encrypted = enc.encrypt(text, { key });
    expect(enc.decrypt(encrypted, { key })).toBe(text);
    expect(deflated).toBe(true);
    expect(inflated).toBe(true);
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
