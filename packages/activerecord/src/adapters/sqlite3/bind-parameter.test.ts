/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/bind_parameter_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLite3Adapter } from "../sqlite3-adapter.js";

let adapter: SQLite3Adapter;

beforeEach(() => {
  adapter = new SQLite3Adapter(":memory:");
});

afterEach(() => {
  adapter.close();
});

describe("SQLite3Adapter", () => {
  beforeEach(() => {
    adapter.exec(`CREATE TABLE "topics" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "title" TEXT)`);
  });

  describe("BindParameterTest", () => {
    it("where with string for string column using bind parameters", async () => {
      await adapter.executeMutation(`INSERT INTO "topics" ("title") VALUES (?)`, ["hello"]);
      const rows = await adapter.execute(`SELECT * FROM "topics" WHERE "title" = ?`, ["hello"]);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("hello");
    });

    it("where with integer for string column using bind parameters", async () => {
      await adapter.executeMutation(`INSERT INTO "topics" ("title") VALUES (?)`, ["123"]);
      const rows = await adapter.execute(`SELECT * FROM "topics" WHERE "title" = ?`, ["123"]);
      expect(rows).toHaveLength(1);
    });

    it("where with float for string column using bind parameters", async () => {
      await adapter.executeMutation(`INSERT INTO "topics" ("title") VALUES (?)`, ["1.5"]);
      const rows = await adapter.execute(`SELECT * FROM "topics" WHERE "title" = ?`, ["1.5"]);
      expect(rows).toHaveLength(1);
    });

    it("where with boolean for string column using bind parameters", async () => {
      await adapter.executeMutation(`INSERT INTO "topics" ("title") VALUES (?)`, ["true"]);
      const rows = await adapter.execute(`SELECT * FROM "topics" WHERE "title" = ?`, ["true"]);
      expect(rows).toHaveLength(1);
    });

    it("where with decimal for string column using bind parameters", async () => {
      await adapter.executeMutation(`INSERT INTO "topics" ("title") VALUES (?)`, ["99.99"]);
      const rows = await adapter.execute(`SELECT * FROM "topics" WHERE "title" = ?`, ["99.99"]);
      expect(rows).toHaveLength(1);
    });

    it("where with rational for string column using bind parameters", async () => {
      await adapter.executeMutation(`INSERT INTO "topics" ("title") VALUES (?)`, ["1/3"]);
      const rows = await adapter.execute(`SELECT * FROM "topics" WHERE "title" = ?`, ["1/3"]);
      expect(rows).toHaveLength(1);
    });
  }); // BindParameterTest
});
