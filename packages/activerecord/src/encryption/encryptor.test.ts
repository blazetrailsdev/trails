import { describe, it, expect, vi } from "vitest";
import { Encryptor } from "./encryptor.js";
import { Key } from "./key.js";
import { KeyProvider } from "./key-provider.js";
import { Decryption, ForbiddenClass, Encryption } from "./errors.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
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

  it("accept a custom compressor", () => {
    const compressor = {
      deflate: (data: string) => Buffer.from(`compressed ${data}`, "utf-8"),
      inflate: (data: Buffer) => Buffer.from(data.toString("utf-8").replace(/^compressed /, "")),
    };
    const enc = new Encryptor({ compress: true, compressor });
    const content = crypto.randomBytes(5 * 1024).toString("hex");

    assertEncryptText(enc, generateKey(), content);
  });
});
