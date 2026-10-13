import { fixtures } from "../../test-fixtures.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertPredicate } from "@blazetrails/activesupport";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("Migration", () => {
  const { self } = fixtures([]);

  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
    await adapter.execute("DROP TABLE IF EXISTS strings");
    await adapter.execute(
      `CREATE TABLE strings (id serial primary key, somedate character varying)`,
    );
  });
  afterEach(async () => {
    await adapter.execute("DROP TABLE IF EXISTS strings");
    await adapter.disconnectBang();
  });

  describe("PgChangeSchemaTest", () => {
    it("change string to date", async () => {
      await adapter.changeColumn("strings", "somedate", "timestamp", {
        using: 'CAST("somedate" AS timestamp)',
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.type).toBe("datetime");
    });

    it("change type with symbol", async () => {
      await adapter.changeColumn("strings", "somedate", "timestamp", {
        castAs: "timestamp",
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.type).toBe("datetime");
    });

    it("change type with symbol with timestamptz", async () => {
      await adapter.changeColumn("strings", "somedate", "timestamptz", {
        castAs: "timestamptz",
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.type).toBe("timestamptz");
    });

    it("change type with symbol using datetime", async () => {
      await adapter.changeColumn("strings", "somedate", "datetime", {
        castAs: "datetime",
      });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "somedate");
      expect(col!.type).toBe("datetime");
    });

    it("change type with symbol using timestamp with timestamptz as default", async () => {
      await self().withPostgresqlDatetimeType("timestamptz", async () => {
        await adapter.changeColumn("strings", "somedate", "timestamp", { castAs: "timestamp" });
        const cols = await adapter.columns("strings");
        const col = cols.find((c) => c.name === "somedate");
        expect(col!.type).toBe("timestamp");
      });
    });

    it("change type with symbol with timestamptz as default", async () => {
      await self().withPostgresqlDatetimeType("timestamptz", async () => {
        await adapter.changeColumn("strings", "somedate", "timestamptz", { castAs: "timestamptz" });
        const cols = await adapter.columns("strings");
        const col = cols.find((c) => c.name === "somedate");
        expect(col!.type).toBe("datetime");
      });
    });

    it("change type with symbol using datetime with timestamptz as default", async () => {
      await self().withPostgresqlDatetimeType("timestamptz", async () => {
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
      expect(col!.type).toBe("datetime");
      assertPredicate(col!, (c) => (c as any).isArray());
    });
  });
});
