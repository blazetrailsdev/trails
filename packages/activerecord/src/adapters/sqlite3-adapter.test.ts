import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AbstractSQLite3Adapter } from "../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { Migration } from "../index.js";

describe("SqliteAdapter", () => {
  let adapter: AbstractSQLite3Adapter;

  beforeEach(() => {
    adapter = new BetterSQLite3Adapter(":memory:");
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

  describe("lookupCastType", () => {
    it("resolves base SQL types", () => {
      expect(adapter.lookupCastType("string").name).toBe("string");
      expect(adapter.lookupCastType("text").name).toBe("text");
      expect(adapter.lookupCastType("integer").name).toBe("integer");
      expect(adapter.lookupCastType("float").name).toBe("float");
      expect(adapter.lookupCastType("boolean").name).toBe("boolean");
      expect(adapter.lookupCastType("date").name).toBe("date");
      expect(adapter.lookupCastType("datetime").name).toBe("datetime");
      expect(adapter.lookupCastType("time").name).toBe("time");
      expect(adapter.lookupCastType("json").name).toBe("json");
      expect(adapter.lookupCastType("blob").name).toBe("binary");
    });

    it("strips precision/scale metadata", () => {
      expect(adapter.lookupCastType("DECIMAL(10, 0)").name).toBe("decimal");
      expect(adapter.lookupCastType("decimal(5,2)").name).toBe("decimal");
      expect(adapter.lookupCastType("INTEGER(11)").name).toBe("integer");
    });

    it("handles case-insensitive types", () => {
      expect(adapter.lookupCastType("TEXT").name).toBe("text");
      expect(adapter.lookupCastType("INTEGER").name).toBe("integer");
      expect(adapter.lookupCastType("BOOLEAN").name).toBe("boolean");
    });

    it("resolves SQLite affinity types via regex", () => {
      expect(adapter.lookupCastType("varchar").name).toBe("string");
      expect(adapter.lookupCastType("character").name).toBe("string");
      expect(adapter.lookupCastType("clob").name).toBe("text");
      expect(adapter.lookupCastType("real").name).toBe("float");
      expect(adapter.lookupCastType("double").name).toBe("float");
      expect(adapter.lookupCastType("bigint").name).toBe("integer");
      expect(adapter.lookupCastType("tinyint").name).toBe("integer");
    });
  });
});

describe("SQLite3Adapter._isMemoryFilename", () => {
  // Access the private static via `as any` — avoids opening any real DB connection.
  const isMemoryFilename = (AbstractSQLite3Adapter as any)._isMemoryFilename.bind(
    AbstractSQLite3Adapter,
  ) as (filename: string) => boolean;

  it("treats :memory: as in-memory", () => {
    expect(isMemoryFilename(":memory:")).toBe(true);
  });

  it("treats file::memory: URI as in-memory", () => {
    expect(isMemoryFilename("file::memory:?cache=shared")).toBe(true);
  });

  it("treats file:?mode=memory URI as in-memory", () => {
    expect(isMemoryFilename("file:memdb1?mode=memory&cache=shared")).toBe(true);
  });

  it("does NOT treat a path containing mode=memory text as in-memory", () => {
    // file:/tmp/mode=memory.db has the text but not as a query param
    expect(isMemoryFilename("file:/tmp/mode=memory.db")).toBe(false);
  });

  it("treats a regular file path as on-disk", () => {
    expect(isMemoryFilename("/tmp/test.db")).toBe(false);
  });
});

describe("SQLite3Adapter pragmas option", () => {
  let adapter: AbstractSQLite3Adapter | undefined;

  afterEach(() => {
    adapter?.close();
    vi.restoreAllMocks();
  });

  it("applies a valid numeric pragma on construction", () => {
    adapter = new BetterSQLite3Adapter(":memory:", { pragmas: { cache_size: 500 } });
    const result = (adapter.raw as import("better-sqlite3").Database).pragma(
      "cache_size",
    ) as Array<{ cache_size: number }>;
    expect(result[0]?.cache_size).toBe(500);
  });

  it("converts boolean true to 1 for pragma", () => {
    adapter = new BetterSQLite3Adapter(":memory:", { pragmas: { foreign_keys: true } });
    const result = (adapter.raw as import("better-sqlite3").Database).pragma(
      "foreign_keys",
    ) as Array<{ foreign_keys: number }>;
    expect(result[0]?.foreign_keys).toBe(1);
  });

  it("converts boolean false to 0 for pragma", () => {
    adapter = new BetterSQLite3Adapter(":memory:", { pragmas: { foreign_keys: false } });
    const result = (adapter.raw as import("better-sqlite3").Database).pragma(
      "foreign_keys",
    ) as Array<{ foreign_keys: number }>;
    expect(result[0]?.foreign_keys).toBe(0);
  });

  it("applies a valid string enum pragma", () => {
    adapter = new BetterSQLite3Adapter(":memory:", { pragmas: { synchronous: "FULL" } });
    const result = (adapter.raw as import("better-sqlite3").Database).pragma(
      "synchronous",
    ) as Array<{ synchronous: number }>;
    // SQLite returns synchronous as integer: 0=OFF,1=NORMAL,2=FULL,3=EXTRA
    expect(result[0]?.synchronous).toBe(2);
  });

  it("warns and skips an invalid pragma name", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    adapter = new BetterSQLite3Adapter(":memory:", {
      pragmas: { "bad-name!": 1 } as Record<string, number>,
    });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("invalid SQLite pragma name"),
    );
  });

  it("warns and skips a string value with unsafe characters", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    adapter = new BetterSQLite3Adapter(":memory:", {
      pragmas: { synchronous: "FULL; DROP TABLE users" },
    });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("unsafe characters"));
  });
});
