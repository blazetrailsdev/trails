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
import { Configurable } from "./configurable.js";
import { Decryption } from "./errors.js";

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
    const coder = {
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
    const payloadLoads = coder.load.mock.calls.filter(([v]) => v !== null);
    expect(payloadLoads).toHaveLength(1);
    expect(decrypted).toEqual(plaintext);
  });
});

describe("EncryptedAttributeType#decryptAsText — plaintext-default short-circuit guard", () => {
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
    const { type, decrypt } = typeWithDefault(false);
    expect(type.deserialize(false)).toBe("decrypted:false");
    expect(decrypt).toHaveBeenCalledTimes(1);
  });

  it("short-circuits an empty-string default that equals an empty stored value", () => {
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

describe("EncryptedAttributeType#supportUnencryptedData — global config conjunct", () => {
  let savedConfig: ReturnType<typeof snapshotEncryptionConfig>;

  beforeEach(() => {
    savedConfig = snapshotEncryptionConfig();
    configureEncryption({ supportUnencryptedData: false });
  });

  afterEach(() => {
    restoreEncryptionConfig(savedConfig);
  });

  it("an attribute-level opt-in does not survive a global opt-out", () => {
    const scheme = new Scheme({ supportUnencryptedData: true });
    expect(scheme.isSupportUnencryptedData()).toBe(true);
    expect(new EncryptedAttributeType({ scheme }).supportUnencryptedData).toBe(false);
  });

  it("re-raises a Decryption error instead of returning the ciphertext as clear text", () => {
    const type = new EncryptedAttributeType({
      scheme: new Scheme({ supportUnencryptedData: true }),
    });

    expect(() => type.deserialize("not a valid ciphertext")).toThrow(Decryption);
  });

  it("is true when both the global config and the scheme allow it", () => {
    Configurable.config.supportUnencryptedData = true;
    const type = new EncryptedAttributeType({
      scheme: new Scheme({ supportUnencryptedData: true }),
    });

    expect(type.supportUnencryptedData).toBe(true);
    expect(type.deserialize("not a valid ciphertext")).toBe("not a valid ciphertext");
  });

  it("is false for a previous type even when everything else allows it", () => {
    Configurable.config.supportUnencryptedData = true;
    const type = new EncryptedAttributeType({
      scheme: new Scheme({ supportUnencryptedData: true }),
      previousType: true,
    });

    expect(type.supportUnencryptedData).toBe(false);
  });
});
