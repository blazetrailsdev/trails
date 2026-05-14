/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/change_schema_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  describeIfPg,
  PostgreSQLAdapter,
  PG_TEST_URL,
  withPostgresqlDatetimeType,
} from "./test-helper.js";

describeIfPg("Migration", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec("DROP TABLE IF EXISTS strings");
    await adapter.exec(`CREATE TABLE strings (id serial primary key, somedate character varying)`);
  });
  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS strings");
    await adapter.close();
  });

  describe("PgChangeSchemaTest", () => {
    it("change column", async () => {
      await adapter.exec("ALTER TABLE strings ADD COLUMN age integer");
      await adapter.changeColumn("strings", "age", "string");
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "age");
      expect(col!.sqlType).toBe("character varying");
    });

    it("change column with null", async () => {
      await adapter.exec("ALTER TABLE strings ADD COLUMN score integer");
      await adapter.changeColumn("strings", "score", "integer", { null: false });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "score");
      expect(col!.null).toBe(false);
    });

    it("change column with default", async () => {
      await adapter.exec("ALTER TABLE strings ADD COLUMN score integer");
      await adapter.changeColumn("strings", "score", "integer", { default: 42 });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "score");
      expect(String(col!.default)).toBe("42");
    });

    it("change column default with null", async () => {
      await adapter.exec("ALTER TABLE strings ADD COLUMN score integer DEFAULT 42 NOT NULL");
      await adapter.changeColumn("strings", "score", "integer", { default: null, null: false });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "score");
      expect(col!.default).toBeNull();
      expect(col!.null).toBe(false);
    });

    it("change column null", async () => {
      await adapter.exec("ALTER TABLE strings ADD COLUMN score integer NOT NULL DEFAULT 0");
      await adapter.changeColumn("strings", "score", "integer", { null: true });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "score");
      expect(col!.null).toBe(true);
    });

    it("change column scale", async () => {
      await adapter.exec("ALTER TABLE strings ADD COLUMN amount numeric(10,2)");
      await adapter.changeColumn("strings", "amount", "decimal", { precision: 10, scale: 4 });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "amount");
      expect(col!.scale).toBe(4);
    });

    it("change column precision", async () => {
      await adapter.exec("ALTER TABLE strings ADD COLUMN amount numeric(10,2)");
      await adapter.changeColumn("strings", "amount", "decimal", { precision: 15, scale: 2 });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "amount");
      expect(col!.precision).toBe(15);
    });

    it("change column limit", async () => {
      await adapter.exec("ALTER TABLE strings ADD COLUMN score smallint");
      await adapter.changeColumn("strings", "score", "integer", { limit: 4 });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "score");
      expect(col!.sqlType).toBe("integer");
    });

    it("change string to date", async () => {
      await adapter.changeColumn("strings", "somedate", "timestamp", {
        using: 'CAST("somedate" AS timestamp)',
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.sqlType).toBe("timestamp without time zone");
    });

    it("change type with symbol", async () => {
      await adapter.changeColumn("strings", "somedate", "timestamp", {
        castAs: "timestamp",
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.sqlType).toBe("timestamp without time zone");
    });

    it("change type with symbol with timestamptz", async () => {
      await adapter.changeColumn("strings", "somedate", "timestamptz", {
        castAs: "timestamptz",
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.sqlType).toBe("timestamp with time zone");
    });

    it("change type with symbol using datetime", async () => {
      await adapter.changeColumn("strings", "somedate", "datetime", {
        castAs: "datetime",
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.sqlType).toBe("timestamp without time zone");
    });

    it("change type with symbol using timestamp with timestamptz as default", async () => {
      await withPostgresqlDatetimeType("timestamptz", async () => {
        await adapter.changeColumn("strings", "somedate", "timestamp", { castAs: "timestamp" });
        const cols = await adapter.columns("strings");
        const col = cols.find((c) => c.name === "somedate");
        expect(col!.type).toBe("timestamp");
      });
    });

    it("change type with symbol with timestamptz as default", async () => {
      await withPostgresqlDatetimeType("timestamptz", async () => {
        await adapter.changeColumn("strings", "somedate", "timestamptz", { castAs: "timestamptz" });
        const cols = await adapter.columns("strings");
        const col = cols.find((c) => c.name === "somedate");
        expect(col!.type).toBe("datetime");
      });
    });

    it("change type with symbol using datetime with timestamptz as default", async () => {
      await withPostgresqlDatetimeType("timestamptz", async () => {
        await adapter.changeColumn("strings", "somedate", "datetime", { castAs: "datetime" });
        const cols = await adapter.columns("strings");
        const col = cols.find((c) => c.name === "somedate");
        expect(col!.type).toBe("datetime");
      });
    });

    it("change type with array", async () => {
      await adapter.changeColumn("strings", "somedate", "timestamp", {
        array: true,
        castAs: "timestamp",
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.sqlType).toBe("timestamp without time zone");
      expect((col as any).isArray()).toBe(true);
    });
  });
});
