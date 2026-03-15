/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/quoting_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
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
      await adapter.exec(`DROP TABLE IF EXISTS "quoting_test"`);
      await adapter.exec(`CREATE TABLE "quoting_test" ("id" SERIAL PRIMARY KEY, "select" TEXT)`);
      await adapter.executeMutation(`INSERT INTO "quoting_test" ("select") VALUES ('works')`);
      const rows = await adapter.execute(`SELECT "select" FROM "quoting_test"`);
      expect(rows[0].select).toBe("works");
    });

    it("quote table name", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "quoting_test"`);
      await adapter.exec(`CREATE TABLE "quoting_test" ("id" SERIAL PRIMARY KEY, "val" TEXT)`);
      const rows = await adapter.execute(`SELECT * FROM "quoting_test"`);
      expect(rows).toHaveLength(0);
    });

    it.skip("quote table name with schema", async () => {});
    it.skip("quote unicode string", async () => {});
    it.skip("quote binary", async () => {});
    it("quote date", async () => {
      const rows = await adapter.execute("SELECT DATE '2023-01-15' AS val");
      const val = rows[0].val;
      expect(val).toBeDefined();
    });

    it("quote time", async () => {
      const rows = await adapter.execute("SELECT TIME '14:30:00' AS val");
      expect(rows[0].val).toBeDefined();
    });

    it("quote timestamp", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-01-15 14:30:00' AS val");
      expect(rows[0].val).toBeDefined();
    });

    it.skip("quote range", async () => {});

    it("quote array", async () => {
      const rows = await adapter.execute("SELECT ARRAY[1,2,3]::integer[] AS val");
      expect(rows[0].val).toEqual([1, 2, 3]);
    });

    it("quote integer", async () => {
      const rows = await adapter.execute("SELECT 42::integer AS val");
      expect(rows[0].val).toBe(42);
    });

    it.skip("quote big decimal", async () => {});
    it.skip("quote rational", async () => {});
    it.skip("quote bit string", async () => {});

    it("quote table name with spaces", async () => {
      await adapter.exec(`CREATE TABLE "table with spaces" ("id" SERIAL PRIMARY KEY)`);
      await adapter.executeMutation(`INSERT INTO "table with spaces" DEFAULT VALUES`);
      const rows = await adapter.execute(`SELECT * FROM "table with spaces"`);
      expect(rows).toHaveLength(1);
      await adapter.exec(`DROP TABLE "table with spaces"`);
    });

    it.skip("raise when int is wider than 64bit", async () => {});
    it("do not raise when int is not wider than 64bit", async () => {
      const rows = await adapter.execute("SELECT 2147483647::integer AS val");
      expect(rows[0].val).toBe(2147483647);
    });
    it.skip("do not raise when raise int wider than 64bit is false", async () => {});
  });
});
