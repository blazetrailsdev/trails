import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fixtures } from "../test-helpers/fixtures.js";
import { ExtendedDeterministicQueries, AdditionalValue } from "./extended-deterministic-queries.js";
import { NoMethodError } from "@blazetrails/activemodel";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Scheme } from "./scheme.js";
import { Configurable } from "./configurable.js";
import { installExtendedQueriesIfConfigured } from "./install.js";
import {
  ExtendedDeterministicUniquenessValidator,
  EncryptedUniquenessValidator,
} from "./extended-deterministic-uniqueness-validator.js";
import { UniquenessValidator } from "../validations.js";
import { getAttributeType, encryptedTypeOf } from "./encryptable-record.js";
// Side-effect: registers encryptionHooks so Base.encrypts() is wired up.
import "../encryption.js";
import { Base } from "../base.js";
import { Relation } from "../relation.js";

fixtures([], { useTransactionalTests: false });

// 32 bytes (base64-encoded) for AES-256-GCM, matching the port suite's key.
const TEST_KEY = Buffer.alloc(32, "x").toString("base64");
const PREVIOUS_KEY = Buffer.alloc(32, "y").toString("base64");

/**
 * TS-only guard (Rails has no direct test): a deterministic
 * Serialized(Encrypted(...)) attribute — `encrypts` then `serialize`, so the
 * coder dumps BEFORE encryption — must be queryable by plaintext value.
 * Query expansion has to serialize candidates through the FULL resolved type
 * (Rails' `owner.type_for_attribute(name)` delegation,
 * extended_deterministic_queries.rb:58-62), not the bare inner
 * EncryptedAttributeType, or the expansion ciphertext diverges from the
 * write path and the lookup silently misses.
 */
function buildSerializedBook({ previousSchemes = false } = {}) {
  class EncryptedSerializedBook extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      // supportUnencryptedData: false removes the raw-plaintext candidate
      // from the expansion, so the lookup can only succeed through a
      // correctly-serialized ciphertext candidate. A previous scheme makes
      // `previousTypes` non-empty so query expansion actually runs — but in
      // Rails that combination RAISES (see the raise test below), so the
      // lookup tests use the no-previous-schemes variant.
      this.encrypts("name", {
        deterministic: true,
        key: TEST_KEY,
        supportUnencryptedData: false,
        ...(previousSchemes
          ? { previousSchemes: [new Scheme({ deterministic: true, key: PREVIOUS_KEY })] }
          : {}),
      });
      this.serialize("name", { coder: "json" });
    }
  }
  return EncryptedSerializedBook;
}

