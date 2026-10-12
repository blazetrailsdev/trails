import { describe, it, expect } from "vitest";
import { ReadOnlyNullEncryptor } from "./read-only-null-encryptor.js";

describe("ActiveRecord::Encryption::ReadOnlyNullEncryptorTest (trails)", () => {
  it("encrypted? returns false", () => {
    expect(new ReadOnlyNullEncryptor().isEncrypted("some text")).toBe(false);
  });

  it("binary? returns false", () => {
    expect(new ReadOnlyNullEncryptor().isBinary()).toBe(false);
  });
});
