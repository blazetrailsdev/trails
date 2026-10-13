import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { ExtendedDeterministicQueries } from "./extended-deterministic-queries.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Encryption } from "../encryption.js";
import "../encryption.js";
import { Base } from "../base.js";
import { Relation } from "../relation.js";

fixtures([], { useTransactionalTests: false });

const TEST_KEY = Buffer.alloc(32, "x").toString("base64");

function buildBooks() {
  class UnencryptedBook extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
    }
  }
  class EncryptedBook extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.encrypts("name", { deterministic: true, key: TEST_KEY });
    }
  }
  class EncryptedBookWithDowncaseName extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.encrypts("name", { deterministic: true, downcase: true, key: TEST_KEY });
    }
  }
  class EncryptedBookWithUnencryptedDataOptedOut extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.encrypts("name", { deterministic: true, supportUnencryptedData: false, key: TEST_KEY });
    }
  }
  class EncryptedBookWithUnencryptedDataOptedIn extends Base {
    static {
      this._tableName = "books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.encrypts("name", { deterministic: true, supportUnencryptedData: true, key: TEST_KEY });
    }
  }

  return {
    UnencryptedBook,
    EncryptedBook,
    EncryptedBookWithDowncaseName,
    EncryptedBookWithUnencryptedDataOptedOut,
    EncryptedBookWithUnencryptedDataOptedIn,
  };
}

