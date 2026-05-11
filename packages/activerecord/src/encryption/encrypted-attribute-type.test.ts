import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BinaryType, BinaryData } from "@blazetrails/activemodel";
import { Serialized } from "../type/serialized.js";
import {
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
} from "./test-helpers.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Scheme } from "./scheme.js";

describe("EncryptedAttributeType#databaseTypeToText — serialized+binary cast type", () => {
  let savedConfig: ReturnType<typeof snapshotEncryptionConfig>;

  beforeEach(() => {
    savedConfig = snapshotEncryptionConfig();
    configureEncryption();
  });

  afterEach(() => {
    restoreEncryptionConfig(savedConfig);
  });

  it("Serialized.isBinary() delegates to subtype.isBinary()", () => {
    expect(new Serialized(new BinaryType(), { load: vi.fn(), dump: vi.fn() }).isBinary()).toBe(
      true,
    );
  });

  it("coder.load is called exactly once during deserialize — not inside databaseTypeToText", () => {
    // Rails: binary_cast_type = cast_type.serialized? ? cast_type.subtype : cast_type
    // In databaseTypeToText we use BinaryType (subtype) to convert BinaryData→Uint8Array→latin1 string.
    // Only after decryption does castType.deserialize run, which calls coder.load exactly once.
    const coder = {
      // coder.load receives Uint8Array from BinaryType.deserialize (the decrypted binary payload).
      load: vi.fn((v: unknown) => {
        const s = v instanceof Uint8Array ? Buffer.from(v).toString() : v;
        return typeof s === "string" ? JSON.parse(s) : s;
      }),
      dump: vi.fn((v: unknown) => JSON.stringify(v)),
    };
    const encType = new EncryptedAttributeType({
      scheme: new Scheme({}),
      castType: new Serialized(new BinaryType(), coder),
    });

    const plaintext = [1, 2, 3];
    const cipherBinary = encType.serialize(plaintext);
    expect(cipherBinary).toBeInstanceOf(BinaryData);

    coder.load.mockClear();
    coder.dump.mockClear();

    const decrypted = encType.deserialize(cipherBinary);
    expect(coder.load).toHaveBeenCalledTimes(1);
    expect(decrypted).toEqual(plaintext);
  });
});
