import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteAdapter } from "./sqlite-adapter.js";
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

describe("SqliteAdapter", () => {
  let adapter: SqliteAdapter;

  beforeEach(() => {
    adapter = new SqliteAdapter(":memory:");
  });

  afterEach(() => {
    adapter.close();
  });

  // -- Basic adapter operations --
  describe("raw SQL execution", () => {
    it("creates tables and inserts data", async () => {
      adapter.exec(`CREATE TABLE "users" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
      await adapter.executeMutation(`INSERT INTO "users" ("name") VALUES ('Alice')`);
      const rows = await adapter.execute(`SELECT * FROM "users"`);
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Alice");
    });

    it("returns last insert rowid for INSERT", async () => {
      adapter.exec(`CREATE TABLE "items" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
      const id1 = await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('A')`);
      const id2 = await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('B')`);
      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it("returns affected rows for UPDATE", async () => {
      adapter.exec(
        `CREATE TABLE "items" ("id" INTEGER PRIMARY KEY, "name" TEXT, "active" INTEGER DEFAULT 1)`,
      );
      await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('A')`);
      await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('B')`);
      const affected = await adapter.executeMutation(`UPDATE "items" SET "active" = 0`);
      expect(affected).toBe(2);
    });

    it("returns affected rows for DELETE", async () => {
      adapter.exec(`CREATE TABLE "items" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
      await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('A')`);
      await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('B')`);
      const deleted = await adapter.executeMutation(`DELETE FROM "items" WHERE "name" = 'A'`);
      expect(deleted).toBe(1);
    });
  });

  // -- Transactions --
  describe("transactions", () => {
    beforeEach(() => {
      adapter.exec(
        `CREATE TABLE "accounts" ("id" INTEGER PRIMARY KEY, "name" TEXT, "balance" INTEGER)`,
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

      const rows = await adapter.execute(`SELECT * FROM "accounts"`);
      expect(rows).toHaveLength(2);
    });

    it("rolls back on failure", async () => {
      await adapter.beginTransaction();
      await adapter.executeMutation(
        `INSERT INTO "accounts" ("name", "balance") VALUES ('Alice', 100)`,
      );
      await adapter.rollback();

      const rows = await adapter.execute(`SELECT * FROM "accounts"`);
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

      const rows = await adapter.execute(`SELECT * FROM "accounts"`);
      expect(rows).toHaveLength(2);
      const names = rows.map((r) => r.name);
      expect(names).toContain("Alice");
      expect(names).toContain("Charlie");
      expect(names).not.toContain("Bob");
    });
  });

  // -- ActiveRecord Base with real SQLite --
  describe("Base integration", () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.attribute("age", "integer");
      }
    }

    beforeEach(() => {
      adapter.exec(`
        CREATE TABLE "users" (
          "id" INTEGER PRIMARY KEY AUTOINCREMENT,
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
      await User.create({
        name: "Alice",
        email: "alice@test.com",
        age: 30,
      });
      await User.create({
        name: "Bob",
        email: "bob@test.com",
        age: 25,
      });

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

    it("reloads from database", async () => {
      const user = await User.create({
        name: "Original",
        email: "test@test.com",
        age: 20,
      });

      // Update via raw SQL
      adapter.exec(`UPDATE "users" SET "name" = 'Modified' WHERE "id" = ${user.id}`);

      expect(user.readAttribute("name")).toBe("Original");
      await user.reload();
      expect(user.readAttribute("name")).toBe("Modified");
    });
  });

  // -- Relation with real SQLite --
  describe("Relation integration", () => {
    class Product extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("price", "integer");
        this.attribute("category", "string");
      }
    }

    beforeEach(async () => {
      adapter.exec(`
        CREATE TABLE "products" (
          "id" INTEGER PRIMARY KEY AUTOINCREMENT,
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
      expect(items[0].readAttribute("name")).toBe("Eggplant");
      expect(items[4].readAttribute("name")).toBe("Apple");
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

  // -- Migrations with real SQLite --
  describe("Migration integration", () => {
    it("creates tables with migrations", async () => {
      class CreatePosts extends Migration {
        async up() {
          await this.createTable("posts", (t) => {
            t.string("title", { null: false });
            t.text("body");
            t.integer("author_id");
            t.boolean("published", { default: false });
            t.timestamps();
          });
        }

        async down() {
          await this.dropTable("posts");
        }
      }

      const migration = new CreatePosts();
      await migration.run(adapter, "up");

      // Verify table exists
      const id = await adapter.executeMutation(
        `INSERT INTO "posts" ("title", "body", "author_id", "published", "created_at", "updated_at") VALUES ('Test', 'Body', 1, 0, '2024-01-01', '2024-01-01')`,
      );
      expect(id).toBe(1);

      const rows = await adapter.execute(`SELECT * FROM "posts"`);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Test");

      // Rollback
      await migration.run(adapter, "down");
      await expect(adapter.execute(`SELECT * FROM "posts"`)).rejects.toThrow();
    });

    it("adds columns with migrations", async () => {
      adapter.exec(`CREATE TABLE "users" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);

      class AddEmailToUsers extends Migration {
        async up() {
          await this.addColumn("users", "email", "string");
        }

        async down() {
          await this.removeColumn("users", "email");
        }
      }

      const migration = new AddEmailToUsers();
      await migration.run(adapter, "up");

      await adapter.executeMutation(
        `INSERT INTO "users" ("name", "email") VALUES ('Alice', 'alice@test.com')`,
      );
      const rows = await adapter.execute(`SELECT * FROM "users"`);
      expect(rows[0].email).toBe("alice@test.com");
    });

    it("creates indexes", async () => {
      adapter.exec(`CREATE TABLE "users" ("id" INTEGER PRIMARY KEY, "email" TEXT)`);

      class AddEmailIndex extends Migration {
        async up() {
          await this.addIndex("users", "email", { unique: true });
        }

        async down() {
          await this.removeIndex("users", { column: "email" });
        }
      }

      const migration = new AddEmailIndex();
      await migration.run(adapter, "up");

      // Unique index should prevent duplicates
      await adapter.executeMutation(`INSERT INTO "users" ("email") VALUES ('alice@test.com')`);
      await expect(
        adapter.executeMutation(`INSERT INTO "users" ("email") VALUES ('alice@test.com')`),
      ).rejects.toThrow();
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

    beforeEach(() => {
      adapter.exec(`
        CREATE TABLE "accounts" (
          "id" INTEGER PRIMARY KEY AUTOINCREMENT,
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
      const rows = await adapter.execute(`SELECT * FROM "accounts"`);
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

      const rows = await adapter.execute(`SELECT * FROM "accounts" ORDER BY "name"`);
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe("Alice");
      expect(rows[1].name).toBe("Charlie");
    });
  });

  // -- Associations with real SQLite --
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

    beforeEach(() => {
      adapter.exec(`
        CREATE TABLE "authors" (
          "id" INTEGER PRIMARY KEY AUTOINCREMENT,
          "name" TEXT
        )
      `);
      adapter.exec(`
        CREATE TABLE "books" (
          "id" INTEGER PRIMARY KEY AUTOINCREMENT,
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
});
