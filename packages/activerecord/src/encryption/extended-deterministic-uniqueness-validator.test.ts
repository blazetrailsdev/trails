import { describe, it, expect, vi } from "vitest";
import { EncryptedUniquenessValidator } from "./extended-deterministic-uniqueness-validator.js";
import { ExtendedDeterministicQueries } from "./extended-deterministic-queries.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Scheme } from "./scheme.js";
import { isEncryptionDisabled } from "./context.js";
import type { EncryptorLike } from "./encryptor.js";

// Encryptors that produce distinguishable ciphertexts so assertions are meaningful.
const encryptorA: EncryptorLike = {
  encrypt: (v) => `A:${v}`,
  decrypt: (v) => v.replace(/^A:/, ""),
  isEncrypted: (v) => v.startsWith("A:"),
  isBinary: () => false,
};
const encryptorB: EncryptorLike = {
  encrypt: (v) => `B:${v}`,
  decrypt: (v) => v.replace(/^B:/, ""),
  isEncrypted: (v) => v.startsWith("B:"),
  isBinary: () => false,
};

describe("ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidatorTest", () => {
  it("validateEach calls originalValidateEach for current and previous scheme ciphertexts", async () => {
    const prevScheme = new Scheme({ deterministic: true, encryptor: encryptorB });
    const type = new EncryptedAttributeType({
      scheme: new Scheme({
        deterministic: true,
        encryptor: encryptorA,
        previousSchemes: [prevScheme],
      }),
    });

    const klass = {
      _encryptedAttributes: new Set(["email"]),
      _attributeDefinitions: new Map([["email", { type }]]),
    };
    const record = { constructor: klass };

    // The suite boots with ExtendedDeterministicQueries installed (helper.rb:104-107),
    // which suppresses the extra previous-scheme query. Pin it off so this test
    // exercises the un-extended branch it is about.
    const installedSpy = vi
      .spyOn(ExtendedDeterministicQueries, "installed", "get")
      .mockReturnValue(false);

    const calls: Array<{ attribute: string; value: unknown; encryptionDisabled: boolean }> = [];
    const originalValidateEach = (_record: any, attribute: string, value: unknown) => {
      calls.push({ attribute, value, encryptionDisabled: isEncryptionDisabled() });
    };

    await new EncryptedUniquenessValidator().validateEach(
      originalValidateEach,
      record,
      "email",
      "user@example.com",
    );

    // First call: current value (encryption enabled)
    expect(calls[0].value).toBe("user@example.com");
    expect(calls[0].encryptionDisabled).toBe(false);

    // Second call: all previous-scheme ciphertexts as an array (single IN query, encryption disabled)
    expect(calls[1]).toBeDefined();
    expect(calls[1].value).toEqual([type.previousTypes[0].serialize("user@example.com")]);
    expect(calls[1].encryptionDisabled).toBe(true);

    installedSpy.mockRestore();
  });

  it("validateEach skips non-deterministic attributes", async () => {
    const type = new EncryptedAttributeType({
      scheme: new Scheme({ deterministic: false, encryptor: encryptorA }),
    });
    const klass = {
      _encryptedAttributes: new Set(["body"]),
      _attributeDefinitions: new Map([["body", { type }]]),
    };
    const record = { constructor: klass };

    const calls: unknown[] = [];
    const originalValidateEach = (_r: any, _a: string, value: unknown) => calls.push(value);

    await new EncryptedUniquenessValidator().validateEach(
      originalValidateEach,
      record,
      "body",
      "hello",
    );

    expect(calls).toHaveLength(1);
  });
});
