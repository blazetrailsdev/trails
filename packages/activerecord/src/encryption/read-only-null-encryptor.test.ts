import { describe, it, expect } from "vitest";
import { ReadOnlyNullEncryptor } from "./read-only-null-encryptor.js";
import { EncryptionError } from "./errors.js";

describe("ActiveRecord::Encryption::ReadOnlyNullEncryptorTest", () => {
  it("decrypt returns the encrypted message", () => {
    const enc = new ReadOnlyNullEncryptor();
    expect(enc.decrypt("some text")).toBe("some text");
  });

  it("encrypt raises an Encryption", () => {
    const enc = new ReadOnlyNullEncryptor();
    expect(() => enc.encrypt("some text")).toThrow(EncryptionError);
  });

  it("encrypted? returns false", () => {
    expect(new ReadOnlyNullEncryptor().isEncrypted("some text")).toBe(false);
  });

  it("binary? returns false", () => {
    expect(new ReadOnlyNullEncryptor().isBinary()).toBe(false);
  });
});
