import { describe, it, expect } from "vitest";
import { EncryptingOnlyEncryptor } from "../../../lib/encryption/encrypting-only-encryptor.js";
import { Encryptor } from "../../../lib/encryption/encryptor.js";

describe("ActiveRecord::Encryption::EncryptingOnlyEncryptorTest (trails)", () => {
  it("extends Encryptor", () => {
    expect(EncryptingOnlyEncryptor.prototype instanceof Encryptor).toBe(true);
  });
});
