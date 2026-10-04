import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Cipher } from "./cipher.js";
import { Encryptor } from "./encryptor.js";
import { Key } from "./key.js";
import { KeyProvider } from "./key-provider.js";
import { Configurable } from "./configurable.js";
import { Encryption as ActiveRecordEncryption } from "../encryption.js";
import { Decryption, ForbiddenClass, Encryption } from "./errors.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { MessageSerializer } from "./message-serializer.js";
import { Message } from "./message.js";
import * as crypto from "crypto";

function generateKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

function assertEncryptText(enc: Encryptor, key: string, cleanText: string): void {
  const encryptedText = enc.encrypt(cleanText, { keyProvider: new KeyProvider(new Key(key)) });
  expect(encryptedText).not.toBe(cleanText);
  expect(enc.decrypt(encryptedText, { keyProvider: new KeyProvider(new Key(key)) })).toBe(
    cleanText,
  );
}

describe("ActiveRecord::Encryption::EncryptorTest", () => {
  it("encrypt and decrypt a string", () => {
    assertEncryptText(new Encryptor(), generateKey(), "my secret text");
  });

  it("trying to decrypt something else than a string will raise a Decryption error", () => {
    const enc = new Encryptor();
    expect(() =>
      enc.decrypt(42 as any, { keyProvider: new KeyProvider(new Key(generateKey())) }),
    ).toThrow(Decryption);
  });

  it("decrypt an invalid string will raise a Decryption error", () => {
    const enc = new Encryptor();
    expect(() =>
      enc.decrypt("not-encrypted", { keyProvider: new KeyProvider(new Key(generateKey())) }),
    ).toThrow(Decryption);
  });

  it("decrypt an encrypted text with an invalid key will raise a Decryption error", () => {
    const enc = new Encryptor();
    const key = generateKey();
    const wrongKey = generateKey();
    const encrypted = enc.encrypt("hello", { keyProvider: new KeyProvider(new Key(key)) });
    expect(() =>
      enc.decrypt(encrypted, { keyProvider: new KeyProvider(new Key(wrongKey)) }),
    ).toThrow(Decryption);
  });

  it("if an encryption error happens when encrypting an encrypted text it should raise", () => {
    const enc = new Encryptor();
    const keyProvider = new DerivedSecretKeyProvider("some key");
    vi.spyOn(keyProvider, "encryptionKey").mockImplementation(() => {
      throw new Encryption("boom");
    });
    expect(() => enc.encrypt("Some text to encrypt", { keyProvider })).toThrow(Encryption);
  });

  it("content is compressed", () => {
    const enc = new Encryptor({ compress: true });
    const key = generateKey();
    const content = crypto.randomBytes(5 * 1024).toString("hex");
    const cipherText = enc.encrypt(content, { keyProvider: new KeyProvider(new Key(key)) });

    assertEncryptText(enc, key, content);
    expect(Buffer.byteLength(cipherText) < Buffer.byteLength(content)).toBeTruthy();
  });

  it("content is not compressed, when disabled", () => {
    const enc = new Encryptor({ compress: false });
    const key = generateKey();
    const content = crypto.randomBytes(5 * 1024).toString("hex");
    const cipherText = enc.encrypt(content, { keyProvider: new KeyProvider(new Key(key)) });

    assertEncryptText(enc, key, content);
    expect(Buffer.byteLength(cipherText) > Buffer.byteLength(content)).toBeTruthy();
  });

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

  it("trying to encrypt custom classes raises a ForbiddenClass exception", () => {
    const enc = new Encryptor();
    expect(() =>
      enc.encrypt({} as any, { keyProvider: new KeyProvider(new Key(generateKey())) }),
    ).toThrow(ForbiddenClass);
  });

  it("store custom metadata with the encrypted data, accessible by the key provider", () => {
    const secret = generateKey();
    const keyProvider = {
      encryptionKey() {
        return { secret, publicTags: { model: "User", attr: "email" } };
      },
      decryptionKeys(_message: Message) {
        return [{ secret, publicTags: {} }];
      },
    };

    const enc = new Encryptor();
    const decryptedText = enc.decrypt(enc.encrypt("test@example.com", { keyProvider }), {
      keyProvider,
    });
    expect(decryptedText).toBeTruthy();
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
    expect(
      enc.isEncrypted(enc.encrypt("clean text", { keyProvider: new KeyProvider(new Key(key)) })),
    ).toBeTruthy();
    expect(enc.isEncrypted("clean text")).toBeFalsy();
  });

  it("decrypt respects encoding even when compression is used", () => {
    const enc = new Encryptor();
    const key = generateKey();
    const text = "The Starfleet is here " + "OMG! ".repeat(50) + "!";
    const decryptedText = enc.decrypt(
      enc.encrypt(text, { keyProvider: new KeyProvider(new Key(key)) }),
      { keyProvider: new KeyProvider(new Key(key)) },
    );

    expect(decryptedText).toBe(text);
  });

  it("deterministic encryption replaces unencodable characters based on forcedEncodingForDeterministicEncryption", () => {
    const key = generateKey();
    const enc = new Encryptor({ compress: false });
    const saved = Configurable.config.forcedEncodingForDeterministicEncryption;
    try {
      Configurable.config.forcedEncodingForDeterministicEncryption = "US-ASCII";
      const encrypted = enc.encrypt("héllo", {
        keyProvider: new KeyProvider(new Key(key)),
        cipherOptions: { deterministic: true },
      });
      const decrypted = enc.decrypt(encrypted, { keyProvider: new KeyProvider(new Key(key)) });
      expect(decrypted).toBe("h?llo");
    } finally {
      Configurable.config.forcedEncodingForDeterministicEncryption = saved;
    }
  });

  it("accept a custom compressor", () => {
    const compressor = {
      deflate: (data: string) => Buffer.from(`compressed ${data}`, "utf-8"),
      inflate: (data: Buffer) => Buffer.from(data.toString("utf-8").replace(/^compressed /, "")),
    };
    const enc = new Encryptor({ compress: true, compressor });
    const content = crypto.randomBytes(5 * 1024).toString("hex");

    assertEncryptText(enc, generateKey(), content);
  });

  describe("default key provider from Configurable.config", () => {
    let savedPrimaryKey: string | string[] | undefined;
    let savedSalt: string | undefined;

    beforeEach(() => {
      savedPrimaryKey = Configurable.config.primaryKey;
      savedSalt = Configurable.config.keyDerivationSalt;
    });

    afterEach(() => {
      Configurable.config.primaryKey = savedPrimaryKey;
      Configurable.config.keyDerivationSalt = savedSalt;
      ActiveRecordEncryption.resetDefaultContext();
    });

    it("encrypts and decrypts using global primaryKey when no key/keyProvider is passed", () => {
      Configurable.config.primaryKey = "a".repeat(32);
      Configurable.config.keyDerivationSalt = "testsalt";
      const enc = new Encryptor({ compress: false });
      const encrypted = enc.encrypt("hello from config");
      const decrypted = enc.decrypt(encrypted);
      expect(decrypted).toBe("hello from config");
    });
  });

  it("cipher delegates to the configured cipher singleton", () => {
    const enc = new Encryptor();
    expect((enc as any).cipher()).toBeInstanceOf(Cipher);
    expect((enc as any).cipher()).toBe(Configurable.cipher);
  });

  it("cipher reads from the current encryption context", () => {
    const customCipher = new Cipher();
    ActiveRecordEncryption.withEncryptionContext({ cipher: customCipher }, () => {
      expect((new Encryptor() as any).cipher()).toBe(customCipher);
    });
  });

  it("buildEncryptedMessage dispatches through cipher() for encrypt and decrypt", () => {
    const savedKey = Configurable.config.primaryKey;
    const savedSalt = Configurable.config.keyDerivationSalt;
    try {
      Configurable.config.primaryKey = "a".repeat(32);
      Configurable.config.keyDerivationSalt = "testsalt";
      ActiveRecordEncryption.resetDefaultContext();
      const enc = new Encryptor({ compress: false });
      const cipherSpy = vi.spyOn(enc as any, "cipher");
      const encrypted = enc.encrypt("secret text");
      const decrypted = enc.decrypt(encrypted);
      expect(cipherSpy).toHaveBeenCalledTimes(2);
      expect(decrypted).toBe("secret text");
      cipherSpy.mockRestore();
    } finally {
      Configurable.config.primaryKey = savedKey;
      Configurable.config.keyDerivationSalt = savedSalt;
      ActiveRecordEncryption.resetDefaultContext();
    }
  });
});
