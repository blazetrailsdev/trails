import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as crypto from "crypto";
import { Encryption } from "../encryption.js";
import { Encryption as ActiveRecordEncryption } from "../encryption.js";
import { Cipher } from "./cipher.js";
import { MessageSerializer } from "./message-serializer.js";
import { Encryptor } from "./encryptor.js";
import { Key } from "./key.js";
import { KeyProvider } from "./key-provider.js";

describe("ActiveRecord::Encryption::Encryptor (trails)", () => {
  const saved = Encryption.config.forcedEncodingForDeterministicEncryption;

  afterEach(() => {
    Encryption.config.forcedEncodingForDeterministicEncryption = saved;
  });

  function encryptDeterministically(clearText: Uint8Array): string | Uint8Array {
    const encryptor = new Encryptor({ compress: false });
    const keyProvider = new KeyProvider(new Key(crypto.randomBytes(32).toString("base64")));
    const encrypted = encryptor.encrypt(clearText, {
      keyProvider,
      cipherOptions: { deterministic: true },
    });
    return encryptor.decrypt(encrypted, { keyProvider });
  }

  it("deterministic encryption replaces the non-ASCII bytes of a binary clear text under a forced encoding", () => {
    Encryption.config.forcedEncodingForDeterministicEncryption = "US-ASCII";
    expect(encryptDeterministically(Uint8Array.of(0x68, 0xe9, 0x6c))).toBe("h?l");
  });

  it("deterministic encryption replaces the non-ASCII bytes of a binary clear text forced to UTF-8", () => {
    Encryption.config.forcedEncodingForDeterministicEncryption = "UTF-8";
    expect(encryptDeterministically(Uint8Array.of(0x68, 0xe9, 0x6c))).toBe("h�l");
  });
});

function generateKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

describe("ActiveRecord::Encryption::EncryptorTest (trails)", () => {
  it("compresses when raw compressed bytes < original even if base64(compressed) > original", () => {
    const originalText = "a".repeat(141);
    const originalByteLen = Buffer.byteLength(originalText, "utf-8");
    const compressedRaw = Buffer.alloc(106);
    const compressedBase64 = compressedRaw.toString("base64");
    expect(compressedBase64.length).toBeGreaterThan(originalByteLen);

    const spyCompressor = {
      deflate: (_data: string) => compressedRaw,
      inflate: (_data: Buffer | Uint8Array) => Buffer.from(originalText),
    };

    const enc = new Encryptor({ compress: true, compressor: spyCompressor });
    const key = generateKey();
    const encrypted = enc.encrypt(originalText, { keyProvider: new KeyProvider(new Key(key)) });

    const serializer = new MessageSerializer();
    const message = serializer.load(encrypted);
    expect(message.headers.get("c")).toBe(true);

    const decrypted = enc.decrypt(encrypted, { keyProvider: new KeyProvider(new Key(key)) });
    expect(decrypted).toBe(originalText);
  });

  it("short strings under threshold are not compressed even when compress is enabled", () => {
    let deflateCallCount = 0;
    const spyCompressor = {
      deflate: (data: string) => {
        deflateCallCount++;
        return Buffer.from(data, "utf-8");
      },
      inflate: (data: Buffer | Uint8Array) => Buffer.from(data),
    };
    const enc = new Encryptor({ compress: true, compressor: spyCompressor });
    const key = generateKey();

    enc.encrypt("x".repeat(140), { keyProvider: new KeyProvider(new Key(key)) });
    expect(deflateCallCount).toBe(0);

    enc.encrypt("x".repeat(141), { keyProvider: new KeyProvider(new Key(key)) });
    expect(deflateCallCount).toBe(1);
  });

  it("compress? returns the compress setting", () => {
    expect(new Encryptor({ compress: true }).isCompress()).toBe(true);
    expect(new Encryptor({ compress: false }).isCompress()).toBe(false);
  });

  it("binary? returns false (delegates to the JSON serializer)", () => {
    expect(new Encryptor().isBinary()).toBe(false);
  });

  it("deterministic encryption replaces unencodable characters based on forcedEncodingForDeterministicEncryption", () => {
    const key = generateKey();
    const enc = new Encryptor({ compress: false });
    const saved = ActiveRecordEncryption.config.forcedEncodingForDeterministicEncryption;
    try {
      ActiveRecordEncryption.config.forcedEncodingForDeterministicEncryption = "US-ASCII";
      const encrypted = enc.encrypt("héllo", {
        keyProvider: new KeyProvider(new Key(key)),
        cipherOptions: { deterministic: true },
      });
      const decrypted = enc.decrypt(encrypted, { keyProvider: new KeyProvider(new Key(key)) });
      expect(decrypted).toBe("h?llo");
    } finally {
      ActiveRecordEncryption.config.forcedEncodingForDeterministicEncryption = saved;
    }
  });

  describe("default key provider from ActiveRecordEncryption.config", () => {
    let savedPrimaryKey: string | string[] | undefined;
    let savedSalt: string | undefined;

    beforeEach(() => {
      savedPrimaryKey = ActiveRecordEncryption.config.primaryKey;
      savedSalt = ActiveRecordEncryption.config.keyDerivationSalt;
    });

    afterEach(() => {
      ActiveRecordEncryption.config.primaryKey = savedPrimaryKey;
      ActiveRecordEncryption.config.keyDerivationSalt = savedSalt;
      ActiveRecordEncryption.resetDefaultContext();
    });

    it("encrypts and decrypts using global primaryKey when no key/keyProvider is passed", () => {
      ActiveRecordEncryption.config.primaryKey = "a".repeat(32);
      ActiveRecordEncryption.config.keyDerivationSalt = "testsalt";
      const enc = new Encryptor({ compress: false });
      const encrypted = enc.encrypt("hello from config");
      const decrypted = enc.decrypt(encrypted);
      expect(decrypted).toBe("hello from config");
    });
  });

  it("cipher delegates to the configured cipher singleton", () => {
    const enc = new Encryptor();
    expect((enc as unknown as { cipher(): Cipher }).cipher()).toBeInstanceOf(Cipher);
    expect((enc as unknown as { cipher(): Cipher }).cipher()).toBe(ActiveRecordEncryption.cipher);
  });

  it("cipher reads from the current encryption context", () => {
    const customCipher = new Cipher();
    ActiveRecordEncryption.withEncryptionContext({ cipher: customCipher }, () => {
      expect((new Encryptor() as unknown as { cipher(): Cipher }).cipher()).toBe(customCipher);
    });
  });

  it("buildEncryptedMessage dispatches through cipher() for encrypt and decrypt", () => {
    const savedKey = ActiveRecordEncryption.config.primaryKey;
    const savedSalt = ActiveRecordEncryption.config.keyDerivationSalt;
    try {
      ActiveRecordEncryption.config.primaryKey = "a".repeat(32);
      ActiveRecordEncryption.config.keyDerivationSalt = "testsalt";
      ActiveRecordEncryption.resetDefaultContext();
      const enc = new Encryptor({ compress: false });
      const cipherSpy = vi.spyOn(enc as unknown as { cipher(): Cipher }, "cipher");
      const encrypted = enc.encrypt("secret text");
      const decrypted = enc.decrypt(encrypted);
      expect(cipherSpy).toHaveBeenCalledTimes(2);
      expect(decrypted).toBe("secret text");
      cipherSpy.mockRestore();
    } finally {
      ActiveRecordEncryption.config.primaryKey = savedKey;
      ActiveRecordEncryption.config.keyDerivationSalt = savedSalt;
      ActiveRecordEncryption.resetDefaultContext();
    }
  });
});
