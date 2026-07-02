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

describe("EncryptedAttributeType#decryptAsText — plaintext-default short-circuit guard", () => {
  // Rails' guard is `@default && @default == value` (encrypted_attribute_type.rb:87),
  // a plain Ruby truthiness check. A falsey column default (`nil`/`false`) is
  // treated as ABSENT and does NOT short-circuit, so the stored value is decrypted.
  function typeWithDefault(defaultValue: unknown) {
    const decrypt = vi.fn((v: unknown) => `decrypted:${String(v)}`);
    const encryptor = {
      encrypt: (v: unknown) => `encrypted:${String(v)}`,
      decrypt,
      isEncrypted: () => true,
      isBinary: () => false,
    };
    const scheme = new Scheme({ encryptor });
    const type = new EncryptedAttributeType({ scheme, default: defaultValue });
    return { type, decrypt };
  }

  it("short-circuits when a truthy default equals the stored value", () => {
    const { type, decrypt } = typeWithDefault("<untitled>");
    expect(type.deserialize("<untitled>")).toBe("<untitled>");
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("does not short-circuit an empty-string default on a non-empty stored value", () => {
    const { type, decrypt } = typeWithDefault("");
    expect(type.deserialize("stored")).toBe("decrypted:stored");
    expect(decrypt).toHaveBeenCalledTimes(1);
  });

  it("does not short-circuit a falsey false default even when it equals the stored value", () => {
    // `false && false == false` is falsey in Ruby, so a `false` default is
    // treated as absent and the value goes down the decrypt path.
    const { type, decrypt } = typeWithDefault(false);
    expect(type.deserialize(false)).toBe("decrypted:false");
    expect(decrypt).toHaveBeenCalledTimes(1);
  });

  it("short-circuits an empty-string default that equals an empty stored value", () => {
    // `"" && "" == ""` → `"" && true` is truthy in Ruby: `""` is a present default.
    const { type, decrypt } = typeWithDefault("");
    expect(type.deserialize("")).toBe("");
    expect(decrypt).not.toHaveBeenCalled();
  });
});

describe("EncryptedAttributeType — delegations to scheme", () => {
  it("delegates key_provider, downcase?, previous_schemes, fixed? to the scheme", () => {
    const keyProvider = { encryptionKeys: () => [], decryptionKeys: () => [] };
    const previous = new Scheme({});
    const scheme = new Scheme({
      keyProvider,
      deterministic: true,
      downcase: true,
      previousSchemes: [previous],
    });
    const type = new EncryptedAttributeType({ scheme });

    expect(type.keyProvider).toBe(scheme.keyProvider);
    expect(type.isDowncase).toBe(scheme.downcase);
    expect(type.previousSchemes).toBe(scheme.previousSchemes);
    expect(type.isFixed()).toBe(scheme.isFixed());
  });

  it("with_context delegates to the scheme's withContext", () => {
    const scheme = new Scheme({});
    const spy = vi.spyOn(scheme, "withContext");
    const type = new EncryptedAttributeType({ scheme });

    const result = type.withContext(() => "value");

    expect(result).toBe("value");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
