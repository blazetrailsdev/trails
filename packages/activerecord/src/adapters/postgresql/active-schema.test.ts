/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/active_schema_test.rb
 *
 * The Rails version stubs `execute` to return SQL strings, making these
 * pure SQL-generation tests. We test `createDatabase` (which only returns SQL)
 * directly, and for index operations we test against a real table.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS people");
    await adapter.close();
  });

  describe("PostgreSQLActiveSchemaTest", () => {
    it("create database with encoding", async () => {
      expect(adapter.createDatabase("matt")).toBe(`CREATE DATABASE "matt" ENCODING = 'utf8'`);
      expect(adapter.createDatabase("aimonetti", { encoding: "latin1" })).toBe(
        `CREATE DATABASE "aimonetti" ENCODING = 'latin1'`,
      );
    });

    it("create database with collation and ctype", async () => {
      expect(
        adapter.createDatabase("aimonetti", {
          encoding: "UTF8",
          collation: "ja_JP.UTF8",
          ctype: "ja_JP.UTF8",
        }),
      ).toBe(
        `CREATE DATABASE "aimonetti" ENCODING = 'UTF8' LC_COLLATE = 'ja_JP.UTF8' LC_CTYPE = 'ja_JP.UTF8'`,
      );
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
