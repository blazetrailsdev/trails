import { describe, it, expect } from "vitest";
import { NullEncryptor } from "./null-encryptor.js";

describe("ActiveRecord::Encryption::NullEncryptorTest", () => {
  it("encrypt returns the passed data", () => {
    const enc = new NullEncryptor();
    expect(enc.encrypt("Some data")).toBe("Some data");
  });

  it("decrypt returns the passed data", () => {
    const enc = new NullEncryptor();
    expect(enc.decrypt("Some data")).toBe("Some data");
  });

  it("encrypted? returns false", () => {
    const enc = new NullEncryptor();
    expect(enc.isEncrypted("Some data")).toBe(false);
  });

  it("binary? returns false", () => {
    expect(new NullEncryptor().isBinary()).toBe(false);
  });
});
