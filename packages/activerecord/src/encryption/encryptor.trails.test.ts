import { describe, it, expect, afterEach } from "vitest";
import * as crypto from "crypto";
import { Configurable } from "./configurable.js";
import { Encryptor } from "./encryptor.js";
import { Key } from "./key.js";
import { KeyProvider } from "./key-provider.js";

describe("ActiveRecord::Encryption::Encryptor (trails)", () => {
  const saved = Configurable.config.forcedEncodingForDeterministicEncryption;

  afterEach(() => {
    Configurable.config.forcedEncodingForDeterministicEncryption = saved;
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
    Configurable.config.forcedEncodingForDeterministicEncryption = "US-ASCII";
    expect(encryptDeterministically(Uint8Array.of(0x68, 0xe9, 0x6c))).toBe("h?l");
  });

  it("deterministic encryption replaces the non-ASCII bytes of a binary clear text forced to UTF-8", () => {
    Configurable.config.forcedEncodingForDeterministicEncryption = "UTF-8";
    expect(encryptDeterministically(Uint8Array.of(0x68, 0xe9, 0x6c))).toBe("h�l");
  });
});
