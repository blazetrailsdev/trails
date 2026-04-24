import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  freshAdapter,
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  makeEncryptedBookWithDowncaseName,
  makeFreshModel,
  makeKeyProvider,
  makeEncryptedBook,
} from "./test-helpers.js";
import { Configurable } from "./configurable.js";
import { installExtendedQueriesIfConfigured } from "./install.js";
import { ExtendedDeterministicUniquenessValidator } from "./extended-deterministic-uniqueness-validator.js";
import { ExtendedDeterministicQueries } from "./extended-deterministic-queries.js";
import { UniquenessValidator } from "../validations.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Relation } from "../relation.js";
import { Base } from "../index.js";
describe("ActiveRecord::Encryption::UniquenessValidationsTest", () => {
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;
  let savedExtendQueries: boolean;
  const savedMethods: {
    where?: Function;
    exists?: Function;
    scopeForCreate?: Function;
    findBy?: Function;
    serialize?: Function;
  } = {};

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    savedExtendQueries = Configurable.config.extendQueries;
    Configurable.config.previousSchemes = [];
    configureEncryption();

    // Snapshot prototype methods before installing query patches.
    savedMethods.where = Relation.prototype.where;
    savedMethods.exists = (Relation.prototype as any).exists;
    savedMethods.scopeForCreate = (Relation.prototype as any).scopeForCreate;
    savedMethods.findBy = (Base as any).findBy;
    savedMethods.serialize = EncryptedAttributeType.prototype.serialize;

    Configurable.config.extendQueries = true;
    installExtendedQueriesIfConfigured();
  });

  afterEach(() => {
    // Restore prototype methods to avoid cross-test pollution.
    Relation.prototype.where = savedMethods.where as typeof Relation.prototype.where;
    (Relation.prototype as any).exists = savedMethods.exists;
    (Relation.prototype as any).scopeForCreate = savedMethods.scopeForCreate;
    (Base as any).findBy = savedMethods.findBy;
    EncryptedAttributeType.prototype.serialize =
      savedMethods.serialize as typeof EncryptedAttributeType.prototype.serialize;
    (ExtendedDeterministicQueries as any)._installed = false;
    ExtendedDeterministicUniquenessValidator.resetSupport(UniquenessValidator);

    restoreEncryptionConfig(configSnapshot);
    Configurable.config.extendQueries = savedExtendQueries;
  });

  it("uniqueness validations work", async () => {
    const Book = makeEncryptedBookWithDowncaseName(freshAdapter());
    Book.validatesUniqueness("name");
    new Book();

    await Book.create({ name: "dune" });
    const dup = await Book.create({ name: "dune" });
    expect(dup.errors.count).toBe(1);
  });

  it.skip("uniqueness validations work when mixing encrypted an unencrypted data", () => {
    // requires same adapter/table access from two different model classes
  });

  it.skip("uniqueness validations do not work when mixing encrypted an unencrypted data and unencrypted data is opted out per-attribute", () => {
    // needs supportUnencryptedData per-attribute option
  });

  it.skip("uniqueness validations work when mixing encrypted an unencrypted data and unencrypted data is opted in per-attribute", () => {
    // needs supportUnencryptedData per-attribute option
  });

  it("uniqueness validations work when using old encryption schemes", async () => {
    Configurable.config.supportUnencryptedData = false;
    Configurable.config.previous = [{ downcase: true, deterministic: true }];

    const OldBook = makeFreshModel(freshAdapter(), { id: "integer", name: "string" });
    OldBook.validatesUniqueness("name");
    OldBook.encrypts("name", { deterministic: true, downcase: false });
    new OldBook();

    await OldBook.create({ name: "dune" });
    // The previous scheme has downcase:true, so "DUNE" should collide with "dune".
    const dup = await OldBook.create({ name: "DUNE" });
    expect(dup.errors.count).toBe(1);
  });

  it("uniqueness validation does not revalidate the attribute with current encryption type", async () => {
    // Configure a previous scheme so previousTypes is non-empty — this exercises
    // the code path that would trigger multiple validateEach calls and verifies
    // the error count stays at 1 (not duplicated per scheme).
    const prevKeyProvider = makeKeyProvider("prev-key-for-uniqueness-test-32b!!");
    Configurable.config.previous = [{ keyProvider: prevKeyProvider, deterministic: true }];

    const Book = makeEncryptedBook(freshAdapter()); // deterministic encrypted name
    Book.validatesUniqueness("name");
    new Book();

    await Book.create({ name: "Dune" });
    const dup = await Book.create({ name: "Dune" });
    expect(dup.errors.count).toBe(1);
  });
});
