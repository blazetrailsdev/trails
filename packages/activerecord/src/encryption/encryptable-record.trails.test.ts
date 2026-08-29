import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  freshAdapter,
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
} from "./test-helpers.js";
import { Configurable } from "./configurable.js";
import { fixtures } from "../test-fixtures.js";
import {
  EncryptedBookWithSerializedFirstBinary,
  EncryptedBookWithSerializedSecondBinary,
  EncryptedBookWithSerializedDeterministicName,
  EncryptedBook,
  UnencryptedBook,
} from "../test-helpers/models/book-encrypted.js";
import { deterministicEncryptedAttributes } from "./encryptable-record.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { applyPendingEncryptions } from "../encryption.js";
import { Serialized } from "../type/serialized.js";
import { Base } from "../base.js";
import { LengthValidator } from "@blazetrails/activemodel";
import { BinaryType } from "@blazetrails/activemodel";

describe("ActiveRecord::Encryption::EncryptableRecordTest (trails)", () => {
  fixtures({});

  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    Configurable.config.previousSchemes = [];
    configureEncryption();
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it("adds the encrypted column's length validation at schema load", async () => {
    await freshAdapter();
    Configurable.config.validateColumnSize = true;

    class EncryptedBookValidatingColumnSize extends Base {
      static _tableName = "encrypted_books";
      static {
        this.encrypts("name", { deterministic: true });
      }
    }

    const validatorsFor = (name: string): unknown[] =>
      (
        EncryptedBookValidatingColumnSize as unknown as { _validators?: Map<string, unknown[]> }
      )._validators?.get(name) ?? [];

    expect(validatorsFor("name").some((v) => v instanceof LengthValidator)).toBe(false);

    await EncryptedBookValidatingColumnSize.loadSchema();

    expect(
      validatorsFor("name").some(
        (v) =>
          v instanceof LengthValidator &&
          (v as { options?: { maximum?: number } }).options?.maximum === 1024,
      ),
    ).toBe(true);
  });

  it("resolves logo to Encrypted(Serialized(binary)) — serialize before encrypts", async () => {
    await freshAdapter();

    const encrypted = EncryptedBookWithSerializedFirstBinary.typeForAttribute("logo");
    expect(encrypted).toBeInstanceOf(EncryptedAttributeType);

    const serialized = (encrypted as EncryptedAttributeType).castType;
    expect(serialized).toBeInstanceOf(Serialized);

    const subtype = (serialized as Serialized).subtype;
    expect(subtype).toBeInstanceOf(BinaryType);
    expect(subtype).not.toBeInstanceOf(EncryptedAttributeType);
  });

  it("resolves logo to Serialized(Encrypted(binary)) — encrypts before serialize", async () => {
    await freshAdapter();

    const serialized = EncryptedBookWithSerializedSecondBinary.typeForAttribute("logo");
    expect(serialized).toBeInstanceOf(Serialized);

    const encrypted = (serialized as Serialized).subtype;
    expect(encrypted).toBeInstanceOf(EncryptedAttributeType);

    const subtype = (encrypted as EncryptedAttributeType).castType;
    expect(subtype).toBeInstanceOf(BinaryType);
    expect(subtype).not.toBeInstanceOf(Serialized);
  });

  it("does not grow the pending-decorator queue or reorder the nesting on _defaultAttributes rebuilds", async () => {
    await freshAdapter();

    const model = EncryptedBookWithSerializedSecondBinary as unknown as {
      typeForAttribute(name: string): unknown;
      _pendingAttributeModifications?: unknown[];
      _cachedDefaultAttributes?: unknown;
    };
    model.typeForAttribute("logo");
    const queueLength = model._pendingAttributeModifications?.length;
    expect(queueLength).toBeGreaterThan(0);

    for (let i = 0; i < 3; i++) {
      model._cachedDefaultAttributes = null;
      applyPendingEncryptions(model);
      const type = model.typeForAttribute("logo");
      expect(type).toBeInstanceOf(Serialized);
      expect((type as Serialized).subtype).toBeInstanceOf(EncryptedAttributeType);
    }
    expect(model._pendingAttributeModifications?.length).toBe(queueLength);
  });

  it("includes a Serialized(Encrypted) attribute in deterministicEncryptedAttributes", async () => {
    await freshAdapter();

    const deterministic = deterministicEncryptedAttributes.call(
      EncryptedBookWithSerializedDeterministicName,
    );
    expect(deterministic.has("name")).toBe(true);
    expect(
      deterministicEncryptedAttributes.call(EncryptedBookWithSerializedSecondBinary).has("logo"),
    ).toBe(false);
  });

  it("detects ciphertext through the Serialized(Encrypted) wrapper on encryptedAttribute?", async () => {
    await freshAdapter();

    const book = await EncryptedBookWithSerializedDeterministicName.create({ name: "Dune" });

    const reloaded = await EncryptedBookWithSerializedDeterministicName.find(book.id);
    expect(reloaded.name).toBe("Dune");
    expect(reloaded.encryptedAttribute("name")).toBe(true);
  });
});

describe("ActiveRecord::Encryption::EncryptableRecord.encrypted_attributes? (trails)", () => {
  it("is true once a model has declared an encrypted attribute", () => {
    expect(EncryptedBook.isEncryptedAttributes).toBe(true);
  });

  it("is false for a model that never assigned the class_attribute", () => {
    expect(UnencryptedBook.isEncryptedAttributes).toBe(false);
  });
});