describe("ActiveRecord::Encryption::ExtendedDeterministicQueriesTest", () => {
  let books: ReturnType<typeof buildBooks>;

  const savedConfig = {
    extendQueries: Encryption.config.extendQueries,
    supportUnencryptedData: Encryption.config.supportUnencryptedData,
    keyDerivationSalt: Encryption.config.keyDerivationSalt,
    primaryKey: Encryption.config.primaryKey,
    deterministicKey: Encryption.config.deterministicKey,
  };
  const savedMethods: {
    where?: (...args: any[]) => unknown;
    isExists?: (...args: any[]) => unknown;
    scopeForCreate?: (...args: any[]) => unknown;
    findBy?: (...args: any[]) => unknown;
    serialize?: (...args: any[]) => unknown;
  } = {};

  beforeAll(async () => {
    Encryption.config.extendQueries = true;
    Encryption.config.supportUnencryptedData = true;
    Encryption.config.keyDerivationSalt = "test-salt";
    Encryption.config.primaryKey = "test-primary-key";
    Encryption.config.deterministicKey = "test-deterministic-key";

    savedMethods.where = Relation.prototype.where;
    savedMethods.isExists = (Relation.prototype as any).isExists;
    savedMethods.scopeForCreate = (Relation.prototype as any).scopeForCreate;
    savedMethods.findBy = (Base as any).findBy;
    savedMethods.serialize = EncryptedAttributeType.prototype.serialize;

    ExtendedDeterministicQueries.installSupport();

    books = buildBooks();
    await books.EncryptedBook.where("1=1");
  });

  fixtures([], { useTransactionalTests: true });

  afterAll(() => {
    Relation.prototype.where = savedMethods.where as typeof Relation.prototype.where;
    (Relation.prototype as any).isExists = savedMethods.isExists;
    (Relation.prototype as any).scopeForCreate = savedMethods.scopeForCreate;
    (Base as any).findBy = savedMethods.findBy;
    EncryptedAttributeType.prototype.serialize =
      savedMethods.serialize as typeof EncryptedAttributeType.prototype.serialize;

    Encryption.config.extendQueries = savedConfig.extendQueries;
    Encryption.config.supportUnencryptedData = savedConfig.supportUnencryptedData;
    Encryption.config.keyDerivationSalt = savedConfig.keyDerivationSalt;
    Encryption.config.primaryKey = savedConfig.primaryKey;
    Encryption.config.deterministicKey = savedConfig.deterministicKey;
  });

  it("Finds records when data is unencrypted", async () => {
    const { UnencryptedBook, EncryptedBook } = books;
    await UnencryptedBook.create({ name: "Dune" });
    expect(await EncryptedBook.findBy({ name: "Dune" })).toBeTruthy();
    expect(await EncryptedBook.where("id > 0").findBy({ name: "Dune" })).toBeTruthy();
  });

  it("Finds records when data is encrypted", async () => {
    const { EncryptedBook } = books;
    await EncryptedBook.create({ name: "Dune" });
    expect(await EncryptedBook.findBy({ name: "Dune" })).toBeTruthy();
    expect(await EncryptedBook.where("id > 0").findBy({ name: "Dune" })).toBeTruthy();
  });

  it("Works well with downcased attributes", async () => {
    const { EncryptedBookWithDowncaseName } = books;
    await EncryptedBookWithDowncaseName.create({ name: "Dune" });
    expect(await EncryptedBookWithDowncaseName.findBy({ name: "DUNE" })).toBeTruthy();
  });

  it("Works well with string attribute names", async () => {
    const { UnencryptedBook, EncryptedBook } = books;
    await UnencryptedBook.create({ name: "Dune" });
    expect(await EncryptedBook.findBy({ name: "Dune" })).toBeTruthy();
  });

  it("find_or_create_by works", async () => {
    const { EncryptedBook } = books;
    await EncryptedBook.findOrCreateBy({ name: "Dune" });
    expect(await EncryptedBook.findBy({ name: "Dune" })).toBeTruthy();

    await EncryptedBook.findOrCreateBy({ name: "Dune" });
    expect(await EncryptedBook.findBy({ name: "Dune" })).toBeTruthy();
  });

  it("does not mutate arguments", async () => {
    const { EncryptedBook } = books;
    const props = { name: "Dune" };
    const record = await EncryptedBook.findOrInitializeBy(props);
    expect((record as any).name).toBe("Dune");
    expect(props.name).toBe("Dune");
  });

  it("where(...).first_or_create works", async () => {
    const { EncryptedBook } = books;
    await EncryptedBook.where({ name: "Dune" }).firstOrCreate();
    expect(await EncryptedBook.isExists({ name: "Dune" })).toBeTruthy();
  });

  it("exists?(...) works", async () => {
    const { EncryptedBook } = books;
    await EncryptedBook.create({ name: "Dune" });
    expect(await EncryptedBook.isExists({ name: "Dune" })).toBeTruthy();
  });

  it("If support_unencrypted_data is opted out at the attribute level, cannot find unencrypted data", async () => {
    const { UnencryptedBook, EncryptedBookWithUnencryptedDataOptedOut } = books;
    await UnencryptedBook.create({ name: "Dune" });
    expect(await EncryptedBookWithUnencryptedDataOptedOut.findBy({ name: "Dune" })).toBeNull();
    expect(
      await EncryptedBookWithUnencryptedDataOptedOut.where("id > 0").findBy({ name: "Dune" }),
    ).toBeNull();
  });

  it("If support_unencrypted_data is opted out at the attribute level, can find encrypted data", async () => {
    const { EncryptedBook, EncryptedBookWithUnencryptedDataOptedOut } = books;
    await EncryptedBook.create({ name: "Dune" });
    expect(await EncryptedBookWithUnencryptedDataOptedOut.findBy({ name: "Dune" })).toBeTruthy();
    expect(
      await EncryptedBookWithUnencryptedDataOptedOut.where("id > 0").findBy({ name: "Dune" }),
    ).toBeTruthy();
  });

  it("If support_unencrypted_data is opted in at the attribute level, can find unencrypted data", async () => {
    const { UnencryptedBook, EncryptedBookWithUnencryptedDataOptedIn } = books;
    await UnencryptedBook.create({ name: "Dune" });
    expect(await EncryptedBookWithUnencryptedDataOptedIn.findBy({ name: "Dune" })).toBeTruthy();
    expect(
      await EncryptedBookWithUnencryptedDataOptedIn.where("id > 0").findBy({ name: "Dune" }),
    ).toBeTruthy();
  });

  it("If support_unencrypted_data is opted in at the attribute level, can find encrypted data", async () => {
    const { EncryptedBook, EncryptedBookWithUnencryptedDataOptedIn } = books;
    await EncryptedBook.create({ name: "Dune" });
    expect(await EncryptedBookWithUnencryptedDataOptedIn.findBy({ name: "Dune" })).toBeTruthy();
    expect(
      await EncryptedBookWithUnencryptedDataOptedIn.where("id > 0").findBy({ name: "Dune" }),
    ).toBeTruthy();
  });
});
