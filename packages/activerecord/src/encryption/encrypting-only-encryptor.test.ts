import { describe, it, expect } from "vitest";
import { EncryptingOnlyEncryptor } from "./encrypting-only-encryptor.js";
import { Encryptor } from "./encryptor.js";
import * as crypto from "crypto";

function generateKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

describe("ActiveRecord::Encryption::EncryptingOnlyEncryptorTest", () => {
  it("decrypt returns the passed data", () => {
    const enc = new EncryptingOnlyEncryptor();
    expect(enc.decrypt("Some data")).toBe("Some data");
  });

  it("encrypt encrypts the passed data", () => {
    const enc = new EncryptingOnlyEncryptor();
    const key = generateKey();
    const encrypted = enc.encrypt("Some data", { key });
    expect(encrypted).not.toBe("Some data");
    const realEnc = new Encryptor();
    const decrypted = realEnc.decrypt(encrypted, { key });
    expect(decrypted).toBe("Some data");
  });

  it("extends Encryptor", () => {
    expect(EncryptingOnlyEncryptor.prototype instanceof Encryptor).toBe(true);
  });
});
