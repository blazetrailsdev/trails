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
} from "../test-helpers/models/book-encrypted.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
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
});
