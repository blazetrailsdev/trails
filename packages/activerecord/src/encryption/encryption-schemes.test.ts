import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Scheme } from "./scheme.js";
import { Configurable } from "./configurable.js";
import { Decryption as DecryptionError } from "./errors.js";
import type { EncryptorLike } from "./encryptor.js";
import { EncryptableRecord } from "./encryptable-record.js";
import type { SchemeOptions } from "./scheme.js";

class TestEncryptor implements EncryptorLike {
  constructor(private readonly map: Record<string, string>) {}

  encrypt(clearText: string): string {
    return this.map[clearText] ?? clearText;
  }

  decrypt(encryptedText: string): string {
    for (const [clear, cipher] of Object.entries(this.map)) {
      if (cipher === encryptedText) return clear;
    }
    throw new DecryptionError(`Couldn't find a match for ${encryptedText}`);
  }

  isEncrypted(text: string): boolean {
    try {
      this.decrypt(text);
      return true;
    } catch {
      return false;
    }
  }

  isBinary(): boolean {
    return false;
  }
}

function makeType(
  encryptor: EncryptorLike,
  previousSchemes: Scheme[] = [],
): EncryptedAttributeType {
  return new EncryptedAttributeType({ scheme: new Scheme({ encryptor, previousSchemes }) });
}

describe("ActiveRecord::Encryption::EncryptionSchemesTest", () => {
  let savedSupportUnencryptedData: boolean;

  beforeEach(() => {
    savedSupportUnencryptedData = Configurable.config.supportUnencryptedData;
  });

  afterEach(() => {
    Configurable.config.supportUnencryptedData = savedSupportUnencryptedData;
  });

  it.skip("can decrypt encrypted_value encrypted with a different encryption scheme", () => {});
  it.skip("when defining previous encryption schemes, you still get Decryption errors when using invalid clear values", () => {});
  it.skip("use a custom encryptor", () => {});
  it.skip("support previous contexts", () => {});

  it("use global previous schemes to decrypt data encrypted with previous schemes", () => {
    Configurable.config.supportUnencryptedData = false;

    const prev1Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy1: "legacy_cipher_1" }),
    });
    const prev2Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy2: "legacy_cipher_2" }),
    });
    const type = makeType(new TestEncryptor({ current: "current_cipher" }), [
      prev1Scheme,
      prev2Scheme,
    ]);

    expect(type.previousTypes).toHaveLength(2);
    const [previousType1, previousType2] = type.previousTypes;

    // primary cannot decrypt legacy ciphertexts — falls back to previousType1
    const ciphertext1 = previousType1.serialize("legacy1") as string;
    expect(type.deserialize(ciphertext1)).toBe("legacy1");

    // primary and previousType1 cannot decrypt — falls back to previousType2
    const ciphertext2 = previousType2.serialize("legacy2") as string;
    expect(type.deserialize(ciphertext2)).toBe("legacy2");
  });

  it("use global previous schemes to decrypt data encrypted with previous schemes with unencrypted data", () => {
    Configurable.config.supportUnencryptedData = true;

    const prev1Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy1: "legacy_cipher_1" }),
    });
    const prev2Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy2: "legacy_cipher_2" }),
    });
    const type = makeType(new TestEncryptor({ current: "current_cipher" }), [
      prev1Scheme,
      prev2Scheme,
    ]);

    // clean-text scheme is appended when supportUnencryptedData → 3 total
    expect(type.previousTypes).toHaveLength(3);
    const [previousType1, previousType2] = type.previousTypes;

    const ciphertext1 = previousType1.serialize("legacy1") as string;
    expect(type.deserialize(ciphertext1)).toBe("legacy1");

    const ciphertext2 = previousType2.serialize("legacy2") as string;
    expect(type.deserialize(ciphertext2)).toBe("legacy2");
  });

  it("returns ciphertext all the previous schemes fail to decrypt and support for unencrypted data is on", () => {
    Configurable.config.supportUnencryptedData = true;

    const prev1Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy1: "legacy_cipher_1" }),
    });
    const prev2Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy2: "legacy_cipher_2" }),
    });
    const type = makeType(new TestEncryptor({ current: "current_cipher" }), [
      prev1Scheme,
      prev2Scheme,
    ]);

    expect(type.deserialize("some ciphertext")).toBe("some ciphertext");
  });

  it("raise decryption error when all the previous schemes fail to decrypt", () => {
    Configurable.config.supportUnencryptedData = false;

    const prev1Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy1: "legacy_cipher_1" }),
    });
    const prev2Scheme = new Scheme({
      encryptor: new TestEncryptor({ legacy2: "legacy_cipher_2" }),
    });
    const type = makeType(new TestEncryptor({ current: "current_cipher" }), [
      prev1Scheme,
      prev2Scheme,
    ]);

    expect(() => type.deserialize("some invalid ciphertext")).toThrow(DecryptionError);
  });

  it.skip("deterministic encryption is fixed by default: it will always use the oldest scheme to encrypt data", () => {});
  it.skip("don't use global previous schemes with a different deterministic nature", () => {});
  it.skip("deterministic encryption will use the newest encryption scheme to encrypt data when setting it to { fixed: false }", () => {});
  it.skip("use global previous schemes when performing queries", () => {});
  it.skip("don't use global previous schemes with a different deterministic nature when performing queries", () => {});
});

