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
    it.skip("quote date", async () => {});
    it.skip("quote time", async () => {});
    it.skip("quote timestamp", async () => {});
    it.skip("quote duration", async () => {});
    it.skip("quote range", async () => {});
    it.skip("quote array", async () => {});
    it.skip("quote integer", async () => {});
    it.skip("quote big decimal", async () => {});
    it.skip("quote rational", async () => {});
    it.skip("quote bit string", async () => {});
    it.skip("quote table name with spaces", async () => {});
    it.skip("raise when int is wider than 64bit", async () => {});
    it.skip("do not raise when int is not wider than 64bit", async () => {});
    it.skip("do not raise when raise int wider than 64bit is false", async () => {});
  });
});
