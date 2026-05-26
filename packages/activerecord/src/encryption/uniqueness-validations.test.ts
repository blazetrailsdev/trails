import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  makeKeyProvider,
} from "./test-helpers.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { Configurable } from "./configurable.js";
import { installExtendedQueriesIfConfigured } from "./install.js";
import { ExtendedDeterministicUniquenessValidator } from "./extended-deterministic-uniqueness-validator.js";
import { ExtendedDeterministicQueries } from "./extended-deterministic-queries.js";
import { UniquenessValidator } from "../validations.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Relation } from "../relation.js";
import { Base } from "../index.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

describe("ActiveRecord::Encryption::UniquenessValidationsTest", () => {
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;
  let savedExtendQueries: boolean;
  const savedMethods: {
    where?: (...args: any[]) => unknown;
    exists?: (...args: any[]) => unknown;
    scopeForCreate?: (...args: any[]) => unknown;
    findBy?: (...args: any[]) => unknown;
    serialize?: (...args: any[]) => unknown;
  } = {};

  beforeAll(async () => {
    await defineSchema({
      encrypted_books: { name: { type: "string", limit: 1024, default: "<untitled>" } },
    });
  });

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    savedExtendQueries = Configurable.config.extendQueries;
    Configurable.config.previousSchemes = [];
    configureEncryption();

    savedMethods.where = Relation.prototype.where;
    savedMethods.exists = (Relation.prototype as any).exists;
    savedMethods.scopeForCreate = (Relation.prototype as any).scopeForCreate;
    savedMethods.findBy = (Base as any).findBy;
    savedMethods.serialize = EncryptedAttributeType.prototype.serialize;

    Configurable.config.extendQueries = true;
    installExtendedQueriesIfConfigured();
  });

  afterEach(() => {
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
    class EncryptedBookWithDowncaseName extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string", { default: "<untitled>" });
        this.validatesUniqueness("name");
        this.encrypts("name", { deterministic: true, downcase: true });
      }
    }

    await EncryptedBookWithDowncaseName.create({ name: "dune" });
    const dup = await EncryptedBookWithDowncaseName.create({ name: "dune" });
    expect(dup.errors.count).toBe(1);
  });

  it("uniqueness validations work when mixing encrypted an unencrypted data", async () => {
    Configurable.config.supportUnencryptedData = true;

    class EncryptedBookWithDowncaseName extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string", { default: "<untitled>" });
        this.validatesUniqueness("name");
        this.encrypts("name", { deterministic: true, downcase: true });
      }
    }

    class UnencryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string", { default: "<untitled>" });
      }
    }

    await UnencryptedBook.create({ name: "dune" });
    const dup = await EncryptedBookWithDowncaseName.create({ name: "DUNE" });
    expect(dup.errors.count).toBe(1);
  });

  it("uniqueness validations do not work when mixing encrypted an unencrypted data and unencrypted data is opted out per-attribute", async () => {
    Configurable.config.supportUnencryptedData = true;

    class EncryptedBookWithUnencryptedDataOptedOut extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string", { default: "<untitled>" });
        this.validatesUniqueness("name");
        this.encrypts("name", { deterministic: true, supportUnencryptedData: false });
      }
    }

    class UnencryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string", { default: "<untitled>" });
      }
    }

    await UnencryptedBook.create({ name: "dune" });
    const book = await EncryptedBookWithUnencryptedDataOptedOut.create({ name: "dune" });
    expect(book.errors.count).toBe(0);
  });

  it("uniqueness validations work when mixing encrypted an unencrypted data and unencrypted data is opted in per-attribute", async () => {
    Configurable.config.supportUnencryptedData = true;

    class EncryptedBookWithUnencryptedDataOptedIn extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string", { default: "<untitled>" });
        this.validatesUniqueness("name");
        this.encrypts("name", { deterministic: true, supportUnencryptedData: true });
      }
    }

    class UnencryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string", { default: "<untitled>" });
      }
    }

    await UnencryptedBook.create({ name: "dune" });
    const dup = await EncryptedBookWithUnencryptedDataOptedIn.create({ name: "dune" });
    expect(dup.errors.count).toBe(1);
  });

  it("uniqueness validations work when using old encryption schemes", async () => {
    Configurable.config.supportUnencryptedData = false;
    Configurable.config.previous = [{ downcase: true, deterministic: true }];

    class OldEncryptionBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string", { default: "<untitled>" });
        this.validatesUniqueness("name");
        this.encrypts("name", { deterministic: true, downcase: false });
      }
    }

    await OldEncryptionBook.create({ name: "dune" });
    const dup = await OldEncryptionBook.create({ name: "DUNE" });
    expect(dup.errors.count).toBe(1);
  });

  it("uniqueness validation does not revalidate the attribute with current encryption type", async () => {
    const prevKeyProvider = makeKeyProvider("prev-key-for-uniqueness-test-32b!!");
    Configurable.config.previous = [{ keyProvider: prevKeyProvider, deterministic: true }];

    class EncryptedBookWithUniquenessValidation extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("id", "integer");
        this.attribute("name", "string", { default: "<untitled>" });
        this.validatesUniqueness("name");
        this.encrypts("name", { deterministic: true });
      }
    }

    await EncryptedBookWithUniquenessValidation.create({ name: "dune" });
    const dup = await EncryptedBookWithUniquenessValidation.create({ name: "dune" });
    expect(dup.errors.count).toBe(1);
  });
});