describe("global previous schemes wiring — config.previous → EncryptableRecord.encrypts", () => {
  let savedSupportUnencryptedData: boolean;
  let savedPreviousSchemes: typeof Configurable.config.previousSchemes;

  beforeEach(() => {
    savedSupportUnencryptedData = Configurable.config.supportUnencryptedData;
    savedPreviousSchemes = [...Configurable.config.previousSchemes];
    Configurable.config.previousSchemes = [];
  });

  afterEach(() => {
    Configurable.config.supportUnencryptedData = savedSupportUnencryptedData;
    Configurable.config.previousSchemes = savedPreviousSchemes;
  });

  it("config.previous schemes are merged into the attribute type's previousTypes", () => {
    Configurable.config.supportUnencryptedData = false;
    Configurable.config.previous = [
      { encryptor: new TestEncryptor({ legacy1: "legacy_cipher_1" }) } as SchemeOptions,
      { encryptor: new TestEncryptor({ legacy2: "legacy_cipher_2" }) } as SchemeOptions,
    ];

    const modelClass = { _attributeDefinitions: new Map() };
    EncryptableRecord.encrypts(modelClass, "name", {
      encryptor: new TestEncryptor({ current: "current_cipher" }),
    });

    const type = modelClass._attributeDefinitions.get("name")?.type as EncryptedAttributeType;
    expect(type.previousTypes).toHaveLength(2);

    // value encrypted with first global previous scheme decrypts correctly
    const ciphertext1 = type.previousTypes[0].serialize("legacy1") as string;
    expect(type.deserialize(ciphertext1)).toBe("legacy1");

    // value encrypted with second global previous scheme decrypts correctly
    const ciphertext2 = type.previousTypes[1].serialize("legacy2") as string;
    expect(type.deserialize(ciphertext2)).toBe("legacy2");
  });

  it("only compatible global previous schemes are applied (matching deterministic nature)", () => {
    Configurable.config.supportUnencryptedData = false;
    Configurable.config.previous = [
      {
        encryptor: new TestEncryptor({ legacy_det: "cipher_det" }),
        deterministic: true,
      } as SchemeOptions,
      { encryptor: new TestEncryptor({ legacy_non: "cipher_non" }) } as SchemeOptions,
    ];

    const modelClass = { _attributeDefinitions: new Map() };
    EncryptableRecord.encrypts(modelClass, "name", {
      encryptor: new TestEncryptor({ current: "current_cipher" }),
    });

    const type = modelClass._attributeDefinitions.get("name")?.type as EncryptedAttributeType;
    // non-deterministic attribute: only the non-deterministic global scheme is compatible
    expect(type.previousTypes).toHaveLength(1);
    expect(type.deserialize("cipher_non")).toBe("legacy_non");
  });
});
