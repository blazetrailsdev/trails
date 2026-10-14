import { describe, it, expect } from "vitest";
import { NullEncryptor } from "./null-encryptor.js";

describe("ActiveRecord::Encryption::NullEncryptorTest (trails)", () => {
  it("binary? returns false", () => {
    expect(new NullEncryptor().isBinary()).toBe(false);
  });
});
