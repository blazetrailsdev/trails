import { describe, it, expect, beforeEach, afterEach } from "vitest";
import pg from "pg";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";
import {
  Base,
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
const PG_TEST_URL = process.env.PG_TEST_URL ?? "postgres://localhost:5432/rails_js_test";

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

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
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
      await adapter.exec('DROP TABLE IF EXISTS "users" CASCADE');
      await adapter.exec('CREATE TABLE "users" ("id" SERIAL PRIMARY KEY, "name" TEXT)');
      await adapter.executeMutation(`INSERT INTO "users" ("name") VALUES ('Alice')`);
      const rows = await adapter.execute('SELECT * FROM "users"');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Alice");
    });

    it("returns last insert id for INSERT", async () => {
      await adapter.exec('CREATE TABLE "items" ("id" SERIAL PRIMARY KEY, "name" TEXT)');
      const id1 = await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('A')`);
      const id2 = await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('B')`);
      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it("returns affected rows for UPDATE", async () => {
      await adapter.exec(
        'CREATE TABLE "items" ("id" SERIAL PRIMARY KEY, "name" TEXT, "active" INTEGER DEFAULT 1)',
      );
      await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('A')`);
      await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('B')`);
      const affected = await adapter.executeMutation('UPDATE "items" SET "active" = 0');
      expect(affected).toBe(2);
    });

    it("returns affected rows for DELETE", async () => {
      await adapter.exec('CREATE TABLE "items" ("id" SERIAL PRIMARY KEY, "name" TEXT)');
      await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('A')`);
      await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('B')`);
      const deleted = await adapter.executeMutation(`DELETE FROM "items" WHERE "name" = 'A'`);
      expect(deleted).toBe(1);
    });

    it("supports parameterized queries with ? binds", async () => {
      await adapter.exec(
        'CREATE TABLE "items" ("id" SERIAL PRIMARY KEY, "name" TEXT, "price" INTEGER)',
      );
      await adapter.executeMutation(`INSERT INTO "items" ("name", "price") VALUES ('A', 10)`);
      await adapter.executeMutation(`INSERT INTO "items" ("name", "price") VALUES ('B', 20)`);
      await adapter.executeMutation(`INSERT INTO "items" ("name", "price") VALUES ('C', 30)`);

      // ? gets rewritten to $1
      const rows = await adapter.execute('SELECT * FROM "items" WHERE "price" > ?', [15]);
      expect(rows).toHaveLength(2);
    });
  });

  // -- Transactions --
  describe("transactions", () => {
    beforeEach(async () => {
      await adapter.exec(
        'CREATE TABLE "accounts" ("id" SERIAL PRIMARY KEY, "name" TEXT, "balance" INTEGER)',
      );
    });

    it("commits on success", async () => {
      await adapter.beginTransaction();
      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Alice', 100)`,
      );
      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Bob', 200)`,
      );
      await adapter.commit();

      const rows = await adapter.execute('SELECT * FROM "accounts"');
      expect(rows).toHaveLength(2);
    });

    it("rolls back on failure", async () => {
      await adapter.beginTransaction();
      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Alice', 100)`,
      );
      await adapter.rollback();

      const rows = await adapter.execute('SELECT * FROM "accounts"');
      expect(rows).toHaveLength(0);
    });

    it("savepoints allow partial rollback", async () => {
      await adapter.beginTransaction();
      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Alice', 100)`,
      );

      await adapter.createSavepoint("sp1");
      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Bob', 200)`,
      );
      await adapter.rollbackToSavepoint("sp1");

      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Charlie', 300)`,
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
      expect(found.name).toBe("Alice");
      expect(found.email).toBe("alice@test.com");
      expect(found.age).toBe(30);
    });

    it("updates records", async () => {
      const user = await User.create({
        name: "Alice",
        email: "alice@test.com",
        age: 30,
      });
      await user.update({ name: "Alicia", age: 31 });

      const found = await User.find(user.id);
      expect(found.name).toBe("Alicia");
      expect(found.age).toBe(31);
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
      expect(found!.email).toBe("bob@test.com");
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
      expect(found.email).toBeNull();
      expect(found.age).toBeNull();
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
      const items = await Product.where({ category: "fruit" }).where({ name: "Apple" }).toArray();
      expect(items).toHaveLength(1);
    });

    it("order sorts correctly", async () => {
      const items = await Product.all().order({ price: "desc" }).toArray();
      expect(items[0].name).toBe("Eggplant");
      expect(items[4].name).toBe("Apple");
    });

    it("limit and offset", async () => {
      const items = await Product.all().order("name").limit(2).offset(1).toArray();
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
      expect(apple.price).toBe(99);
      // Vegetable unchanged
      const carrot = await Product.find(3);
      expect(carrot.price).toBe(3);
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

      const rows = await adapter.execute('SELECT * FROM "accounts" ORDER BY "name"');
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
      expect(loaded!.name).toBe("Tolkien");
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
      await adapter.exec('CREATE TABLE "items" ("id" SERIAL PRIMARY KEY, "name" TEXT)');

      const id1 = await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('first')`);
      const id2 = await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('second')`);
      const id3 = await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('third')`);

      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);
    });

    it("handles explicit RETURNING clause", async () => {
      await adapter.exec(
        'CREATE TABLE "items" ("id" SERIAL PRIMARY KEY, "name" TEXT, "code" TEXT)',
      );

      // executeMutation with explicit RETURNING should return the specified column
      const result = await adapter.executeMutation(
        `INSERT INTO "items" ("name", "code") VALUES ('test', 'ABC') RETURNING "id"`,
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
        `INSERT INTO "items" ("name", "count", "active", "price") VALUES ('Widget', 42, true, 9.99)`,
      );

      const rows = await adapter.execute('SELECT * FROM "items"');
      expect(rows[0].name).toBe("Widget");
      expect(rows[0].count).toBe(42);
      expect(rows[0].active).toBe(true);
      expect(rows[0].price).toBeCloseTo(9.99);
    });
  });

  // ── Rails-matching test stubs ──
});
