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
    await adapter.exec("DROP TABLE IF EXISTS ex_people");
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
      await adapter.exec("DROP TABLE IF EXISTS ex_people");
      await adapter.exec(
        "CREATE TABLE ex_people (id serial primary key, last_name varchar, first_name varchar, state varchar)",
      );

      await adapter.addIndex("ex_people", ["last_name"], {
        unique: true,
        where: "state = 'active'",
        name: "index_people_on_last_name",
      });
      expect(await adapter.indexNameExists("ex_people", "index_people_on_last_name")).toBe(true);
      {
        const indexes = await adapter.indexes("ex_people");
        const idx = indexes.find((i) => i.name === "index_people_on_last_name");
        expect(idx).toBeDefined();
        expect(idx!.unique).toBe(true);
        expect(idx!.columns).toEqual(["last_name"]);
        expect(idx!.where).toContain("state");
      }
      await adapter.exec("DROP INDEX IF EXISTS index_people_on_last_name");

      await adapter.addIndex("ex_people", ["last_name"], {
        algorithm: "concurrently",
        name: "index_people_on_last_name",
      });
      expect(await adapter.indexNameExists("ex_people", "index_people_on_last_name")).toBe(true);
      await adapter.exec("DROP INDEX CONCURRENTLY IF EXISTS index_people_on_last_name");

      await expect(
        adapter.addIndex("ex_people", ["last_name"], {
          algorithm: "copy",
          name: "index_people_on_last_name",
        }),
      ).rejects.toThrow();

      await adapter.exec("DROP TABLE IF EXISTS ex_people");
    });

    it("add index quotes a bare column name where", async () => {
      // Mirrors Rails PG#add_index_options: when `:where` is itself a column
      // name, it is quoted as an identifier rather than passed through verbatim.
      await adapter.exec("DROP TABLE IF EXISTS ex_people");
      await adapter.exec(
        "CREATE TABLE ex_people (id serial primary key, last_name varchar, active boolean)",
      );

      // A bare column name in `:where` is quoted as an identifier by
      // addIndexOptions (Rails' add_index_options) — assert via that
      // SQL-builder seam since addIndex itself now returns void.
      {
        const [idx] = await adapter.addIndexOptions("ex_people", ["last_name"], {
          where: "active",
        });
        expect(idx.where).toBe(`"active"`);
      }
      await adapter.addIndex("ex_people", ["last_name"], {
        where: "active",
        name: "index_people_on_last_name",
      });
      expect(await adapter.indexNameExists("ex_people", "index_people_on_last_name")).toBe(true);
      await adapter.exec("DROP INDEX IF EXISTS index_people_on_last_name");

      // A non-column where expression is left verbatim.
      {
        const [idx] = await adapter.addIndexOptions("ex_people", ["last_name"], {
          where: "active IS TRUE",
        });
        expect(idx.where).toBe("active IS TRUE");
      }
      await adapter.addIndex("ex_people", ["last_name"], {
        where: "active IS TRUE",
        name: "index_people_on_last_name",
      });
      expect(await adapter.indexNameExists("ex_people", "index_people_on_last_name")).toBe(true);
      await adapter.exec("DROP INDEX IF EXISTS index_people_on_last_name");

      await adapter.exec("DROP TABLE IF EXISTS ex_people");
    });

    it("rename index validates the new name length", async () => {
      // Mirrors Rails PG#rename_index → validate_index_length!.
      await adapter.exec("DROP TABLE IF EXISTS ex_people");
      await adapter.exec("CREATE TABLE ex_people (id serial primary key, last_name varchar)");
      await adapter.exec('CREATE INDEX index_people_on_last_name ON ex_people ("last_name")');

      await expect(
        adapter.renameIndex("ex_people", "index_people_on_last_name", "a".repeat(65)),
      ).rejects.toThrow(/too long/);

      await adapter.exec("DROP TABLE IF EXISTS ex_people");
    });

    it("remove index", async () => {
      await adapter.exec("DROP TABLE IF EXISTS ex_people");
      await adapter.exec("CREATE TABLE ex_people (id serial primary key, last_name varchar)");
      await adapter.exec('CREATE INDEX index_people_on_last_name ON ex_people ("last_name")');
      await adapter.removeIndex("ex_people", {
        name: "index_people_on_last_name",
        algorithm: "concurrently",
      });
      expect(await adapter.indexNameExists("ex_people", "index_people_on_last_name")).toBe(false);
      await adapter.exec("DROP TABLE IF EXISTS ex_people");
    });

    it("remove index when name is specified", async () => {
      await adapter.exec("DROP TABLE IF EXISTS ex_people");
      await adapter.exec("CREATE TABLE ex_people (id serial primary key, last_name varchar)");
      await adapter.exec('CREATE INDEX index_people_on_last_name ON ex_people ("last_name")');
      await adapter.removeIndex("ex_people", {
        name: "index_people_on_last_name",
        algorithm: "concurrently",
      });
      expect(await adapter.indexNameExists("ex_people", "index_people_on_last_name")).toBe(false);
      await adapter.exec("DROP TABLE IF EXISTS ex_people");
    });

    it("remove index with wrong option", async () => {
      await expect(adapter.removeIndex("ex_people", {} as any)).rejects.toThrow();
    });

    it("add_index default name routes through generate_index_name length fallback", async () => {
      // Regression: PG add_index must derive its default name via
      // generate_index_name (length/hash fallback), so it agrees with
      // remove_index for over-long table+column combinations rather than
      // emitting a raw, truncated identifier.
      await adapter.exec("DROP TABLE IF EXISTS ex_people");
      await adapter.exec(
        "CREATE TABLE ex_people (id serial primary key, very_long_column_name_one varchar, very_long_column_name_two varchar)",
      );

      const cols = ["very_long_column_name_one", "very_long_column_name_two"];
      const expectedName = adapter.generateIndexName("ex_people", cols);
      // Sanity: this combination is long enough to trigger the hash fallback.
      expect(expectedName).not.toBe(`index_ex_people_on_${cols.join("_and_")}`);
      expect(expectedName.length).toBeLessThanOrEqual(63);

      await adapter.addIndex("ex_people", cols);
      expect(await adapter.indexNameExists("ex_people", expectedName)).toBe(true);

      // remove_index by column resolves the same default name and round-trips.
      await adapter.removeIndex("ex_people", { column: cols });
      expect(await adapter.indexNameExists("ex_people", expectedName)).toBe(false);

      await adapter.exec("DROP TABLE IF EXISTS ex_people");
    });
  });
});
