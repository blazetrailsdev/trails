import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { describeIfPg, PostgreSQLAdapter, pgServerVersion } from "./test-helper.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";

const supportsNullsNotDistinct = pgServerVersion >= 150000;

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  describe("PostgreSQLActiveSchemaTest", () => {
    const execute = PostgreSQLAdapter.prototype.execute;
    fixtures(["people"]);

    beforeEach(async () => {
      adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
      await adapter.materializeTransactions();

      PostgreSQLAdapter.prototype.execute = async function (sql: string, _name = null) {
        return sql;
      } as never;
    });

    afterEach(() => {
      PostgreSQLAdapter.prototype.execute = execute;
    });

    it("create database with encoding", async () => {
      expect(await adapter.createDatabase("matt")).toBe(`CREATE DATABASE "matt" ENCODING = 'utf8'`);

      expect(await adapter.createDatabase("aimonetti", { encoding: "latin1" })).toBe(
        `CREATE DATABASE "aimonetti" ENCODING = 'latin1'`,
      );

      expect(await adapter.createDatabase("aimonetti", { encoding: "latin1" })).toBe(
        `CREATE DATABASE "aimonetti" ENCODING = 'latin1'`,
      );
    });

    it("create database with collation and ctype", async () => {
      expect(
        await adapter.createDatabase("aimonetti", {
          encoding: "UTF8",
          collation: "ja_JP.UTF8",
          ctype: "ja_JP.UTF8",
        }),
      ).toBe(
        `CREATE DATABASE "aimonetti" ENCODING = 'UTF8' LC_COLLATE = 'ja_JP.UTF8' LC_CTYPE = 'ja_JP.UTF8'`,
      );
    });

    it("add index", async () => {
      expect(
        await adapter.addIndex("people", "last_name", { unique: true, where: "state = 'active'" }),
      ).toBe(
        `CREATE UNIQUE INDEX "index_people_on_last_name" ON "people" ("last_name") WHERE state = 'active'`,
      );

      expect(await adapter.addIndex("people", "lower(last_name)", { unique: true })).toBe(
        `CREATE UNIQUE INDEX "index_people_on_lower_last_name" ON "people" (lower(last_name))`,
      );

      expect(
        await adapter.addIndex("people", "last_name varchar_pattern_ops", { unique: true }),
      ).toBe(
        `CREATE UNIQUE INDEX "index_people_on_last_name_varchar_pattern_ops" ON "people" (last_name varchar_pattern_ops)`,
      );

      expect(await adapter.addIndex("people", "last_name", { algorithm: "concurrently" })).toBe(
        `CREATE INDEX CONCURRENTLY "index_people_on_last_name" ON "people" ("last_name")`,
      );

      expect(
        await adapter.addIndex("people", "last_name", {
          ifNotExists: true,
          algorithm: "concurrently",
        }),
      ).toBe(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "index_people_on_last_name" ON "people" ("last_name")`,
      );

      expect(
        await adapter.addIndex("people", ["last_name", "first_name"], {
          order: { last_name: "desc", first_name: "asc" },
        }),
      ).toBe(
        `CREATE INDEX "index_people_on_last_name_and_first_name" ON "people" ("last_name" DESC, "first_name" ASC)`,
      );

      expect(
        await adapter.addIndex("people", ["last_name", "first_name"], {
          order: { last_name: "desc", first_name: "asc" },
        }),
      ).toBe(
        `CREATE INDEX "index_people_on_last_name_and_first_name" ON "people" ("last_name" DESC, "first_name" ASC)`,
      );

      for (const type of ["gin", "gist", "hash", "btree"]) {
        expect(await adapter.addIndex("people", "last_name", { using: type })).toBe(
          `CREATE INDEX "index_people_on_last_name" ON "people" USING ${type} ("last_name")`,
        );

        expect(
          await adapter.addIndex("people", "last_name", { using: type, algorithm: "concurrently" }),
        ).toBe(
          `CREATE INDEX CONCURRENTLY "index_people_on_last_name" ON "people" USING ${type} ("last_name")`,
        );

        expect(
          await adapter.addIndex("people", "last_name", {
            using: type,
            unique: true,
            where: "state = 'active'",
          }),
        ).toBe(
          `CREATE UNIQUE INDEX "index_people_on_last_name" ON "people" USING ${type} ("last_name") WHERE state = 'active'`,
        );

        expect(
          await adapter.addIndex("people", "lower(last_name)", { using: type, unique: true }),
        ).toBe(
          `CREATE UNIQUE INDEX "index_people_on_lower_last_name" ON "people" USING ${type} (lower(last_name))`,
        );
      }

      expect(
        await adapter.addIndex("people", "last_name", {
          using: "gist",
          opclass: { last_name: "bpchar_pattern_ops" },
        }),
      ).toBe(
        `CREATE INDEX "index_people_on_last_name" ON "people" USING gist ("last_name" bpchar_pattern_ops)`,
      );

      expect(
        await adapter.addIndex("people", ["last_name", "first_name"], {
          order: { last_name: "DESC NULLS LAST", first_name: "asc" },
        }),
      ).toBe(
        `CREATE INDEX "index_people_on_last_name_and_first_name" ON "people" ("last_name" DESC NULLS LAST, "first_name" ASC)`,
      );

      expect(await adapter.addIndex("people", "last_name", { order: "NULLS FIRST" })).toBe(
        `CREATE INDEX "index_people_on_last_name" ON "people" ("last_name" NULLS FIRST)`,
      );

      expect(await adapter.addIndex("people", "last_name", { ifNotExists: true })).toBe(
        `CREATE INDEX IF NOT EXISTS "index_people_on_last_name" ON "people" ("last_name")`,
      );

      // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' inline `if supports_nulls_not_distinct?` guard (PG 15+)
      if (supportsNullsNotDistinct) {
        expect(await adapter.addIndex("people", "last_name", { nullsNotDistinct: true })).toBe(
          `CREATE INDEX "index_people_on_last_name" ON "people" ("last_name") NULLS NOT DISTINCT`,
        );
      }

      await expect(() =>
        adapter.addIndex("people", "last_name", { algorithm: "copy" }),
      ).rejects.toThrow(ArgumentError);
    });

    it("remove index", async () => {
      PostgreSQLAdapter.prototype.indexNameForRemove = async function () {
        return "index_people_on_last_name";
      };

      expect(
        await adapter.removeIndex("people", {
          name: "index_people_on_last_name",
          algorithm: "concurrently",
        }),
      ).toBe(`DROP INDEX CONCURRENTLY "index_people_on_last_name"`);

      await expect(() =>
        adapter.addIndex("people", "last_name", { algorithm: "copy" }),
      ).rejects.toThrow(ArgumentError);

      delete (PostgreSQLAdapter.prototype as Partial<PostgreSQLAdapter>).indexNameForRemove;
    });

    it("remove index when name is specified", async () => {
      expect(
        await adapter.removeIndex("people", {
          name: "index_people_on_last_name",
          algorithm: "concurrently",
        }),
      ).toBe(`DROP INDEX CONCURRENTLY "index_people_on_last_name"`);
    });

    it("remove index with wrong option", async () => {
      await expect(() =>
        adapter.removeIndex("people", { coulmn: "last_name" } as never),
      ).rejects.toThrow(ArgumentError);
    });
  });
});
