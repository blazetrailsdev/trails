import { describe, it, expect } from "vitest";
import { EncryptingOnlyEncryptor } from "./encrypting-only-encryptor.js";
import { Encryptor } from "./encryptor.js";

describe("ActiveRecord::Encryption::EncryptingOnlyEncryptorTest (trails)", () => {
  it("extends Encryptor", () => {
    expect(EncryptingOnlyEncryptor.prototype instanceof Encryptor).toBe(true);
  });
});
