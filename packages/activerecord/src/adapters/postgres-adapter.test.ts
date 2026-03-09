import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { PostgresAdapter } from "./postgres-adapter.js";
import {
  Base,
  Relation,
  Migration,
  Schema,
  transaction,
  savepoint,
  registerModel,
  loadBelongsTo,
  loadHasMany,
} from "../index.js";

/**
 * These tests require a running PostgreSQL instance. They will be skipped if
 * the connection fails.
 *
 * Set PG_TEST_URL to a connection string, or the tests will default to:
 *   postgres://localhost:5432/rails_js_test
 *
 * To set up:
 *   createdb rails_js_test
 */
const PG_TEST_URL =
  process.env.PG_TEST_URL ?? "postgres://localhost:5432/rails_js_test";

let pgAvailable = false;

// Quick connectivity check
async function checkPg(): Promise<boolean> {
  try {
    const client = new pg.Client({ connectionString: PG_TEST_URL });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return true;
  } catch {
    return false;
  }
}

pgAvailable = await checkPg();

const describeIfPg = pgAvailable ? describe : describe.skip;

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;

  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });

  afterEach(async () => {
    // Drop test tables to clean up
    try {
      await adapter.exec('DROP TABLE IF EXISTS "books" CASCADE');
      await adapter.exec('DROP TABLE IF EXISTS "authors" CASCADE');
      await adapter.exec('DROP TABLE IF EXISTS "users" CASCADE');
      await adapter.exec('DROP TABLE IF EXISTS "items" CASCADE');
      await adapter.exec('DROP TABLE IF EXISTS "accounts" CASCADE');
      await adapter.exec('DROP TABLE IF EXISTS "products" CASCADE');
      await adapter.exec('DROP TABLE IF EXISTS "posts" CASCADE');
      await adapter.exec('DROP TABLE IF EXISTS "pk_test" CASCADE');
      await adapter.exec('DROP TABLE IF EXISTS "no_pk_test" CASCADE');
      await adapter.exec('DROP TABLE IF EXISTS "bind_test" CASCADE');
      await adapter.exec('DROP TABLE IF EXISTS "quoting_test" CASCADE');
      await adapter.exec('DROP TABLE IF EXISTS "schema_test_idx" CASCADE');
    } catch {
      // ignore cleanup errors
    }
    await adapter.close();
  });

  // -- Basic adapter operations --
  describe("raw SQL execution", () => {
    it("creates tables and inserts data", async () => {
      await adapter.exec(
        'CREATE TABLE "users" ("id" SERIAL PRIMARY KEY, "name" TEXT)'
      );
      await adapter.executeMutation(
        `INSERT INTO "users" ("name") VALUES ('Alice')`
      );
      const rows = await adapter.execute('SELECT * FROM "users"');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Alice");
    });

    it("returns last insert id for INSERT", async () => {
      await adapter.exec(
        'CREATE TABLE "items" ("id" SERIAL PRIMARY KEY, "name" TEXT)'
      );
      const id1 = await adapter.executeMutation(
        `INSERT INTO "items" ("name") VALUES ('A')`
      );
      const id2 = await adapter.executeMutation(
        `INSERT INTO "items" ("name") VALUES ('B')`
      );
      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it("returns affected rows for UPDATE", async () => {
      await adapter.exec(
        'CREATE TABLE "items" ("id" SERIAL PRIMARY KEY, "name" TEXT, "active" INTEGER DEFAULT 1)'
      );
      await adapter.executeMutation(
        `INSERT INTO "items" ("name") VALUES ('A')`
      );
      await adapter.executeMutation(
        `INSERT INTO "items" ("name") VALUES ('B')`
      );
      const affected = await adapter.executeMutation(
        'UPDATE "items" SET "active" = 0'
      );
      expect(affected).toBe(2);
    });

    it("returns affected rows for DELETE", async () => {
      await adapter.exec(
        'CREATE TABLE "items" ("id" SERIAL PRIMARY KEY, "name" TEXT)'
      );
      await adapter.executeMutation(
        `INSERT INTO "items" ("name") VALUES ('A')`
      );
      await adapter.executeMutation(
        `INSERT INTO "items" ("name") VALUES ('B')`
      );
      const deleted = await adapter.executeMutation(
        `DELETE FROM "items" WHERE "name" = 'A'`
      );
      expect(deleted).toBe(1);
    });

    it("supports parameterized queries with ? binds", async () => {
      await adapter.exec(
        'CREATE TABLE "items" ("id" SERIAL PRIMARY KEY, "name" TEXT, "price" INTEGER)'
      );
      await adapter.executeMutation(
        `INSERT INTO "items" ("name", "price") VALUES ('A', 10)`
      );
      await adapter.executeMutation(
        `INSERT INTO "items" ("name", "price") VALUES ('B', 20)`
      );
      await adapter.executeMutation(
        `INSERT INTO "items" ("name", "price") VALUES ('C', 30)`
      );

      // ? gets rewritten to $1
      const rows = await adapter.execute(
        'SELECT * FROM "items" WHERE "price" > ?',
        [15]
      );
      expect(rows).toHaveLength(2);
    });
  });

  // -- Transactions --
  describe("transactions", () => {
    beforeEach(async () => {
      await adapter.exec(
        'CREATE TABLE "accounts" ("id" SERIAL PRIMARY KEY, "name" TEXT, "balance" INTEGER)'
      );
    });

    it("commits on success", async () => {
      await adapter.beginTransaction();
      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Alice', 100)`
      );
      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Bob', 200)`
      );
      await adapter.commit();

      const rows = await adapter.execute('SELECT * FROM "accounts"');
      expect(rows).toHaveLength(2);
    });

    it("rolls back on failure", async () => {
      await adapter.beginTransaction();
      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Alice', 100)`
      );
      await adapter.rollback();

      const rows = await adapter.execute('SELECT * FROM "accounts"');
      expect(rows).toHaveLength(0);
    });

    it("savepoints allow partial rollback", async () => {
      await adapter.beginTransaction();
      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Alice', 100)`
      );

      await adapter.createSavepoint("sp1");
      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Bob', 200)`
      );
      await adapter.rollbackToSavepoint("sp1");

      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Charlie', 300)`
      );
      await adapter.commit();

      const rows = await adapter.execute('SELECT * FROM "accounts"');
      expect(rows).toHaveLength(2);
      const names = rows.map((r) => r.name);
      expect(names).toContain("Alice");
      expect(names).toContain("Charlie");
      expect(names).not.toContain("Bob");
    });

    it("tracks inTransaction state", async () => {
      expect(adapter.inTransaction).toBe(false);
      await adapter.beginTransaction();
      expect(adapter.inTransaction).toBe(true);
      await adapter.commit();
      expect(adapter.inTransaction).toBe(false);
    });
  });

  // -- ActiveRecord Base with real PostgreSQL --
  describe("Base integration", () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.attribute("age", "integer");
      }
    }

    beforeEach(async () => {
      await adapter.exec(`
        CREATE TABLE "users" (
          "id" SERIAL PRIMARY KEY,
          "name" TEXT,
          "email" TEXT,
          "age" INTEGER
        )
      `);
      User.adapter = adapter;
    });

    it("creates and retrieves records", async () => {
      const user = await User.create({
        name: "Alice",
        email: "alice@test.com",
        age: 30,
      });
      expect(user.id).toBe(1);
      expect(user.isPersisted()).toBe(true);

      const found = await User.find(1);
      expect(found.readAttribute("name")).toBe("Alice");
      expect(found.readAttribute("email")).toBe("alice@test.com");
      expect(found.readAttribute("age")).toBe(30);
    });

    it("updates records", async () => {
      const user = await User.create({
        name: "Alice",
        email: "alice@test.com",
        age: 30,
      });
      await user.update({ name: "Alicia", age: 31 });

      const found = await User.find(user.id);
      expect(found.readAttribute("name")).toBe("Alicia");
      expect(found.readAttribute("age")).toBe(31);
    });

    it("destroys records", async () => {
      const user = await User.create({
        name: "Alice",
        email: "alice@test.com",
        age: 30,
      });
      await user.destroy();

      expect(user.isDestroyed()).toBe(true);
      await expect(User.find(1)).rejects.toThrow("not found");
    });

    it("findBy with multiple conditions", async () => {
      await User.create({ name: "Alice", email: "alice@test.com", age: 30 });
      await User.create({ name: "Bob", email: "bob@test.com", age: 25 });

      const found = await User.findBy({ name: "Bob", age: 25 });
      expect(found).not.toBeNull();
      expect(found!.readAttribute("email")).toBe("bob@test.com");
    });

    it("findBy returns null for no match", async () => {
      const found = await User.findBy({ name: "Nobody" });
      expect(found).toBeNull();
    });

    it("handles null values correctly", async () => {
      const user = await User.create({
        name: "Alice",
        email: null,
        age: null,
      });

      const found = await User.find(user.id);
      expect(found.readAttribute("email")).toBeNull();
      expect(found.readAttribute("age")).toBeNull();
    });
  });

  // -- Relation with real PostgreSQL --
  describe("Relation integration", () => {
    class Product extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("price", "integer");
        this.attribute("category", "string");
      }
    }

    beforeEach(async () => {
      await adapter.exec(`
        CREATE TABLE "products" (
          "id" SERIAL PRIMARY KEY,
          "name" TEXT,
          "price" INTEGER,
          "category" TEXT
        )
      `);
      Product.adapter = adapter;
      await Product.create({ name: "Apple", price: 1, category: "fruit" });
      await Product.create({ name: "Banana", price: 2, category: "fruit" });
      await Product.create({ name: "Carrot", price: 3, category: "vegetable" });
      await Product.create({ name: "Date", price: 4, category: "fruit" });
      await Product.create({ name: "Eggplant", price: 5, category: "vegetable" });
    });

    it("all() returns all records", async () => {
      const products = await Product.all().toArray();
      expect(products).toHaveLength(5);
    });

    it("where filters correctly", async () => {
      const fruits = await Product.where({ category: "fruit" }).toArray();
      expect(fruits).toHaveLength(3);
    });

    it("chained where conditions", async () => {
      const items = await Product.where({ category: "fruit" })
        .where({ name: "Apple" })
        .toArray();
      expect(items).toHaveLength(1);
    });

    it("order sorts correctly", async () => {
      const items = await Product.all()
        .order({ price: "desc" })
        .toArray();
      expect(items[0].readAttribute("name")).toBe("Eggplant");
      expect(items[4].readAttribute("name")).toBe("Apple");
    });

    it("limit and offset", async () => {
      const items = await Product.all()
        .order("name")
        .limit(2)
        .offset(1)
        .toArray();
      expect(items).toHaveLength(2);
    });

    it("count", async () => {
      expect(await Product.all().count()).toBe(5);
      expect(await Product.where({ category: "fruit" }).count()).toBe(3);
    });

    it("exists", async () => {
      expect(await Product.where({ category: "fruit" }).exists()).toBe(true);
      expect(await Product.where({ category: "meat" }).exists()).toBe(false);
    });

    it("pluck single column", async () => {
      const names = await Product.all().order("name").pluck("name");
      expect(names).toEqual(["Apple", "Banana", "Carrot", "Date", "Eggplant"]);
    });

    it("ids", async () => {
      const ids = await Product.all().ids();
      expect(ids).toEqual([1, 2, 3, 4, 5]);
    });

    it("deleteAll with where", async () => {
      const deleted = await Product.where({ category: "vegetable" }).deleteAll();
      expect(deleted).toBe(2);
      expect(await Product.all().count()).toBe(3);
    });

    it("updateAll with where", async () => {
      await Product.where({ category: "fruit" }).updateAll({ price: 99 });
      const apple = await Product.find(1);
      expect(apple.readAttribute("price")).toBe(99);
      // Vegetable unchanged
      const carrot = await Product.find(3);
      expect(carrot.readAttribute("price")).toBe(3);
    });

    it("none returns empty", async () => {
      expect(await Product.all().none().toArray()).toEqual([]);
      expect(await Product.all().none().count()).toBe(0);
    });
  });

  // -- Transactions with real rollback --
  describe("transaction integration", () => {
    class Account extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("balance", "integer", { default: 0 });
      }
    }

    beforeEach(async () => {
      await adapter.exec(`
        CREATE TABLE "accounts" (
          "id" SERIAL PRIMARY KEY,
          "name" TEXT,
          "balance" INTEGER DEFAULT 0
        )
      `);
      Account.adapter = adapter;
    });

    it("commits on success", async () => {
      await transaction(Account, async () => {
        await Account.create({ name: "Alice", balance: 100 });
        await Account.create({ name: "Bob", balance: 200 });
      });

      expect(await Account.all().count()).toBe(2);
    });

    it("actually rolls back on failure", async () => {
      await Account.create({ name: "Existing", balance: 50 });

      try {
        await transaction(Account, async () => {
          await Account.create({ name: "Alice", balance: 100 });
          throw new Error("Boom");
        });
      } catch {
        // expected
      }

      // Only the pre-transaction record should exist
      const count = await Account.all().count();
      expect(count).toBe(1);
      const rows = await adapter.execute('SELECT * FROM "accounts"');
      expect(rows[0].name).toBe("Existing");
    });

    it("savepoint rolls back inner transaction only", async () => {
      await transaction(Account, async () => {
        await Account.create({ name: "Alice", balance: 100 });

        try {
          await savepoint(Account, "sp1", async () => {
            await Account.create({ name: "Bob", balance: 200 });
            throw new Error("inner error");
          });
        } catch {
          // savepoint rolled back
        }

        await Account.create({ name: "Charlie", balance: 300 });
      });

      const rows = await adapter.execute(
        'SELECT * FROM "accounts" ORDER BY "name"'
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe("Alice");
      expect(rows[1].name).toBe("Charlie");
    });
  });

  // -- Associations with real PostgreSQL --
  describe("associations integration", () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }

    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }

    beforeEach(async () => {
      await adapter.exec(`
        CREATE TABLE "authors" (
          "id" SERIAL PRIMARY KEY,
          "name" TEXT
        )
      `);
      await adapter.exec(`
        CREATE TABLE "books" (
          "id" SERIAL PRIMARY KEY,
          "title" TEXT,
          "author_id" INTEGER
        )
      `);
      Author.adapter = adapter;
      Book.adapter = adapter;
      registerModel(Author);
      registerModel(Book);
    });

    it("belongsTo loads parent from real DB", async () => {
      const author = await Author.create({ name: "Tolkien" });
      const book = await Book.create({
        title: "The Hobbit",
        author_id: author.id,
      });

      const loaded = await loadBelongsTo(book, "author", {});
      expect(loaded).not.toBeNull();
      expect(loaded!.readAttribute("name")).toBe("Tolkien");
    });

    it("hasMany loads children from real DB", async () => {
      const author = await Author.create({ name: "Tolkien" });
      await Book.create({ title: "The Hobbit", author_id: author.id });
      await Book.create({ title: "The Silmarillion", author_id: author.id });
      await Book.create({ title: "Other Book", author_id: 999 });

      const books = await loadHasMany(author, "books", {});
      expect(books).toHaveLength(2);
    });
  });

  // -- PostgreSQL-specific features --
  describe("PostgreSQL-specific features", () => {
    it("handles SERIAL auto-increment correctly", async () => {
      await adapter.exec(
        'CREATE TABLE "items" ("id" SERIAL PRIMARY KEY, "name" TEXT)'
      );

      const id1 = await adapter.executeMutation(
        `INSERT INTO "items" ("name") VALUES ('first')`
      );
      const id2 = await adapter.executeMutation(
        `INSERT INTO "items" ("name") VALUES ('second')`
      );
      const id3 = await adapter.executeMutation(
        `INSERT INTO "items" ("name") VALUES ('third')`
      );

      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);
    });

    it("handles explicit RETURNING clause", async () => {
      await adapter.exec(
        'CREATE TABLE "items" ("id" SERIAL PRIMARY KEY, "name" TEXT, "code" TEXT)'
      );

      // executeMutation with explicit RETURNING should return the specified column
      const result = await adapter.executeMutation(
        `INSERT INTO "items" ("name", "code") VALUES ('test', 'ABC') RETURNING "id"`
      );
      expect(result).toBe(1);
    });

    it("supports TEXT, INTEGER, BOOLEAN, REAL column types", async () => {
      await adapter.exec(`
        CREATE TABLE "items" (
          "id" SERIAL PRIMARY KEY,
          "name" TEXT,
          "count" INTEGER,
          "active" BOOLEAN,
          "price" REAL
        )
      `);

      await adapter.executeMutation(
        `INSERT INTO "items" ("name", "count", "active", "price") VALUES ('Widget', 42, true, 9.99)`
      );

      const rows = await adapter.execute('SELECT * FROM "items"');
      expect(rows[0].name).toBe("Widget");
      expect(rows[0].count).toBe(42);
      expect(rows[0].active).toBe(true);
      expect(rows[0].price).toBeCloseTo(9.99);
    });
  });

  // ── Rails-matching test stubs ──

  describe("PostgreSQLActiveSchemaTest", () => {
    it.skip("create database with encoding", async () => {});
    it.skip("create database with collation and ctype", async () => {});
    it.skip("add index", async () => {});
    it.skip("remove index", async () => {});
    it.skip("remove index when name is specified", async () => {});
    it.skip("remove index with wrong option", async () => {});
  });

  describe("PostgresqlArrayTest", () => {
    it.skip("column", async () => {});
    it.skip("not compatible with serialize array", async () => {});
    it.skip("array with serialized attributes", async () => {});
    it.skip("default", async () => {});
    it.skip("default strings", async () => {});
    it.skip("change column with array", async () => {});
    it.skip("change column from non array to array", async () => {});
    it.skip("change column cant make non array column to array", async () => {});
    it.skip("change column default with array", async () => {});
    it.skip("type cast array", async () => {});
    it.skip("type cast integers", async () => {});
    it.skip("schema dump with shorthand", async () => {});
    it.skip("select with strings", async () => {});
    it.skip("rewrite with strings", async () => {});
    it.skip("select with integers", async () => {});
    it.skip("rewrite with integers", async () => {});
    it.skip("multi dimensional with strings", async () => {});
    it.skip("with empty strings", async () => {});
    it.skip("with multi dimensional empty strings", async () => {});
    it.skip("with arbitrary whitespace", async () => {});
    it.skip("multi dimensional with integers", async () => {});
    it.skip("strings with quotes", async () => {});
    it.skip("strings with commas", async () => {});
    it.skip("strings with array delimiters", async () => {});
    it.skip("strings with null strings", async () => {});
    it.skip("contains nils", async () => {});
    it.skip("insert fixture", async () => {});
    it.skip("attribute for inspect for array field", async () => {});
    it.skip("attribute for inspect for array field for large array", async () => {});
    it.skip("escaping", async () => {});
    it.skip("string quoting rules match pg behavior", async () => {});
    it.skip("quoting non standard delimiters", async () => {});
    it.skip("mutate array", async () => {});
    it.skip("mutate value in array", async () => {});
    it.skip("datetime with timezone awareness", async () => {});
    it.skip("assigning non array value", async () => {});
    it.skip("assigning empty string", async () => {});
    it.skip("assigning valid pg array literal", async () => {});
    it.skip("where by attribute with array", async () => {});
    it.skip("uniqueness validation", async () => {});
    it.skip("encoding arrays of utf8 strings", async () => {});
    it.skip("precision is respected on timestamp columns", async () => {});
  });

  describe("PostgresqlBindParameterTest", () => {
    beforeEach(async () => {
      await adapter.exec(`
        CREATE TABLE "bind_test" (
          "id" SERIAL PRIMARY KEY,
          "name" TEXT
        )
      `);
      await adapter.executeMutation(
        `INSERT INTO "bind_test" ("name") VALUES ('hello')`
      );
    });

    it("where with string for string column using bind parameters", async () => {
      const rows = await adapter.execute(
        `SELECT * FROM "bind_test" WHERE "name" = ?`,
        ["hello"]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("hello");
    });

    it("where with integer for string column using bind parameters", async () => {
      const rows = await adapter.execute(
        `SELECT * FROM "bind_test" WHERE "name" = ?`,
        [123]
      );
      expect(rows).toHaveLength(0);
    });

    it("where with float for string column using bind parameters", async () => {
      const rows = await adapter.execute(
        `SELECT * FROM "bind_test" WHERE "name" = ?`,
        [1.5]
      );
      expect(rows).toHaveLength(0);
    });

    it("where with boolean for string column using bind parameters", async () => {
      const rows = await adapter.execute(
        `SELECT * FROM "bind_test" WHERE "name" = ?`,
        [true]
      );
      expect(rows).toHaveLength(0);
    });

    it("where with decimal for string column using bind parameters", async () => {
      const rows = await adapter.execute(
        `SELECT * FROM "bind_test" WHERE "name" = ?`,
        [99.99]
      );
      expect(rows).toHaveLength(0);
    });

    it("where with rational for string column using bind parameters", async () => {
      const rows = await adapter.execute(
        `SELECT * FROM "bind_test" WHERE "name" = ?`,
        [0.3333]
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe("PostgresqlBitStringTest", () => {
    it.skip("bit string", async () => {});
    it.skip("bit string default", async () => {});
    it.skip("bit string type cast", async () => {});
    it.skip("bit string invalid", async () => {});
    it.skip("varbit string", async () => {});
    it.skip("varbit string default", async () => {});
    it.skip("bit string column", async () => {});
    it.skip("bit string varying column", async () => {});
    it.skip("assigning invalid hex string raises exception", async () => {});
    it.skip("roundtrip", async () => {});
  });

  describe("PostgresqlByteaTest", () => {
    it.skip("column", async () => {});
    it.skip("default", async () => {});
    it.skip("type cast binary column", async () => {});
    it.skip("type cast bytea", async () => {});
    it.skip("type cast bytea empty string", async () => {});
    it.skip("type cast bytea nil", async () => {});
    it.skip("write and read", async () => {});
    it.skip("write and read with url safe base64", async () => {});
    it.skip("write nothing", async () => {});
    it.skip("write nil", async () => {});
    it.skip("write empty string", async () => {});
    it.skip("write with hex format", async () => {});
    it.skip("write with escape format", async () => {});
    it.skip("write via fixture", async () => {});
    it.skip("binary columns are limitless the upper limit is one GB", () => {});
    it.skip("type cast binary converts the encoding", () => {});
    it.skip("type cast binary value", () => {});
    it.skip("type case nil", () => {});
    it.skip("read value", () => {});
    it.skip("read nil value", () => {});
    it.skip("write value", () => {});
    it.skip("via to sql", () => {});
    it.skip("via to sql with complicating connection", () => {});
    it.skip("write binary", () => {});
    it.skip("serialize", () => {});
  });

  describe("PostgresqlCaseInsensitiveTest", () => {
    it.skip("case insensitive comparison", async () => {});
    it.skip("case insensitiveness", async () => {});
  });

  describe("PostgresqlChangeSchemaTest", () => {
    it.skip("change column", async () => {});
    it.skip("change column with null", async () => {});
    it.skip("change column with default", async () => {});
    it.skip("change column default with null", async () => {});
    it.skip("change column null", async () => {});
    it.skip("change column scale", async () => {});
    it.skip("change column precision", async () => {});
    it.skip("change column limit", async () => {});
    it.skip("change string to date", async () => {});
    it.skip("change type with symbol", async () => {});
    it.skip("change type with symbol with timestamptz", async () => {});
    it.skip("change type with symbol using datetime", async () => {});
    it.skip("change type with symbol using timestamp with timestamptz as default", async () => {});
    it.skip("change type with symbol with timestamptz as default", async () => {});
    it.skip("change type with symbol using datetime with timestamptz as default", async () => {});
    it.skip("change type with array", async () => {});
  });

  describe("PostgresqlCidrTest", () => {
    it.skip("cidr column", async () => {});
    it.skip("cidr type cast", async () => {});
    it.skip("cidr invalid", async () => {});
    it.skip("type casting IPAddr for database", async () => {});
    it.skip("casting does nothing with non-IPAddr objects", async () => {});
    it.skip("changed? with nil values", async () => {});
  });

  describe("PostgresqlCitextTest", () => {
    it.skip("citext column", async () => {});
    it.skip("citext default", async () => {});
    it.skip("citext type cast", async () => {});
    it.skip("case insensitive where", async () => {});
    it.skip("case insensitive uniqueness", async () => {});
    it.skip("case insensitive comparison", async () => {});
    it.skip("citext schema dump", async () => {});
    it.skip("citext enabled", async () => {});
    it.skip("change table supports json", async () => {});
    it.skip("write", async () => {});
    it.skip("select case insensitive", async () => {});
    it.skip("case insensitiveness", async () => {});
  });

  describe("PostgresqlCollationTest", () => {
    it.skip("columns collation", async () => {});
    it.skip("collation change", async () => {});
    it.skip("collation add", async () => {});
    it.skip("collation schema dump", async () => {});
    it.skip("collation default", async () => {});
  });

  describe("PostgresqlCompositeTest", () => {
    it.skip("column", async () => {});
    it.skip("composite value", async () => {});
    it.skip("composite mapping", async () => {});
    it.skip("composite write", async () => {});
  });

  describe("PostgresqlConnectionTest", () => {
    it("encoding", async () => {
      const rows = await adapter.execute(
        `SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = current_database()`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].encoding).toBeTruthy();
    });

    it("collation", async () => {
      const rows = await adapter.execute(
        `SELECT datcollate FROM pg_database WHERE datname = current_database()`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].datcollate).toBeTruthy();
    });

    it("ctype", async () => {
      const rows = await adapter.execute(
        `SELECT datctype FROM pg_database WHERE datname = current_database()`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].datctype).toBeTruthy();
    });

    it.skip("tables logs name", async () => {});
    it.skip("indexes logs name", async () => {});
    it.skip("table exists logs name", async () => {});
    it.skip("table alias length logs name", async () => {});
    it.skip("current database logs name", async () => {});
    it.skip("encoding logs name", async () => {});
    it.skip("schema names logs name", async () => {});
    it.skip("statement key is logged", async () => {});
    it.skip("set session variable true", async () => {});
    it.skip("set session variable false", async () => {});
    it.skip("set session variable nil", async () => {});
    it.skip("set session variable default", async () => {});
    it.skip("set session variable reset", async () => {});
    it.skip("set session timezone", async () => {});
    it.skip("get advisory lock", async () => {});
    it.skip("release advisory lock", async () => {});
    it.skip("advisory lock with xact", async () => {});
    it.skip("reconnection after actual disconnection", async () => {});
    it.skip("reconnection after simulated disconnection", async () => {});
    it.skip("set client min messages", async () => {});
    it.skip("only warn on first encounter of unrecognized oid", async () => {});
    it.skip("only warn on first encounter of undefined column type", async () => {});
    it.skip("default client min messages", async () => {});
    it.skip("connection options", async () => {});
    it.skip("reset", async () => {});
    it.skip("reset with transaction", async () => {});
    it.skip("prepare false with binds", async () => {});
    it.skip("reconnection after actual disconnection with verify", async () => {});
  });

  describe("PostgresqlCreateUnloggedTablesTest", () => {
    it.skip("create unlogged table", async () => {});
    it.skip("create unlogged table with index", async () => {});
    it.skip("create unlogged table from select", async () => {});
    it.skip("create logged table", async () => {});
    it.skip("unlogged table schema dump", async () => {});
    it.skip("logged by default", async () => {});
    it.skip("unlogged in test environment when unlogged setting enabled", async () => {});
    it.skip("not included in schema dump", async () => {});
    it.skip("not changed in change table", async () => {});
    it.skip("gracefully handles temporary tables", async () => {});
  });

  describe("PostgresqlDatatypeTest", () => {
    it.skip("money column", async () => {});
    it.skip("number column", async () => {});
    it.skip("time column", async () => {});
    it.skip("date column", async () => {});
    it.skip("timestamp column", async () => {});
    it.skip("boolean column", async () => {});
    it.skip("text column", async () => {});
    it.skip("binary column", async () => {});
    it.skip("oid column", async () => {});
    it.skip("data type of time types", async () => {});
    it.skip("data type of oid types", async () => {});
    it.skip("time values", async () => {});
    it.skip("update large time in seconds", async () => {});
    it.skip("oid values", async () => {});
    it.skip("update oid", async () => {});
    it.skip("text columns are limitless the upper limit is one GB", async () => {});
    it.skip("name column type", async () => {});
    it.skip("char column type", async () => {});
  });

  describe("PostgresqlDateTest", () => {
    it.skip("date column", async () => {});
    it.skip("date default", async () => {});
    it.skip("date type cast", async () => {});
    it.skip("date infinity", async () => {});
    it.skip("date before epoch", async () => {});
    it.skip("load infinity and beyond", async () => {});
    it.skip("save infinity and beyond", async () => {});
    it.skip("bc date", async () => {});
    it.skip("bc date leap year", async () => {});
    it.skip("bc date year zero", async () => {});
  });

  describe("PostgresqlDeferredConstraintsTest", () => {
    it.skip("deferrable initially deferred", async () => {});
    it.skip("deferrable initially immediate", async () => {});
    it.skip("not deferrable", async () => {});
    it.skip("set constraints all deferred", async () => {});
    it.skip("set constraints all immediate", async () => {});
    it.skip("defer constraints", async () => {});
    it.skip("defer constraints with specific fk", async () => {});
    it.skip("defer constraints with multiple fks", async () => {});
    it.skip("defer constraints only defers single fk", async () => {});
    it.skip("set constraints requires valid value", async () => {});
  });

  describe("PostgresqlDomainTest", () => {
    it.skip("column", async () => {});
    it.skip("domain type", async () => {});
    it.skip("domain acts like basetype", async () => {});
  });

  describe("PostgresqlEnumTest", () => {
    it.skip("column", async () => {});
    it.skip("enum default", async () => {});
    it.skip("enum type cast", async () => {});
    it.skip("enum mapping", async () => {});
    it.skip("invalid enum value", async () => {});
    it.skip("create enum", async () => {});
    it.skip("drop enum", async () => {});
    it.skip("rename enum", async () => {});
    it.skip("add enum value", async () => {});
    it.skip("add enum value before", async () => {});
    it.skip("add enum value after", async () => {});
    it.skip("enum schema dump", async () => {});
    it.skip("enum where", async () => {});
    it.skip("enum order", async () => {});
    it.skip("enum pluck", async () => {});
    it.skip("enum distinct", async () => {});
    it.skip("enum group", async () => {});
    it.skip("enum migration", async () => {});
    it.skip("enum array", async () => {});
    it.skip("enum defaults", () => {});
    it.skip("invalid enum update", () => {});
    it.skip("no oid warning", () => {});
    it.skip("assigning enum to nil", () => {});
    it.skip("schema dump renamed enum", () => {});
    it.skip("schema dump renamed enum with to option", () => {});
    it.skip("schema dump added enum value", () => {});
    it.skip("schema dump renamed enum value", () => {});
    it.skip("works with activerecord enum", () => {});
    it.skip("enum type scoped to schemas", () => {});
    it.skip("enum type explicit schema", () => {});
    it.skip("schema dump scoped to schemas", () => {});
    it.skip("schema load scoped to schemas", () => {});
  });

  describe("PostgresqlExplainTest", () => {
    it("explain for one query", async () => {
      const result = await adapter.explain("SELECT 1");
      expect(result).toContain("Result");
    });

    it.skip("explain with eager loading", async () => {});
    it.skip("explain with options as symbols", async () => {});
    it.skip("explain with options as strings", async () => {});
    it.skip("explain options with eager loading", async () => {});
  });

  describe("PostgresqlExtensionMigrationTest", () => {
    it.skip("enable extension", async () => {});
    it.skip("disable extension", async () => {});
    it.skip("enable extension idempotent", async () => {});
    it.skip("disable extension idempotent", async () => {});
    it.skip("extension schema dump", async () => {});
    it.skip("enable extension migration ignores prefix and suffix", async () => {});
    it.skip("enable extension migration with schema", async () => {});
    it.skip("disable extension migration ignores prefix and suffix", async () => {});
    it.skip("disable extension raises when dependent objects exist", async () => {});
    it.skip("disable extension drops extension when cascading", async () => {});
  });

  describe("PostgresqlForeignTableTest", () => {
    it.skip("create foreign table", async () => {});
    it.skip("drop foreign table", async () => {});
    it.skip("foreign table exists", async () => {});
    it.skip("foreign table columns", async () => {});
    it.skip("foreign table options", async () => {});
    it.skip("foreign table schema dump", async () => {});
    it.skip("foreign table insert", async () => {});
    it.skip("foreign table select", async () => {});
    it.skip("foreign table update", async () => {});
    it.skip("foreign table delete", async () => {});
    it.skip("foreign tables are valid data sources", async () => {});
    it.skip("foreign tables", async () => {});
    it.skip("does not have a primary key", async () => {});
    it.skip("insert record", async () => {});
    it.skip("update record", async () => {});
    it.skip("delete record", async () => {});
  });

  describe("PostgresqlFullTextTest", () => {
    it.skip("tsvector column", async () => {});
    it.skip("tsquery column", async () => {});
    it.skip("full text search", async () => {});
    it.skip("update tsvector", async () => {});
  });

  describe("PostgresqlGeometricTest", () => {
    it.skip("point column", async () => {});
    it.skip("point default", async () => {});
    it.skip("point type cast", async () => {});
    it.skip("point write", async () => {});
    it.skip("line column", async () => {});
    it.skip("line default", async () => {});
    it.skip("line type cast", async () => {});
    it.skip("line write", async () => {});
    it.skip("lseg column", async () => {});
    it.skip("lseg type cast", async () => {});
    it.skip("lseg write", async () => {});
    it.skip("box column", async () => {});
    it.skip("box type cast", async () => {});
    it.skip("box write", async () => {});
    it.skip("path column", async () => {});
    it.skip("path open", async () => {});
    it.skip("path closed", async () => {});
    it.skip("path type cast", async () => {});
    it.skip("path write", async () => {});
    it.skip("polygon column", async () => {});
    it.skip("polygon type cast", async () => {});
    it.skip("polygon write", async () => {});
    it.skip("circle column", async () => {});
    it.skip("circle type cast", async () => {});
    it.skip("circle write", async () => {});
    it.skip("geometric schema dump", async () => {});
    it.skip("geometric where", async () => {});
    it.skip("geometric invalid", async () => {});
    it.skip("geometric nil", async () => {});
    it.skip("mutation", () => {});
    it.skip("array assignment", () => {});
    it.skip("hash assignment", () => {});
    it.skip("string assignment", () => {});
    it.skip("empty string assignment", () => {});
    it.skip("array of points round trip", () => {});
    it.skip("legacy column", () => {});
    it.skip("legacy default", () => {});
    it.skip("legacy schema dumping", () => {});
    it.skip("legacy roundtrip", () => {});
    it.skip("legacy mutation", () => {});
    it.skip("geometric types", () => {});
    it.skip("alternative format", () => {});
    it.skip("geometric function", () => {});
    it.skip("geometric line type", () => {});
    it.skip("alternative format line type", () => {});
    it.skip("schema dumping for line type", () => {});
    it.skip("creating column with point type", () => {});
    it.skip("creating column with line type", () => {});
    it.skip("creating column with lseg type", () => {});
    it.skip("creating column with box type", () => {});
    it.skip("creating column with path type", () => {});
    it.skip("creating column with polygon type", () => {});
    it.skip("creating column with circle type", () => {});
  });

  describe("PostgresqlHstoreTest", () => {
    it.skip("column", async () => {});
    it.skip("default", async () => {});
    it.skip("change column default with hstore", async () => {});
    it.skip("type cast hstore", async () => {});
    it.skip("hstore nil", async () => {});
    it.skip("hstore with empty string", async () => {});
    it.skip("hstore with single quotes", async () => {});
    it.skip("hstore with double quotes", async () => {});
    it.skip("hstore with commas", async () => {});
    it.skip("hstore with special chars", async () => {});
    it.skip("hstore with unicode", async () => {});
    it.skip("hstore select", async () => {});
    it.skip("hstore rewrite", async () => {});
    it.skip("hstore with store accessors", async () => {});
    it.skip("hstore dirty tracking", async () => {});
    it.skip("hstore duplication", async () => {});
    it.skip("hstore mutate", async () => {});
    it.skip("hstore nested", async () => {});
    it.skip("hstore where", async () => {});
    it.skip("hstore where key", async () => {});
    it.skip("hstore where value", async () => {});
    it.skip("hstore contains", async () => {});
    it.skip("hstore contained", async () => {});
    it.skip("hstore keys", async () => {});
    it.skip("hstore values", async () => {});
    it.skip("hstore merge", async () => {});
    it.skip("hstore delete key", async () => {});
    it.skip("hstore delete keys", async () => {});
    it.skip("hstore concat", async () => {});
    it.skip("hstore replace", async () => {});
    it.skip("hstore to array", async () => {});
    it.skip("hstore each", async () => {});
    it.skip("hstore exists", async () => {});
    it.skip("hstore defined", async () => {});
    it.skip("hstore akeys", async () => {});
    it.skip("hstore avals", async () => {});
    it.skip("hstore skeys", async () => {});
    it.skip("hstore svals", async () => {});
    it.skip("hstore to json", async () => {});
    it.skip("hstore populate", async () => {});
    it.skip("hstore schema dump", async () => {});
    it.skip("hstore migration", async () => {});
    it.skip("hstore gen random uuid", async () => {});
    it.skip("hstore gen random uuid default", async () => {});
    it.skip("hstore fixture", async () => {});
    it.skip("hstore included in extensions", () => {});
    it.skip("disable enable hstore", () => {});
    it.skip("change table supports hstore", () => {});
    it.skip("cast value on write", () => {});
    it.skip("with store accessors", () => {});
    it.skip("duplication with store accessors", () => {});
    it.skip("yaml round trip with store accessors", () => {});
    it.skip("changes with store accessors", () => {});
    it.skip("changes in place", () => {});
    it.skip("dirty from user equal", () => {});
    it.skip("hstore dirty from database equal", () => {});
    it.skip("spaces", () => {});
    it.skip("commas", () => {});
    it.skip("signs", () => {});
    it.skip("various null", () => {});
    it.skip("equal signs", () => {});
    it.skip("parse5", () => {});
    it.skip("parse6", () => {});
    it.skip("parse7", () => {});
    it.skip("rewrite", () => {});
    it.skip("array cycle", () => {});
    it.skip("array strings with quotes", () => {});
    it.skip("array strings with commas", () => {});
    it.skip("array strings with array delimiters", () => {});
    it.skip("array strings with null strings", () => {});
    it.skip("select multikey", () => {});
    it.skip("nil", () => {});
    it.skip("quotes", () => {});
    it.skip("whitespace", () => {});
    it.skip("backslash", () => {});
    it.skip("comma", () => {});
    it.skip("arrow", () => {});
    it.skip("quoting special characters", () => {});
    it.skip("multiline", () => {});
    it.skip("hstore with serialized attributes", () => {});
    it.skip("clone hstore with serialized attributes", () => {});
    it.skip("supports to unsafe h values", () => {});
  });

  describe("PostgresqlInfinityTest", () => {
    it.skip("date positive infinity", async () => {});
    it.skip("date negative infinity", async () => {});
    it.skip("timestamp positive infinity", async () => {});
    it.skip("timestamp negative infinity", async () => {});
    it.skip("float positive infinity", async () => {});
    it.skip("float negative infinity", async () => {});
    it.skip("integer positive infinity", async () => {});
    it.skip("integer negative infinity", async () => {});
    it.skip("infinity where clause", async () => {});
    it.skip("type casting infinity on a float column", () => {});
    it.skip("type casting string on a float column", () => {});
    it.skip("update_all with infinity on a float column", () => {});
    it.skip("type casting infinity on a datetime column", () => {});
    it.skip("type casting infinity on a date column", () => {});
    it.skip("update_all with infinity on a datetime column", () => {});
    it.skip("assigning 'infinity' on a datetime column with TZ aware attributes", () => {});
    it.skip("where clause with infinite range on a datetime column", () => {});
    it.skip("where clause with infinite range on a date column", () => {});
  });

  describe("PostgresqlIntegerTest", () => {
    it.skip("integer types", async () => {});
    it.skip("schema properly respects bigint ranges", async () => {});
  });

  describe("PostgresqlIntervalTest", () => {
    it.skip("column", async () => {});
    it.skip("default", async () => {});
    it.skip("type cast interval", async () => {});
    it.skip("interval write", async () => {});
    it.skip("interval iso 8601", async () => {});
    it.skip("interval schema dump", async () => {});
    it.skip("interval where", async () => {});
    it.skip("interval type", () => {});
    it.skip("interval type cast from invalid string", () => {});
    it.skip("interval type cast from numeric", () => {});
    it.skip("interval type cast string and numeric from user", () => {});
    it.skip("average interval type", () => {});
    it.skip("schema dump with default value", () => {});
  });

  describe("PostgresqlInvertibleMigrationTest", () => {
    it.skip("up", async () => {});
    it.skip("down", async () => {});
    it.skip("change", async () => {});
    it.skip("revert", async () => {});
    it.skip("revert whole migration", async () => {});
    it.skip("migrate and revert", async () => {});
    it.skip("migrate revert add index with expression", () => {});
    it.skip("migrate revert create enum", () => {});
    it.skip("migrate revert drop enum", () => {});
    it.skip("migrate revert rename enum value", () => {});
    it.skip("migrate revert add and validate check constraint", () => {});
    it.skip("migrate revert add and validate foreign key", () => {});
  });

  describe("PostgresqlJsonTest", () => {
    it.skip("json column", async () => {});
    it.skip("json default", async () => {});
    it.skip("json type cast", async () => {});
    it.skip("deserialize with array", async () => {});
    it.skip("noname columns of different types", async () => {});
  });

  describe("PostgresqlLtreeTest", () => {
    it.skip("column", async () => {});
    it.skip("default", async () => {});
    it.skip("ltree query", async () => {});
    it.skip("ltree schema dump", async () => {});
    it.skip("write", async () => {});
    it.skip("select", async () => {});
  });

  describe("PostgresqlMoneyTest", () => {
    it.skip("column", async () => {});
    it.skip("default", async () => {});
    it.skip("money type cast", async () => {});
    it.skip("money write", async () => {});
    it.skip("money select", async () => {});
    it.skip("money arithmetic", async () => {});
    it.skip("money comparison", async () => {});
    it.skip("money schema dump", async () => {});
    it.skip("money where", async () => {});
    it.skip("money order", async () => {});
    it.skip("money sum", async () => {});
    it.skip("money format", async () => {});
    it.skip("money values", async () => {});
    it.skip("money regex backtracking", async () => {});
    it.skip("sum with type cast", async () => {});
    it.skip("pluck with type cast", async () => {});
    it.skip("create and update money", async () => {});
    it.skip("update all with money string", async () => {});
    it.skip("update all with money big decimal", async () => {});
    it.skip("update all with money numeric", async () => {});
  });

  describe("PostgresqlNetworkTest", () => {
    it.skip("inet column", async () => {});
    it.skip("inet type cast", async () => {});
    it.skip("inet write", async () => {});
    it.skip("inet where", async () => {});
    it.skip("cidr column", async () => {});
    it.skip("cidr type cast", async () => {});
    it.skip("macaddr column", async () => {});
    it.skip("macaddr type cast", async () => {});
    it.skip("network types", async () => {});
    it.skip("invalid network address", async () => {});
    it.skip("cidr change prefix", async () => {});
    it.skip("mac address change case does not mark dirty", async () => {});
  });

  describe("PostgresqlNumbersTest", () => {
    it.skip("numeric column", async () => {});
    it.skip("numeric default", async () => {});
    it.skip("numeric type cast", async () => {});
    it.skip("numeric nan", async () => {});
    it.skip("numeric infinity", async () => {});
    it.skip("data type", async () => {});
    it.skip("values", async () => {});
    it.skip("reassigning infinity does not mark record as changed", async () => {});
    it.skip("reassigning nan does not mark record as changed", async () => {});
  });

  describe("PostgresqlOptimizerHintsTest", () => {
    it.skip("optimizer hints", async () => {});
    it.skip("optimizer hints with count", async () => {});
    it.skip("optimizer hints with delete all", async () => {});
    it.skip("optimizer hints with update all", async () => {});
    it.skip("optimizer hints with pluck", async () => {});
  });

  describe("PostgresqlPartitionsTest", () => {
    it.skip("partition table", async () => {});
    it.skip("partitions table exists", async () => {});
  });

  describe("PostgreSQLAdapterPreventWritesTest", () => {
    it.skip("prevent writes insert", async () => {});
    it.skip("prevent writes update", async () => {});
    it.skip("prevent writes delete", async () => {});
    it.skip("prevent writes create table", async () => {});
    it.skip("prevent writes drop table", async () => {});
    it.skip("prevent writes allows select", async () => {});
    it.skip("prevent writes allows explain", async () => {});
    it.skip("prevent writes toggle", async () => {});
    it.skip("doesnt error when a read query with cursors is called while preventing writes", async () => {});
  });

  describe("PostgreSQLAdapterTest", () => {
    it("primary key", async () => {
      await adapter.exec(
        `CREATE TABLE "pk_test" ("id" SERIAL PRIMARY KEY, "name" TEXT)`
      );
      const rows = await adapter.execute(
        `SELECT column_name FROM information_schema.key_column_usage
         WHERE table_name = 'pk_test' AND constraint_name LIKE '%pkey'`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].column_name).toBe("id");
    });

    it("primary key returns nil for no pk", async () => {
      await adapter.exec(
        `CREATE TABLE "no_pk_test" ("name" TEXT, "value" INTEGER)`
      );
      const rows = await adapter.execute(
        `SELECT column_name FROM information_schema.key_column_usage
         WHERE table_name = 'no_pk_test' AND constraint_name LIKE '%pkey'`
      );
      expect(rows).toHaveLength(0);
    });

    it("exec no binds", async () => {
      const rows = await adapter.execute("SELECT 1 AS val");
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toBe(1);
    });

    it("exec with binds", async () => {
      const rows = await adapter.execute("SELECT ? AS val", [1]);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].val)).toBe(1);
    });

    it("exec typecasts bind vals", async () => {
      const rows = await adapter.execute("SELECT ? AS val", ["hello"]);
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toBe("hello");
    });

    it.skip("table alias length", async () => {});
    it.skip("partial index", async () => {});
    it.skip("expression index", async () => {});
    it.skip("index with opclass", async () => {});
    it.skip("pk and sequence for table with serial pk", async () => {});
    it.skip("pk and sequence for table with bigserial pk", async () => {});
    it.skip("pk and sequence for table with custom sequence", async () => {});
    it.skip("columns for distinct", async () => {});
    it.skip("columns for distinct with order", async () => {});
    it.skip("columns for distinct with order and a column prefix", async () => {});
    it.skip("translate exception class", async () => {});
    it.skip("translate exception unique violation", async () => {});
    it.skip("translate exception not null violation", async () => {});
    it.skip("translate exception foreign key violation", async () => {});
    it.skip("translate exception value too long", async () => {});
    it.skip("translate exception lock wait timeout", async () => {});
    it.skip("translate exception deadlock", async () => {});
    it.skip("translate exception numeric value out of range", async () => {});
    it.skip("translate exception invalid text representation", async () => {});
    it.skip("translate exception query cancelled", async () => {});
    it.skip("translate exception serialization failure", async () => {});
    it.skip("type map", async () => {});
    it.skip("type map for results", async () => {});
    it.skip("only reload type map once for every unrecognized type", async () => {});
    it.skip("only warn on first encounter of unrecognized oid", async () => {});
    it.skip("extension enabled", async () => {});
    it.skip("extension available", async () => {});
    it.skip("extension enabled returns false for nonexistent", async () => {});
    it.skip("enable extension", async () => {});
    it.skip("disable extension", async () => {});
    it.skip("prepared statements", async () => {});
    it.skip("prepared statements with multiple binds", async () => {});
    it.skip("prepared statements disabled", async () => {});
    it.skip("default prepared statements", async () => {});
    it.skip("date time decoding", async () => {});
    it.skip("date decoding", async () => {});
    it.skip("time decoding", async () => {});
    it.skip("timestamp decoding", async () => {});
    it.skip("timestamp with time zone decoding", async () => {});
    it.skip("interval decoding", async () => {});
    it.skip("money decoding", async () => {});
    it.skip("boolean decoding", async () => {});
    it.skip("oid decoding", async () => {});
    it.skip("float decoding", async () => {});
    it.skip("integer decoding", async () => {});
    it.skip("bigint decoding", async () => {});
    it.skip("numeric decoding", async () => {});
    it.skip("json decoding", async () => {});
    it.skip("jsonb decoding", async () => {});
    it.skip("hstore decoding", async () => {});
    it.skip("array decoding", async () => {});
    it.skip("uuid decoding", async () => {});
    it.skip("xml decoding", async () => {});
    it.skip("cidr decoding", async () => {});
    it.skip("inet decoding", async () => {});
    it.skip("macaddr decoding", async () => {});
    it.skip("point decoding", async () => {});
    it.skip("bit decoding", async () => {});
    it.skip("range decoding", async () => {});
    it.skip("bad connection to postgres database", async () => {});
    it.skip("reconnect after bad connection on check version", async () => {});
    it.skip("primary key works tables containing capital letters", async () => {});
    it.skip("non standard primary key", async () => {});
    it.skip("exec insert with returning disabled and no sequence name given", async () => {});
    it.skip("exec insert default values with returning disabled and no sequence name given", async () => {});
    it.skip("exec insert default values quoted schema with returning disabled and no sequence name given", async () => {});
    it.skip("serial sequence", async () => {});
    it.skip("default sequence name", async () => {});
    it.skip("default sequence name bad table", async () => {});
    it.skip("pk and sequence for with non standard primary key", async () => {});
    it.skip("pk and sequence for returns nil if no seq", async () => {});
    it.skip("pk and sequence for returns nil if no pk", async () => {});
    it.skip("pk and sequence for returns nil if table not found", async () => {});
    it.skip("pk and sequence for with collision pg class oid", async () => {});
    it.skip("partial index on column named like keyword", async () => {});
    it.skip("include index", async () => {});
    it.skip("include multiple columns index", async () => {});
    it.skip("include keyword column name", async () => {});
    it.skip("include escaped quotes column name", async () => {});
    it.skip("invalid index", async () => {});
    it.skip("index with not distinct nulls", async () => {});
    it.skip("columns for distinct with nulls", async () => {});
    it.skip("columns for distinct without order specifiers", async () => {});
    it.skip("raise error when cannot translate exception", async () => {});
    it.skip("translate no connection exception to not established", async () => {});
    it.skip("reload type map for newly defined types", async () => {});
    it.skip("unparsed defaults are at least set when saving", async () => {});
    it.skip("only check for insensitive comparison capability once", async () => {});
    it.skip("extensions omits current schema name", async () => {});
    it.skip("extensions includes non current schema name", async () => {});
    it.skip("ignores warnings when behaviour ignore", async () => {});
    it.skip("logs warnings when behaviour log", async () => {});
    it.skip("raises warnings when behaviour raise", async () => {});
    it.skip("reports when behaviour report", async () => {});
    it.skip("warnings behaviour can be customized with a proc", async () => {});
    it.skip("allowlist of warnings to ignore", async () => {});
    it.skip("allowlist of warning codes to ignore", async () => {});
    it.skip("does not raise notice level warnings", async () => {});
    it.skip("date decoding enabled", async () => {});
    it.skip("date decoding disabled", async () => {});
    it.skip("disable extension with schema", async () => {});
    it.skip("disable extension without schema", async () => {});
  });

  describe("PostgresqlPreparedStatementsDisabledTest", () => {
    it.skip("prepared statements disabled", async () => {});
    it.skip("select query works even when prepared statements are disabled", async () => {});
  });

  describe("PostgresqlQuotingTest", () => {
    it("type cast true", async () => {
      const rows = await adapter.execute("SELECT TRUE AS val");
      expect(rows[0].val).toBe(true);
    });

    it("type cast false", async () => {
      const rows = await adapter.execute("SELECT FALSE AS val");
      expect(rows[0].val).toBe(false);
    });

    it("quote float nan", async () => {
      const rows = await adapter.execute("SELECT 'NaN'::float AS val");
      expect(rows[0].val).toBeNaN();
    });

    it("quote float infinity", async () => {
      const rows = await adapter.execute("SELECT 'Infinity'::float AS val");
      expect(rows[0].val).toBe(Infinity);
    });

    it("quote string", async () => {
      const rows = await adapter.execute("SELECT ? AS val", ["hello"]);
      expect(rows[0].val).toBe("hello");
    });

    it("quote column name", async () => {
      await adapter.exec(
        `CREATE TABLE "quoting_test" ("id" SERIAL PRIMARY KEY, "select" TEXT)`
      );
      await adapter.executeMutation(
        `INSERT INTO "quoting_test" ("select") VALUES ('works')`
      );
      const rows = await adapter.execute(
        `SELECT "select" FROM "quoting_test"`
      );
      expect(rows[0].select).toBe("works");
    });

    it("quote table name", async () => {
      await adapter.exec(
        `CREATE TABLE "quoting_test" ("id" SERIAL PRIMARY KEY, "val" TEXT)`
      );
      const rows = await adapter.execute(
        `SELECT * FROM "quoting_test"`
      );
      expect(rows).toHaveLength(0);
    });

    it.skip("quote table name with schema", async () => {});
    it.skip("quote unicode string", async () => {});
    it.skip("quote binary", async () => {});
    it.skip("quote date", async () => {});
    it.skip("quote time", async () => {});
    it.skip("quote timestamp", async () => {});
    it.skip("quote duration", async () => {});
    it.skip("quote range", async () => {});
    it.skip("quote array", async () => {});
    it.skip("quote integer", async () => {});
    it.skip("quote big decimal", async () => {});
    it.skip("quote rational", async () => {});
    it.skip("quote bit string", async () => {});
    it.skip("quote table name with spaces", async () => {});
    it.skip("raise when int is wider than 64bit", async () => {});
    it.skip("do not raise when int is not wider than 64bit", async () => {});
    it.skip("do not raise when raise int wider than 64bit is false", async () => {});
  });

  describe("PostgresqlRangeTest", () => {
    it.skip("int4range column", async () => {});
    it.skip("int4range default", async () => {});
    it.skip("int4range type cast", async () => {});
    it.skip("int4range write", async () => {});
    it.skip("int4range where", async () => {});
    it.skip("int4range contains", async () => {});
    it.skip("int4range empty", async () => {});
    it.skip("int4range infinity", async () => {});
    it.skip("int8range column", async () => {});
    it.skip("int8range type cast", async () => {});
    it.skip("int8range write", async () => {});
    it.skip("numrange column", async () => {});
    it.skip("numrange type cast", async () => {});
    it.skip("numrange write", async () => {});
    it.skip("tsrange column", async () => {});
    it.skip("tsrange type cast", async () => {});
    it.skip("tsrange write", async () => {});
    it.skip("tstzrange column", async () => {});
    it.skip("tstzrange type cast", async () => {});
    it.skip("tstzrange write", async () => {});
    it.skip("daterange column", async () => {});
    it.skip("daterange type cast", async () => {});
    it.skip("daterange write", async () => {});
    it.skip("custom range column", async () => {});
    it.skip("custom range type cast", async () => {});
    it.skip("custom range write", async () => {});
    it.skip("range schema dump", async () => {});
    it.skip("range migration", async () => {});
    it.skip("multirange int4", async () => {});
    it.skip("multirange int8", async () => {});
    it.skip("multirange num", async () => {});
    it.skip("multirange ts", async () => {});
    it.skip("multirange tstz", async () => {});
    it.skip("multirange date", async () => {});
    it.skip("range intersection", async () => {});
    it.skip("range union", async () => {});
    it.skip("range difference", async () => {});
    it.skip("range adjacent", async () => {});
    it.skip("range overlaps", async () => {});
    it.skip("range strictly left of", async () => {});
    it.skip("range strictly right of", async () => {});
    it.skip("range does not extend left of", async () => {});
    it.skip("range does not extend right of", async () => {});
    it.skip("range upper bound", async () => {});
    it.skip("range lower bound", async () => {});
    it.skip("data type of range types", () => {});
    it.skip("int4range values", () => {});
    it.skip("int8range values", () => {});
    it.skip("daterange values", () => {});
    it.skip("numrange values", () => {});
    it.skip("tsrange values", () => {});
    it.skip("tstzrange values", () => {});
    it.skip("custom range values", () => {});
    it.skip("timezone awareness tzrange", () => {});
    it.skip("timezone awareness endless tzrange", () => {});
    it.skip("timezone awareness beginless tzrange", () => {});
    it.skip("timezone array awareness tzrange", () => {});
    it.skip("create tstzrange", () => {});
    it.skip("update tstzrange", () => {});
    it.skip("escaped tstzrange", () => {});
    it.skip("unbounded tstzrange", () => {});
    it.skip("create tsrange", () => {});
    it.skip("update tsrange", () => {});
    it.skip("escaped tsrange", () => {});
    it.skip("unbounded tsrange", () => {});
    it.skip("timezone awareness tsrange", () => {});
    it.skip("timezone awareness endless tsrange", () => {});
    it.skip("timezone awareness beginless tsrange", () => {});
    it.skip("timezone array awareness tsrange", () => {});
    it.skip("create tstzrange preserve usec", () => {});
    it.skip("update tstzrange preserve usec", () => {});
    it.skip("create tsrange preserve usec", () => {});
    it.skip("update tsrange preserve usec", () => {});
    it.skip("timezone awareness tsrange preserve usec", () => {});
    it.skip("create numrange", () => {});
    it.skip("update numrange", () => {});
    it.skip("create daterange", () => {});
    it.skip("update daterange", () => {});
    it.skip("create int4range", () => {});
    it.skip("update int4range", () => {});
    it.skip("create int8range", () => {});
    it.skip("update int8range", () => {});
    it.skip("exclude beginning for subtypes without succ method is not supported", () => {});
    it.skip("where by attribute with range", () => {});
    it.skip("where by attribute with range in array", () => {});
    it.skip("update all with ranges", () => {});
    it.skip("ranges correctly escape input", () => {});
    it.skip("ranges correctly unescape output", () => {});
    it.skip("infinity values", () => {});
    it.skip("endless range values", () => {});
    it.skip("empty string range values", () => {});
  });

  describe("PostgresqlReferentialIntegrityTest", () => {
    it.skip("disable referential integrity", async () => {});
    it.skip("enable referential integrity", async () => {});
    it.skip("disable and enable referential integrity", async () => {});
    it.skip("foreign key violation without disable", async () => {});
    it.skip("foreign key violation with disable", async () => {});
    it.skip("truncate with cascade", async () => {});
    it.skip("should reraise invalid foreign key exception and show warning", () => {});
    it.skip("does not print warning if no invalid foreign key exception was raised", () => {});
    it.skip("does not break transactions", () => {});
    it.skip("does not break nested transactions", () => {});
    it.skip("only catch active record errors others bubble up", () => {});
    it.skip("all foreign keys valid having foreign keys in multiple schemas", () => {});
  });

  describe("PostgresqlRenameTableTest", () => {
    it.skip("rename table", async () => {});
    it.skip("rename table with index", async () => {});
    it.skip("rename table with sequence", async () => {});
    it.skip("rename table preserves data", async () => {});
    it.skip("renaming a table with uuid primary key and uuid_generate_v4() default also renames the primary key index", async () => {});
    it.skip("renaming a table with uuid primary key and gen_random_uuid() default also renames the primary key index", async () => {});
    it.skip("renaming a table also renames the primary key sequence", () => {});
    it.skip("renaming a table also renames the primary key index", () => {});
  });

  describe("PostgresqlSchemaAuthorizationTest", () => {
    it.skip("schema authorization", async () => {});
    it.skip("schema authorization with quoted names", async () => {});
    it.skip("session authorization", async () => {});
    it.skip("reset authorization", async () => {});
    it.skip("sequence schema authorization", async () => {});
    it.skip("tables schema authorization", async () => {});
    it.skip("schema invisible", () => {});
    it.skip("session auth=", () => {});
    it.skip("setting auth clears stmt cache", () => {});
    it.skip("auth with bind", () => {});
    it.skip("sequence schema caching", () => {});
    it.skip("tables in current schemas", () => {});
  });

  describe("PostgresqlSchemaTest", () => {
    it.skip("schema test 1", async () => {});
    it.skip("schema test 2", async () => {});
    it.skip("schema test 3", async () => {});
    it.skip("schema names", () => {});
    it.skip("create schema", () => {});
    it.skip("raise create schema with existing schema", () => {});
    it.skip("force create schema", () => {});
    it.skip("create schema if not exists", () => {});
    it.skip("create schema raises if both force and if not exists provided", () => {});
    it.skip("drop schema", () => {});
    it.skip("drop schema if exists", () => {});
    it.skip("habtm table name with schema", () => {});
    it.skip("drop schema with nonexisting schema", () => {});
    it.skip("raise wrapped exception on bad prepare", () => {});
    it.skip("schema change with prepared stmt", () => {});
    it.skip("data source exists when on schema search path", () => {});
    it.skip("data source exists when not on schema search path", () => {});
    it.skip("data source exists quoted names", () => {});
    it.skip("data source exists quoted table", () => {});
    it.skip("with schema prefixed table name", () => {});
    it.skip("with schema prefixed capitalized table name", () => {});
    it.skip("with schema search path", () => {});
    it.skip("proper encoding of table name", () => {});
    it.skip("where with qualified schema name", () => {});
    it.skip("pluck with qualified schema name", () => {});
    it.skip("classes with qualified schema name", () => {});
    it.skip("raise on unquoted schema name", () => {});
    it.skip("without schema search path", () => {});
    it.skip("ignore nil schema search path", () => {});
    it.skip("index name exists", () => {});
    it.skip("dump indexes for schema one", () => {});
    it.skip("dump indexes for schema two", () => {});
    it.skip("dump indexes for schema multiple schemas in search path", () => {});
    it.skip("dump indexes for table with scheme specified in name", () => {});
    it.skip("with uppercase index name", () => {});
    it.skip("remove index when schema specified", () => {});
    it.skip("primary key with schema specified", () => {});
    it.skip("primary key assuming schema search path", () => {});
    it.skip("pk and sequence for with schema specified", () => {});
    it.skip("current schema", () => {});
    it.skip("prepared statements with multiple schemas", () => {});
    it.skip("schema exists?", () => {});
    it.skip("set pk sequence", () => {});
    it.skip("rename index", () => {});
    it.skip("dumping schemas", () => {});
    it.skip("dump foreign key targeting different schema", () => {});
    it.skip("create foreign key same schema", () => {});
    it.skip("create foreign key different schemas", () => {});
    it.skip("string opclass is dumped", () => {});
    it.skip("non default opclass is dumped", () => {});
    it.skip("opclass class parsing on non reserved and cannot be function or type keyword", () => {});
    it.skip("nulls order is dumped", () => {});
    it.skip("non default order with nulls is dumped", () => {});
    it.skip("text defaults in new schema when overriding domain", () => {});
    it.skip("string defaults in new schema when overriding domain", () => {});
    it.skip("decimal defaults in new schema when overriding domain", () => {});
    it.skip("bpchar defaults in new schema when overriding domain", () => {});
    it.skip("text defaults after updating column default", () => {});
    it.skip("default containing quote and colons", () => {});
    it.skip("rename_table", () => {});
    it.skip("Active Record basics", () => {});
    it.skip("create join table", () => {});
    it.skip("schema dumps index included columns", () => {});
    it.skip("nulls not distinct is dumped", () => {});
    it.skip("nulls distinct is dumped", () => {});
    it.skip("nulls not set is dumped", () => {});
    it.skip("list partition options is dumped", () => {});
    it.skip("range partition options is dumped", () => {});
    it.skip("inherited table options is dumped", () => {});
    it.skip("multiple inherited table options is dumped", () => {});
    it.skip("no partition options are dumped", () => {});
  });

  describe("PostgresqlSerialTest", () => {
    it.skip("serial column", async () => {});
    it.skip("bigserial column", async () => {});
    it.skip("smallserial column", async () => {});
    it.skip("serial default", async () => {});
    it.skip("serial sequence name", async () => {});
    it.skip("serial schema dump", async () => {});
    it.skip("serial migration", async () => {});
    it.skip("serial primary key", async () => {});
    it.skip("bigserial primary key", async () => {});
    it.skip("serial not null", async () => {});
    it.skip("serial reset", async () => {});
    it.skip("serial custom sequence", async () => {});
    it.skip("not serial column", async () => {});
    it.skip("schema dump with not serial", async () => {});
    it.skip("not bigserial column", async () => {});
    it.skip("schema dump with not bigserial", async () => {});
    it.skip("serial columns", async () => {});
    it.skip("serial columns 2", async () => {});
    it.skip("schema dump with collided sequence name", async () => {});
    it.skip("schema dump with long table name", async () => {});
  });

  describe("PostgresqlStatementPoolTest", () => {
    it.skip("statement pool", async () => {});
    it.skip("statement pool max", async () => {});
    it.skip("statement pool clear", async () => {});
    it.skip("dealloc does not raise on inactive connection", async () => {});
    it.skip("prepared statements do not get stuck on query interruption", async () => {});
  });

  describe("PostgresqlTimestampTest", () => {
    it.skip("timestamp column", async () => {});
    it.skip("timestamp default", async () => {});
    it.skip("timestamp type cast", async () => {});
    it.skip("timestamp with time zone", async () => {});
    it.skip("timestamp precision", async () => {});
    it.skip("timestamp infinity", async () => {});
    it.skip("timestamp before epoch", async () => {});
    it.skip("timestamp schema dump", async () => {});
    it.skip("timestamp migration", async () => {});
    it.skip("datetime column", async () => {});
    it.skip("datetime default", async () => {});
    it.skip("datetime type cast", async () => {});
    it.skip("datetime precision", async () => {});
    it.skip("datetime schema dump", async () => {});
    it.skip("timestamp with zone values with rails time zone support and no time zone set", () => {});
    it.skip("timestamp with zone values without rails time zone support", () => {});
    it.skip("timestamp with zone values with rails time zone support and time zone set", () => {});
    it.skip("timestamp with zone values with rails time zone support and timestamptz and no time zone set", () => {});
    it.skip("timestamp with zone values with rails time zone support and timestamptz and time zone set", () => {});
    it.skip("group by date", () => {});
    it.skip("bc timestamp", () => {});
    it.skip("bc timestamp leap year", () => {});
    it.skip("bc timestamp year zero", () => {});
    it.skip("adds column as timestamp", () => {});
    it.skip("adds column as timestamptz if datetime type changed", () => {});
    it.skip("adds column as custom type", () => {});
  });

  describe("PostgresqlTransactionNestedTest", () => {
    it.skip("nested transaction rollback", async () => {});
    it.skip("nested transaction commit", async () => {});
    it.skip("double nested transaction", async () => {});
    it.skip("nested transaction with savepoint", async () => {});
    it.skip("unserializable transaction raises SerializationFailure inside nested SavepointTransaction", async () => {});
    it.skip("SerializationFailure inside nested SavepointTransaction is recoverable", async () => {});
    it.skip("deadlock raises Deadlocked inside nested SavepointTransaction", async () => {});
  });

  describe("PostgresqlTransactionTest", () => {
    it.skip("transaction isolation read committed", async () => {});
    it.skip("transaction isolation repeatable read", async () => {});
    it.skip("transaction isolation serializable", async () => {});
    it.skip("transaction read only", async () => {});
    it.skip("transaction deferrable", async () => {});
    it.skip("transaction rollback on exception", async () => {});
    it.skip("raises SerializationFailure when a serialization failure occurs", async () => {});
    it.skip("raises QueryCanceled when statement timeout exceeded", async () => {});
    it.skip("raises Interrupt when canceling statement via interrupt", async () => {});
  });

  describe("PostgresqlTypeLookupTest", () => {
    it.skip("type lookup", async () => {});
    it.skip("type lookup array", async () => {});
    it.skip("type lookup custom", async () => {});
    it.skip("array delimiters are looked up correctly", () => {});
    it.skip("array types correctly respect registration of subtypes", () => {});
    it.skip("range types correctly respect registration of subtypes", () => {});
  });

  describe("PostgresqlUtilsTest", () => {
    it.skip("reset pk sequence", async () => {});
    it.skip("reset pk sequence on empty table", async () => {});
    it.skip("reset pk sequence with custom pk", async () => {});
    it.skip("pk and sequence for", async () => {});
    it.skip("distinct zero", async () => {});
    it.skip("distinct one", async () => {});
    it.skip("distinct multiple", async () => {});
    it.skip("extract schema qualified name", () => {});
    it.skip("represents itself as schema.name", () => {});
    it.skip("without schema, represents itself as name only", () => {});
    it.skip("quoted returns a string representation usable in a query", () => {});
    it.skip("prevents double quoting", () => {});
    it.skip("equality based on state", () => {});
    it.skip("can be used as hash key", () => {});
  });

  describe("PostgresqlUUIDTest", () => {
    it.skip("uuid column", async () => {});
    it.skip("uuid default", async () => {});
    it.skip("uuid type cast", async () => {});
    it.skip("uuid write", async () => {});
    it.skip("uuid select", async () => {});
    it.skip("uuid where", async () => {});
    it.skip("uuid order", async () => {});
    it.skip("uuid pluck", async () => {});
    it.skip("uuid primary key", async () => {});
    it.skip("uuid primary key default", async () => {});
    it.skip("uuid primary key insert", async () => {});
    it.skip("uuid pk with auto populate", async () => {});
    it.skip("uuid pk create", async () => {});
    it.skip("uuid pk find", async () => {});
    it.skip("uuid schema dump", async () => {});
    it.skip("uuid migration", async () => {});
    it.skip("uuid gen random uuid", async () => {});
    it.skip("uuid gen random uuid default", async () => {});
    it.skip("uuid invalid", async () => {});
    it.skip("uuid nil", async () => {});
    it.skip("uuid blank", async () => {});
    it.skip("uuid uniqueness", async () => {});
    it.skip("uuid array", async () => {});
    it.skip("uuid in relation", async () => {});
    it.skip("uuid association", async () => {});
    it.skip("uuid foreign key", async () => {});
    it.skip("uuid index", async () => {});
    it.skip("uuid change column", async () => {});
    it.skip("uuid remove column", async () => {});
    it.skip("uuid column default", () => {});
    it.skip("change column default", () => {});
    it.skip("add column with null true and default nil", () => {});
    it.skip("add column with default array", () => {});
    it.skip("data type of uuid types", () => {});
    it.skip("treat blank uuid as nil", () => {});
    it.skip("treat invalid uuid as nil", () => {});
    it.skip("invalid uuid dont modify before type cast", () => {});
    it.skip("invalid uuid dont match to nil", () => {});
    it.skip("uuid change format does not mark dirty", () => {});
    it.skip("acceptable uuid regex", () => {});
    it.skip("uuid formats", () => {});
    it.skip("uniqueness validation ignores uuid", () => {});
    it.skip("id is uuid", () => {});
    it.skip("id has a default", () => {});
    it.skip("auto create uuid", () => {});
    it.skip("pk and sequence for uuid primary key", () => {});
    it.skip("schema dumper for uuid primary key", () => {});
    it.skip("schema dumper for uuid primary key with custom default", () => {});
    it.skip("schema dumper for uuid primary key default", () => {});
    it.skip("schema dumper for uuid primary key default in legacy migration", () => {});
    it.skip("id allows default override via nil", () => {});
    it.skip("schema dumper for uuid primary key with default override via nil", () => {});
    it.skip("schema dumper for uuid primary key with default nil in legacy migration", () => {});
    it.skip("collection association with uuid", () => {});
    it.skip("find with uuid", () => {});
    it.skip("find by with uuid", () => {});
    it.skip("uuid primary key and disable joins with delegate cache", () => {});
  });

  describe("PostgresqlVirtualColumnTest", () => {
    it.skip("virtual column", async () => {});
    it.skip("virtual column default", async () => {});
    it.skip("virtual column type cast", async () => {});
    it.skip("virtual column write", async () => {});
    it.skip("virtual column schema dump", async () => {});
    it.skip("virtual column migration", async () => {});
    it.skip("virtual column stored", async () => {});
    it.skip("non persisted column", async () => {});
  });

  describe("PostgresqlXmlTest", () => {
    it.skip("xml column", async () => {});
    it.skip("xml default", async () => {});
    it.skip("xml type cast", async () => {});
    it.skip("xml write", async () => {});
    it.skip("xml schema dump", async () => {});
    it.skip("null xml", async () => {});
    it.skip("round trip", async () => {});
  });
});
