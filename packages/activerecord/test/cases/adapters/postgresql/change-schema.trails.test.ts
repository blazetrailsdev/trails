import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("Migration", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
    await adapter.createTable("strings", { force: true }, (t: any) => {
      t.string("somedate");
    });
  });
  afterEach(async () => {
    await adapter.dropTable("strings", { ifExists: true });
    await adapter.disconnectBang();
  });

  describe("PgChangeSchemaTest", () => {
    it("change column with null", async () => {
      await adapter.addColumn("strings", "score", "integer");
      await adapter.changeColumn("strings", "score", "integer", { null: false });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "score");
      expect(col!.null).toBe(false);
    });

    it("change column with default", async () => {
      await adapter.addColumn("strings", "score", "integer");
      await adapter.changeColumn("strings", "score", "integer", { default: 42 });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "score");
      expect(String(col!.default)).toBe("42");
    });

    it("change column default with null", async () => {
      await adapter.addColumn("strings", "score", "integer", { default: 42, null: false });
      await adapter.changeColumn("strings", "score", "integer", { default: null, null: false });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "score");
      expect(col!.default).toBeNull();
      expect(col!.null).toBe(false);
    });

    it("change column scale", async () => {
      await adapter.addColumn("strings", "amount", "decimal", { precision: 10, scale: 2 });
      await adapter.changeColumn("strings", "amount", "decimal", { precision: 10, scale: 4 });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "amount");
      expect(col!.scale).toBe(4);
    });

    it("change column precision", async () => {
      await adapter.addColumn("strings", "amount", "decimal", { precision: 10, scale: 2 });
      await adapter.changeColumn("strings", "amount", "decimal", { precision: 15, scale: 2 });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "amount");
      expect(col!.precision).toBe(15);
    });

    it("change column limit", async () => {
      await adapter.addColumn("strings", "score", "integer", { limit: 2 });
      await adapter.changeColumn("strings", "score", "integer", { limit: 4 });
      const cols = await adapter.columns("strings");
      const col = cols.find((c) => c.name === "score");
      expect(col!.sqlType).toBe("integer");
    });
  });
});