describe("ActiveRecord::Encryption::ExtendedDeterministicQueriesTest (trails extras)", () => {
  let EncryptedSerializedBook: ReturnType<typeof buildSerializedBook>;
  let PreviousSchemeSerializedBook: ReturnType<typeof buildSerializedBook>;

  const savedConfig = {
    extendQueries: Configurable.config.extendQueries,
    supportUnencryptedData: Configurable.config.supportUnencryptedData,
    keyDerivationSalt: Configurable.config.keyDerivationSalt,
    primaryKey: Configurable.config.primaryKey,
    deterministicKey: Configurable.config.deterministicKey,
  };
  const relProto = Relation.prototype as unknown as Record<string, unknown>;
  const baseStatics = Base as unknown as Record<string, unknown>;
  const savedMethods: Record<string, unknown> = {};

  beforeAll(async () => {
    Configurable.config.extendQueries = true;
    Configurable.config.supportUnencryptedData = true;
    Configurable.config.keyDerivationSalt = "test-salt";
    Configurable.config.primaryKey = "test-primary-key";
    Configurable.config.deterministicKey = "test-deterministic-key";

    savedMethods.where = relProto.where;
    savedMethods.exists = relProto.exists;
    savedMethods.scopeForCreate = relProto.scopeForCreate;
    savedMethods.findBy = baseStatics.findBy;
    savedMethods.serialize = EncryptedAttributeType.prototype.serialize;

    installExtendedQueriesIfConfigured();

    EncryptedSerializedBook = buildSerializedBook();
    PreviousSchemeSerializedBook = buildSerializedBook({ previousSchemes: true });
    // Warm the books table once so the first create doesn't race the
    // test-adapter's schema-recovery path (see the port suite's note).
    await EncryptedSerializedBook.where("1=1");
  });

  fixtures([]);

  afterAll(() => {
    relProto.where = savedMethods.where;
    relProto.exists = savedMethods.exists;
    relProto.scopeForCreate = savedMethods.scopeForCreate;
    baseStatics.findBy = savedMethods.findBy;
    EncryptedAttributeType.prototype.serialize =
      savedMethods.serialize as typeof EncryptedAttributeType.prototype.serialize;
    (ExtendedDeterministicQueries as unknown as Record<string, unknown>)._installed = false;
    ExtendedDeterministicUniquenessValidator.resetSupport(UniquenessValidator);

    Configurable.config.extendQueries = savedConfig.extendQueries;
    Configurable.config.supportUnencryptedData = savedConfig.supportUnencryptedData;
    Configurable.config.keyDerivationSalt = savedConfig.keyDerivationSalt;
    Configurable.config.primaryKey = savedConfig.primaryKey;
    Configurable.config.deterministicKey = savedConfig.deterministicKey;
  });

  it("finds records by plaintext when a deterministic attribute is serialized after encryption", async () => {
    await EncryptedSerializedBook.create({ name: "Dune" });
    expect(await EncryptedSerializedBook.findBy({ name: "Dune" })).not.toBeNull();
    expect(await EncryptedSerializedBook.where("id > 0").findBy({ name: "Dune" })).not.toBeNull();
    expect(await EncryptedSerializedBook.exists({ name: "Dune" })).toBe(true);
  });

  // Rails-verified (vendored Rails 8.1, sqlite3, extend_queries installed):
  // a deterministic Serialized(Encrypted) attribute WITH previous schemes
  // raises NoMethodError on any plaintext lookup — the expansion's
  // AdditionalValue reaches Type::Serialized#serialize, the JSON coder's
  // as_json traversal descends into the AV's @type (a bare previous-scheme
  // EncryptedAttributeType), and ActiveModel::Type::Value#as_json raises
  // (value.rb:145). No SQL is generated, so no scheme/key material can land
  // in a bind. Our Type#toJSON mirrors that raise for JSON.stringify.
  it("raises NoMethodError when a previous-scheme candidate reaches the serialized coder", async () => {
    await expect(PreviousSchemeSerializedBook.findBy({ name: "Dune" })).rejects.toThrow(
      NoMethodError,
    );
    await expect(PreviousSchemeSerializedBook.where({ name: "Dune" }).first()).rejects.toThrow(
      NoMethodError,
    );

    // The mechanism, pinned directly: Serialized#serialize(AV) raises inside
    // coder.dump before any payload exists — the dumped-AV JSON (which would
    // embed previous-scheme internals) is never produced.
    const fullType = getAttributeType(PreviousSchemeSerializedBook, "name") as {
      serialize(v: unknown): unknown;
    };
    const prevType = encryptedTypeOf(getAttributeType(PreviousSchemeSerializedBook, "name"))!
      .previousTypes[0];
    const av = new AdditionalValue("Dune", prevType);
    expect(() => fullType.serialize(av)).toThrow(NoMethodError);
  });

  it("uniqueness ciphertext generation serializes through the full resolved type", () => {
    const fullType = getAttributeType(PreviousSchemeSerializedBook, "name") as {
      serialize(v: unknown): unknown;
    };
    // The resolved type is the outer Serialized wrapper, not the bare
    // EncryptedAttributeType — the delegation the expansion must honor.
    expect(fullType).not.toBeInstanceOf(EncryptedAttributeType);

    const candidates = EncryptedUniquenessValidator.allCiphertextsFor(
      PreviousSchemeSerializedBook,
      "name",
      "Dune",
    );
    // Rails shape: raw plaintext first, AdditionalValues only for previous
    // schemes.
    expect(candidates[0]).toBe("Dune");
    expect(candidates.length).toBeGreaterThan(1);
    // The type the PredicateBuilder serializes IN-list scalars through
    // (HomogeneousIn#castedValues → attribute typeCaster) must be the full
    // resolved type, so the raw candidate encrypts to the write-path
    // ciphertext (coder dump applied before encryption).
    const arelAttr = (
      PreviousSchemeSerializedBook as unknown as {
        arelTable: { get(name: string): { typeCaster: unknown } };
      }
    ).arelTable.get("name");
    const caster = arelAttr.typeCaster as { serialize(v: unknown): unknown };
    expect(caster.serialize("Dune")).toEqual(fullType.serialize("Dune"));
  });
});
