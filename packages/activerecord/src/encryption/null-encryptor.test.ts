import { describe, it, expect } from "vitest";
import { NullEncryptor } from "./null-encryptor.js";

describe("ActiveRecord::Encryption::NullEncryptorTest", () => {
  it("encrypt returns the passed data", () => {
    const enc = new NullEncryptor();
    expect(enc.encrypt("hello")).toBe("hello");
  });

  it("decrypt returns the passed data", () => {
    const enc = new NullEncryptor();
    expect(enc.decrypt("hello")).toBe("hello");
  });

  it("encrypted? returns false", () => {
    const enc = new NullEncryptor();
    expect(enc.encrypted("hello")).toBe(false);
  });
});
