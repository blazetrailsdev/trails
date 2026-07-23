import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fixtures } from "../test-helpers/fixtures.js";
import { ExtendedDeterministicQueries } from "./extended-deterministic-queries.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Scheme } from "./scheme.js";
import { Configurable } from "./configurable.js";
import { installExtendedQueriesIfConfigured } from "./install.js";
import { ExtendedDeterministicUniquenessValidator } from "./extended-deterministic-uniqueness-validator.js";
import { EncryptedUniquenessValidator } from "./extended-deterministic-uniqueness-validator.js";
import { UniquenessValidator } from "../validations.js";
import { getAttributeType } from "./encryptable-record.js";
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
function buildSerializedBook() {
  class EncryptedSerializedBook extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      // supportUnencryptedData: false removes the raw-plaintext candidate
      // from the expansion, so the lookup can only succeed through a
      // correctly-serialized ciphertext candidate; the previous scheme keeps
      // `previousTypes` non-empty so expansion actually runs.
      this.encrypts("name", {
        deterministic: true,
        key: TEST_KEY,
        supportUnencryptedData: false,
        previousSchemes: [new Scheme({ deterministic: true, key: PREVIOUS_KEY })],
      });
      this.serialize("name", { coder: "json" });
    }
  }
  return EncryptedSerializedBook;
}

describe("ActiveRecord::Encryption::ExtendedDeterministicQueriesTest (trails extras)", () => {
  let EncryptedSerializedBook: ReturnType<typeof buildSerializedBook>;

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

  it("uniqueness ciphertext generation serializes through the full resolved type", () => {
    const fullType = getAttributeType(EncryptedSerializedBook, "name") as {
      serialize(v: unknown): unknown;
    };
    // The resolved type is the outer Serialized wrapper, not the bare
    // EncryptedAttributeType — the delegation the expansion must honor.
    expect(fullType).not.toBeInstanceOf(EncryptedAttributeType);

    const [current] = EncryptedUniquenessValidator.allCiphertextsFor(
      EncryptedSerializedBook,
      "name",
      "Dune",
    ) as Array<{ value: unknown }>;
    // Deterministic encryption: the expansion candidate must equal the
    // write-path ciphertext (coder dump applied before encryption).
    expect(current.value).toEqual(fullType.serialize("Dune"));
  });
});
