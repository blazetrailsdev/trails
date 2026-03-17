/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/change_schema_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("Migration", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
    await adapter.exec("DROP TABLE IF EXISTS strings");
    await adapter.exec(`CREATE TABLE strings (id serial primary key, somedate character varying)`);
  });
  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS strings");
    await adapter.close();
  });

  describe("PgChangeSchemaTest", () => {
    it.skip("change column", async () => {});
    it.skip("change column with null", async () => {});
    it.skip("change column with default", async () => {});
    it.skip("change column default with null", async () => {});
    it.skip("change column null", async () => {});
    it.skip("change column scale", async () => {});
    it.skip("change column precision", async () => {});
    it.skip("change column limit", async () => {});

    it("change string to date", async () => {
      await adapter.changeColumn("strings", "somedate", "timestamp", {
        using: 'CAST("somedate" AS timestamp)',
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.type).toBe("timestamp without time zone");
    });

    it("change type with symbol", async () => {
      await adapter.changeColumn("strings", "somedate", "timestamp", {
        castAs: "timestamp",
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.type).toBe("timestamp without time zone");
    });

    it("change type with symbol with timestamptz", async () => {
      await adapter.changeColumn("strings", "somedate", "timestamptz", {
        castAs: "timestamptz",
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.type).toBe("timestamp with time zone");
    });

    it("change type with symbol using datetime", async () => {
      await adapter.changeColumn("strings", "somedate", "datetime", {
        castAs: "datetime",
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.type).toBe("timestamp without time zone");
    });

    it.skip("change type with symbol using timestamp with timestamptz as default", async () => {});
    it.skip("change type with symbol with timestamptz as default", async () => {});
    it.skip("change type with symbol using datetime with timestamptz as default", async () => {});

    it("change type with array", async () => {
      await adapter.changeColumn("strings", "somedate", "timestamp", {
        array: true,
        castAs: "timestamp",
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.type).toBe("timestamp without time zone[]");
    });
  });
});
