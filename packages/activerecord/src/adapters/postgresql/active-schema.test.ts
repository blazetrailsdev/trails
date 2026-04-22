/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/active_schema_test.rb
 *
 * The Rails version stubs `execute` to return SQL strings. We test against a
 * real database instead — createDatabase, dropDatabase, and index operations.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

const tmpDb1 = "trails_test_active_schema_matt";
const tmpDb2 = "trails_test_active_schema_aimonetti";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS people");
    await adapter.close();
  });

  describe("PostgreSQLActiveSchemaTest", () => {
    it("create database with encoding", { timeout: 30000 }, async () => {
      await adapter.exec(`DROP DATABASE IF EXISTS ${tmpDb1}`);
      try {
        await adapter.createDatabase(tmpDb1, { encoding: "utf8" });
        const rows = await adapter.schemaQuery(
          `SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = $1`,
          [tmpDb1],
        );
        expect(rows[0].enc).toMatch(/utf8|UTF8/i);
      } finally {
        await adapter.dropDatabase(tmpDb1).catch(() => {});
      }
    });

    it("create database with collation and ctype", { timeout: 30000 }, async () => {
      await adapter.exec(`DROP DATABASE IF EXISTS ${tmpDb2}`);
      try {
        await adapter.createDatabase(tmpDb2, {
          encoding: "UTF8",
          collation: "C",
          ctype: "C",
          template: "template0",
        });
        const rows = await adapter.schemaQuery(
          `SELECT datcollate AS col, datctype AS ct FROM pg_database WHERE datname = $1`,
          [tmpDb2],
        );
        expect(rows[0].col).toBe("C");
        expect(rows[0].ct).toBe("C");
      } finally {
        await adapter.dropDatabase(tmpDb2).catch(() => {});
      }
    });

    it("add index", async () => {
      await adapter.exec("DROP TABLE IF EXISTS people");
      await adapter.exec(
        "CREATE TABLE people (id serial primary key, last_name varchar, first_name varchar, state varchar)",
      );

      const sql1 = await adapter.addIndex("people", ["last_name"], {
        unique: true,
        where: "state = 'active'",
        name: "index_people_on_last_name",
      });
      expect(sql1).toBe(
        `CREATE UNIQUE INDEX "index_people_on_last_name" ON "people" ("last_name") WHERE state = 'active'`,
      );
      await adapter.exec("DROP INDEX IF EXISTS index_people_on_last_name");

      const sql2 = await adapter.addIndex("people", ["last_name"], {
        algorithm: "concurrently",
        name: "index_people_on_last_name",
      });
      expect(sql2).toBe(
        `CREATE INDEX CONCURRENTLY "index_people_on_last_name" ON "people" ("last_name")`,
      );
      await adapter.exec("DROP INDEX CONCURRENTLY IF EXISTS index_people_on_last_name");

      await expect(
        adapter.addIndex("people", ["last_name"], {
          algorithm: "copy",
          name: "index_people_on_last_name",
        }),
      ).rejects.toThrow();

      await adapter.exec("DROP TABLE IF EXISTS people");
    });

    it("remove index", async () => {
      await adapter.exec("DROP TABLE IF EXISTS people");
      await adapter.exec("CREATE TABLE people (id serial primary key, last_name varchar)");
      await adapter.exec('CREATE INDEX index_people_on_last_name ON people ("last_name")');
      await adapter.removeIndex("people", {
        name: "index_people_on_last_name",
        algorithm: "concurrently",
      });
      expect(await adapter.indexNameExists("people", "index_people_on_last_name")).toBe(false);
      await adapter.exec("DROP TABLE IF EXISTS people");
    });

    it("remove index when name is specified", async () => {
      await adapter.exec("DROP TABLE IF EXISTS people");
      await adapter.exec("CREATE TABLE people (id serial primary key, last_name varchar)");
      await adapter.exec('CREATE INDEX index_people_on_last_name ON people ("last_name")');
      await adapter.removeIndex("people", {
        name: "index_people_on_last_name",
        algorithm: "concurrently",
      });
      expect(await adapter.indexNameExists("people", "index_people_on_last_name")).toBe(false);
      await adapter.exec("DROP TABLE IF EXISTS people");
    });

    it("remove index with wrong option", async () => {
      await expect(adapter.removeIndex("people", {} as any)).rejects.toThrow();
    });
  });
});
