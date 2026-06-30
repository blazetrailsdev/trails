/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/active_schema_test.rb
 *
 * Rails' setup monkey-patches `PostgreSQLAdapter#execute` to a no-op that
 * returns the SQL, so the suite asserts on the *generated DDL string* rather
 * than running it. We reproduce that with `captureSql(..., { stub: adapter })`,
 * which intercepts the adapter's `exec`/`execute` and instruments the SQL via
 * `sql.active_record` without touching the database. Introspection the
 * SQL-builders still perform (e.g. `add_index_options`' bare-column `:where`
 * check) runs against the canonical `people` table.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL, pgServerVersion } from "./test-helper.js";
import { captureSql } from "../../testing/sql-capture.js";
import { fixtures } from "../../test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../../test-helpers/test-schema.js";

// Rails PostgreSQLAdapter#supports_nulls_not_distinct? — PG 15+ (150000).
const supportsNullsNotDistinct = pgServerVersion >= 150000;

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgreSQLActiveSchemaTest", () => {
    // `add_index_options` introspects the canonical `people` table when a bare
    // column name is passed as `:where`; seed it through the fixtures framework.
    fixtures(["people"], { schema: canonicalSchema });

    it("create database with encoding", async () => {
      let sqls = await captureSql(() => adapter.createDatabase("matt"), { stub: adapter });
      expect(sqls[0]).toBe(`CREATE DATABASE "matt" ENCODING = 'utf8'`);

      sqls = await captureSql(() => adapter.createDatabase("aimonetti", { encoding: "latin1" }), {
        stub: adapter,
      });
      expect(sqls[0]).toBe(`CREATE DATABASE "aimonetti" ENCODING = 'latin1'`);
    });

    it("create database with collation and ctype", async () => {
      const sqls = await captureSql(
        () =>
          adapter.createDatabase("aimonetti", {
            encoding: "UTF8",
            collation: "ja_JP.UTF8",
            ctype: "ja_JP.UTF8",
          }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe(
        `CREATE DATABASE "aimonetti" ENCODING = 'UTF8' LC_COLLATE = 'ja_JP.UTF8' LC_CTYPE = 'ja_JP.UTF8'`,
      );
    });

    it("add index", async () => {
      // includeSchema: false drops the `add_index_options` bare-column `:where`
      // introspection queries (name "SCHEMA"), leaving only the CREATE INDEX —
      // mirrors Rails, where column_exists? select-queries bypass the execute stub.
      const sql = async (fn: () => void | Promise<void>) =>
        (await captureSql(fn, { stub: adapter, includeSchema: false }))[0];

      expect(
        await sql(() =>
          adapter.addIndex("people", "last_name", { unique: true, where: "state = 'active'" }),
        ),
      ).toBe(
        `CREATE UNIQUE INDEX "index_people_on_last_name" ON "people" ("last_name") WHERE state = 'active'`,
      );

      expect(
        await sql(() => adapter.addIndex("people", "lower(last_name)", { unique: true })),
      ).toBe(
        `CREATE UNIQUE INDEX "index_people_on_lower_last_name" ON "people" (lower(last_name))`,
      );

      expect(
        await sql(() =>
          adapter.addIndex("people", "last_name varchar_pattern_ops", { unique: true }),
        ),
      ).toBe(
        `CREATE UNIQUE INDEX "index_people_on_last_name_varchar_pattern_ops" ON "people" (last_name varchar_pattern_ops)`,
      );

      expect(
        await sql(() => adapter.addIndex("people", "last_name", { algorithm: "concurrently" })),
      ).toBe(`CREATE INDEX CONCURRENTLY "index_people_on_last_name" ON "people" ("last_name")`);

      expect(
        await sql(() =>
          adapter.addIndex("people", "last_name", {
            ifNotExists: true,
            algorithm: "concurrently",
          }),
        ),
      ).toBe(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "index_people_on_last_name" ON "people" ("last_name")`,
      );

      expect(
        await sql(() =>
          adapter.addIndex("people", ["last_name", "first_name"], {
            order: { last_name: "desc", first_name: "asc" },
          }),
        ),
      ).toBe(
        `CREATE INDEX "index_people_on_last_name_and_first_name" ON "people" ("last_name" DESC, "first_name" ASC)`,
      );

      for (const type of ["gin", "gist", "hash", "btree"]) {
        expect(await sql(() => adapter.addIndex("people", "last_name", { using: type }))).toBe(
          `CREATE INDEX "index_people_on_last_name" ON "people" USING ${type} ("last_name")`,
        );

        expect(
          await sql(() =>
            adapter.addIndex("people", "last_name", { using: type, algorithm: "concurrently" }),
          ),
        ).toBe(
          `CREATE INDEX CONCURRENTLY "index_people_on_last_name" ON "people" USING ${type} ("last_name")`,
        );

        expect(
          await sql(() =>
            adapter.addIndex("people", "last_name", {
              using: type,
              unique: true,
              where: "state = 'active'",
            }),
          ),
        ).toBe(
          `CREATE UNIQUE INDEX "index_people_on_last_name" ON "people" USING ${type} ("last_name") WHERE state = 'active'`,
        );

        expect(
          await sql(() =>
            adapter.addIndex("people", "lower(last_name)", { using: type, unique: true }),
          ),
        ).toBe(
          `CREATE UNIQUE INDEX "index_people_on_lower_last_name" ON "people" USING ${type} (lower(last_name))`,
        );
      }

      expect(
        await sql(() =>
          adapter.addIndex("people", "last_name", {
            using: "gist",
            opclass: { last_name: "bpchar_pattern_ops" },
          }),
        ),
      ).toBe(
        `CREATE INDEX "index_people_on_last_name" ON "people" USING gist ("last_name" bpchar_pattern_ops)`,
      );

      expect(
        await sql(() =>
          adapter.addIndex("people", ["last_name", "first_name"], {
            order: { last_name: "DESC NULLS LAST", first_name: "asc" },
          }),
        ),
      ).toBe(
        `CREATE INDEX "index_people_on_last_name_and_first_name" ON "people" ("last_name" DESC NULLS LAST, "first_name" ASC)`,
      );

      expect(
        await sql(() => adapter.addIndex("people", "last_name", { order: "NULLS FIRST" })),
      ).toBe(`CREATE INDEX "index_people_on_last_name" ON "people" ("last_name" NULLS FIRST)`);

      expect(await sql(() => adapter.addIndex("people", "last_name", { ifNotExists: true }))).toBe(
        `CREATE INDEX IF NOT EXISTS "index_people_on_last_name" ON "people" ("last_name")`,
      );

      // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors Rails' inline `if supports_nulls_not_distinct?` guard (PG 15+)
      if (supportsNullsNotDistinct) {
        expect(
          await sql(() => adapter.addIndex("people", "last_name", { nullsNotDistinct: true })),
        ).toBe(
          `CREATE INDEX "index_people_on_last_name" ON "people" ("last_name") NULLS NOT DISTINCT`,
        );
      }

      await expect(() =>
        adapter.addIndex("people", "last_name", { algorithm: "copy" }),
      ).rejects.toThrow(ArgumentError);
    });

    it("remove index", async () => {
      const sqls = await captureSql(
        () =>
          adapter.removeIndex("people", {
            name: "index_people_on_last_name",
            algorithm: "concurrently",
          }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe(`DROP INDEX CONCURRENTLY "index_people_on_last_name"`);

      await expect(() =>
        adapter.addIndex("people", "last_name", { algorithm: "copy" }),
      ).rejects.toThrow(ArgumentError);
    });

    it("remove index when name is specified", async () => {
      const sqls = await captureSql(
        () =>
          adapter.removeIndex("people", {
            name: "index_people_on_last_name",
            algorithm: "concurrently",
          }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe(`DROP INDEX CONCURRENTLY "index_people_on_last_name"`);
    });

    it("remove index with wrong option", async () => {
      await expect(() =>
        adapter.removeIndex("people", { coulmn: "last_name" } as never),
      ).rejects.toThrow(ArgumentError);
    });
  });
});
