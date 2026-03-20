import { describe, it, expect } from "vitest";
import { ReadOnlyNullEncryptor } from "./read-only-null-encryptor.js";
import { EncryptionError } from "./errors.js";

describe("ActiveRecord::Encryption::ReadOnlyNullEncryptorTest", () => {
  it("decrypt returns the encrypted message", () => {
    const enc = new ReadOnlyNullEncryptor();
    expect(enc.decrypt("hello")).toBe("hello");
  });

  it("encrypt raises an Encryption", () => {
    const enc = new ReadOnlyNullEncryptor();
    expect(() => enc.encrypt("hello")).toThrow(EncryptionError);
  });
});
