import { describe, it, expect } from "vitest";
import { EncryptedUniquenessValidator } from "./extended-deterministic-uniqueness-validator.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Scheme } from "./scheme.js";
import { Encryption } from "../encryption.js";
import { NullEncryptor } from "./null-encryptor.js";
import type { EncryptorLike } from "./encryptor.js";
import { deterministicEncryptedAttributes } from "./encryptable-record.js";
import { type Module } from "@blazetrails/ruby-compat";
import { prepend } from "@blazetrails/ruby-compat/include";

function prependedOver(
  mod: Module,
  name: string,
  original: (...args: any[]) => unknown,
  props: object = {},
): any {
  class Host {}
  Object.defineProperty(Host.prototype, name, { value: original, configurable: true });
  prepend(Host, mod);
  return Object.assign(new Host(), props);
}

const encryptorA: EncryptorLike = {
  encrypt: (v) => `A:${v}`,
  decrypt: (v) => (v as string).replace(/^A:/, ""),
  isEncrypted: (v) => (v as string).startsWith("A:"),
  isBinary: () => false,
};
const encryptorB: EncryptorLike = {
  encrypt: (v) => `B:${v}`,
  decrypt: (v) => (v as string).replace(/^B:/, ""),
  isEncrypted: (v) => (v as string).startsWith("B:"),
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
      encryptedAttributes: new Set(["email"]),
      typeForAttribute: () => type,
      deterministicEncryptedAttributes,
    };
    const record = { constructor: klass };

    const calls: Array<{ attribute: string; value: unknown; encryptionDisabled: boolean }> = [];
    const originalValidateEach = (_record: any, attribute: string, value: unknown) => {
      calls.push({
        attribute,
        value,
        encryptionDisabled: Encryption.context.encryptor instanceof NullEncryptor,
      });
    };

    await prependedOver(
      EncryptedUniquenessValidator,
      "validateEach",
      originalValidateEach,
    ).validateEach(record, "email", "user@example.com");

    expect(calls[0].value).toBe("user@example.com");
    expect(calls[0].encryptionDisabled).toBe(false);

    expect(calls[1]).toBeDefined();
    expect(calls[1].value).toBe(type.previousTypes[0].serialize("user@example.com"));
    expect(calls[1].encryptionDisabled).toBe(true);
  });

  it("validateEach skips non-deterministic attributes", async () => {
    const type = new EncryptedAttributeType({
      scheme: new Scheme({ deterministic: false, encryptor: encryptorA }),
    });
    const klass = {
      encryptedAttributes: new Set(["body"]),
      typeForAttribute: () => type,
      deterministicEncryptedAttributes,
    };
    const record = { constructor: klass };

    const calls: unknown[] = [];
    const originalValidateEach = (_r: any, _a: string, value: unknown) => calls.push(value);

    await prependedOver(
      EncryptedUniquenessValidator,
      "validateEach",
      originalValidateEach,
    ).validateEach(record, "body", "hello");

    expect(calls).toHaveLength(1);
  });
});
