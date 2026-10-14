import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Decryption } from "./errors.js";
import { rbInspect } from "@blazetrails/ruby-compat";
import type { EncryptorLike } from "./encryptor.js";
import { encrypts } from "./encryptable-record.js";
import type { SchemeOptions } from "./scheme.js";
import { Base } from "../index.js";
import { Encryption } from "./test-helpers.js";
import { fixtures } from "../test-helpers/use-fixtures.js";

fixtures([]);

class TestEncryptor implements EncryptorLike {
  private ciphertextsByClearValue: Record<string, string>;

  constructor(ciphertextsByClearValue: Record<string, string>) {
    this.ciphertextsByClearValue = ciphertextsByClearValue;
  }

  encrypt(
    clearText: string,
    {
      keyProvider = null,
      cipherOptions = {},
    }: { keyProvider?: unknown; cipherOptions?: object } = {},
  ): string {
    return this.ciphertextsByClearValue[clearText] ?? clearText;
  }

  decrypt(
    encryptedText: string,
    {
      keyProvider = null,
      cipherOptions = {},
    }: { keyProvider?: unknown; cipherOptions?: object } = {},
  ): string {
    for (const [clearValue, encryptedValue] of Object.entries(this.ciphertextsByClearValue)) {
      if (encryptedValue === encryptedText) return clearValue;
    }
    throw new Decryption(
      `Couldn't find a match for ${encryptedText} (${rbInspect(this.ciphertextsByClearValue)})`,
    );
  }

  isEncrypted(text: string): boolean {
    try {
      this.decrypt(text);
      return true;
    } catch (error) {
      if (error instanceof Decryption) return false;
      throw error;
    }
  }

  isBinary(): boolean {
    return false;
  }
}

describe("global previous schemes wiring — config.previous → EncryptableRecord.encrypts", () => {
  let savedSupportUnencryptedData: boolean;
  let savedPreviousSchemes: typeof Encryption.config.previousSchemes;

  beforeEach(() => {
    savedSupportUnencryptedData = Encryption.config.supportUnencryptedData;
    savedPreviousSchemes = [...Encryption.config.previousSchemes];
    Encryption.config.previousSchemes = [];
  });

  afterEach(() => {
    Encryption.config.supportUnencryptedData = savedSupportUnencryptedData;
    Encryption.config.previousSchemes = savedPreviousSchemes;
  });

  it("config.previous schemes are merged into the attribute type's previousTypes", async () => {
    Encryption.config.supportUnencryptedData = false;
    Encryption.config.previous = [
      { encryptor: new TestEncryptor({ legacy1: "legacy_cipher_1" }) } as SchemeOptions,
      { encryptor: new TestEncryptor({ legacy2: "legacy_cipher_2" }) } as SchemeOptions,
    ];

    const modelClass = class extends Base {
      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    };
    encrypts.call(modelClass, "name", {
      encryptor: new TestEncryptor({ current: "current_cipher" }),
    });

    const type = modelClass.typeForAttribute("name") as unknown as EncryptedAttributeType;
    expect(type.previousTypes).toHaveLength(2);

    const ciphertext1 = type.previousTypes[0].serialize("legacy1") as string;
    expect(type.deserialize(ciphertext1)).toBe("legacy1");

    const ciphertext2 = type.previousTypes[1].serialize("legacy2") as string;
    expect(type.deserialize(ciphertext2)).toBe("legacy2");
  });

  it("only compatible global previous schemes are applied (matching deterministic nature)", async () => {
    Encryption.config.supportUnencryptedData = false;
    Encryption.config.previous = [
      {
        encryptor: new TestEncryptor({ legacy_det: "cipher_det" }),
        deterministic: true,
      } as SchemeOptions,
      { encryptor: new TestEncryptor({ legacy_non: "cipher_non" }) } as SchemeOptions,
    ];

    const modelClass = class extends Base {
      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    };
    encrypts.call(modelClass, "name", {
      encryptor: new TestEncryptor({ current: "current_cipher" }),
    });

    const type = modelClass.typeForAttribute("name") as unknown as EncryptedAttributeType;
    expect(type.previousTypes).toHaveLength(1);
    expect(type.deserialize("cipher_non")).toBe("legacy_non");
  });
});
