import { describe, it, expect } from "vitest";
import { EncryptedFixtures } from "./encrypted-fixtures.js";
import { Scheme } from "./scheme.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import type { EncryptorLike } from "./encryptor.js";

// Encryptor that produces a distinguishable ciphertext for test assertions.
const prefixEncryptor: EncryptorLike = {
  encrypt: (v) => `enc:${v}`,
  decrypt: (v) => v.replace(/^enc:/, ""),
  isEncrypted: (v) => v.startsWith("enc:"),
  isBinary: () => false,
};

function makeType(): EncryptedAttributeType {
  return new EncryptedAttributeType({ scheme: new Scheme({ encryptor: prefixEncryptor }) });
}

describe("ActiveRecord::Encryption::EncryptableFixtureTest", () => {
  it("fixtures get encrypted automatically", () => {
    const type = makeType();
    const modelClass = {
      _encryptedAttributes: new Set(["email"]),
      _attributeDefinitions: new Map([["email", { type }]]),
    };
    const ef = new EncryptedFixtures({ email: "user@example.com", name: "Alice" }, modelClass);
    expect(ef.fixture.email).toBe("enc:user@example.com");
    expect(ef.fixture.name).toBe("Alice");
  });

  it("preserved columns due to ignore_case: true gets encrypted automatically", () => {
    const type = makeType();
    const modelClass = {
      _encryptedAttributes: new Set(["email", "original_email"]),
      _attributeDefinitions: new Map([
        ["email", { type }],
        ["original_email", { type }],
      ]),
    };
    const ef = new EncryptedFixtures(
      { email: "user@example.com", original_email: "user@example.com" },
      modelClass,
    );
    expect(ef.fixture.email).toBe("enc:user@example.com");
    expect(ef.fixture.original_email).toBe("enc:user@example.com");
  });
});
