import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  freshAdapter,
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
} from "./test-helpers.js";
import { Configurable } from "./configurable.js";
import { fixtures } from "../test-helpers/fixtures.js";
import {
  EncryptedBookWithSerializedFirstBinary,
  EncryptedBookWithSerializedSecondBinary,
  EncryptedBookWithSerializedDeterministicName,
} from "../test-helpers/models/book-encrypted.js";
import { EncryptableRecord } from "./encryptable-record.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { applyPendingEncryptions } from "../encryption.js";
import { Serialized } from "../type/serialized.js";
import { BinaryType } from "@blazetrails/activemodel";

/**
 * TS-only extras for EncryptableRecord. Rails has no equivalent test: its
 * `serialized binary data can be encrypted` asserts only the round-trip, which
 * a doubly-wrapped type can still satisfy for some coders. trails eagerly bakes
 * decorations into `_attributeDefinitions[name].type` (a back-compat
 * convenience Rails lacks), so seeding `_defaultAttributes` from that decorated
 * type silently double-applied every decorator that also lives in the pending
 * queue. These assert the resolved chain directly so a re-introduced wrapper
 * fails loudly rather than round-tripping by accident.
 */
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

  // Rails replays pending decorators in declaration order
  // (activemodel/lib/active_model/attribute_registration.rb:66-72) over a seed
  // built from `type_for_column`, so `serialize` + `encrypts` nest in the order
  // they were declared: serialize-then-encrypts →
  // EncryptedAttributeType(Serialized(binary)), encrypts-then-serialize →
  // Serialized(EncryptedAttributeType(binary)). Each decorator applies exactly
  // once (the seed carries no EncryptedAttributeType).
  it("resolves logo to Encrypted(Serialized(binary)) — serialize before encrypts", async () => {
    await freshAdapter();

    const encrypted = EncryptedBookWithSerializedFirstBinary.typeForAttribute("logo");
    expect(encrypted).toBeInstanceOf(EncryptedAttributeType);

    const serialized = (encrypted as EncryptedAttributeType).castType;
    expect(serialized).toBeInstanceOf(Serialized);

    // The exact defect this guards: the seed used to carry an
    // EncryptedAttributeType, yielding Encrypted(Serialized(Encrypted(Binary))).
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

    // Declaration-order replay: the encryption decorator was pushed at
    // `encrypts` time, before `serialize`'s — a rebuild-time re-push would land
    // it after and flip the nesting back to Encrypted(Serialized(binary)).
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
    // Force one initial resolution so all pending machinery has run.
    model.typeForAttribute("logo");
    const queueLength = model._pendingAttributeModifications?.length;
    expect(queueLength).toBeGreaterThan(0);

    // Repeated cache invalidation + re-resolution mimics schema reloads. The
    // old registerEncryptedType pushed a fresh PendingDecorator on each pass,
    // growing the queue unboundedly AND moving the encryption decorator to the
    // tail (flipping the nesting to Encrypted(Serialized(...))).
    for (let i = 0; i < 3; i++) {
      model._cachedDefaultAttributes = null;
      // The rebuild paths (defineAttribute, applyColumnsHash, Base statics)
      // all re-invoke applyPendingEncryptions — the exact call that used to
      // re-push the encryption decorator onto the queue tail.
      applyPendingEncryptions(model);
      const type = model.typeForAttribute("logo");
      expect(type).toBeInstanceOf(Serialized);
      expect((type as Serialized).subtype).toBeInstanceOf(EncryptedAttributeType);
    }
    expect(model._pendingAttributeModifications?.length).toBe(queueLength);
  });

  it("includes a Serialized(Encrypted) attribute in deterministicEncryptedAttributes", async () => {
    await freshAdapter();

    const deterministic = EncryptableRecord.deterministicEncryptedAttributes(
      EncryptedBookWithSerializedDeterministicName,
    );
    expect(deterministic.has("name")).toBe(true);
    expect(
      EncryptableRecord.deterministicEncryptedAttributes(
        EncryptedBookWithSerializedSecondBinary,
      ).has("logo"),
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
