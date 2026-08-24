/**
 * trails-only guard on the boot-laid table snapshot `support/drop-all-tables.ts`
 * takes: the set its boot reset TRUNCATEs rather than DROPs.
 *
 * Rails needs no such set — `load_schema_helper.rb` runs the `.rb` schema file
 * and nothing drops schema tables afterwards. trails' boot reset does, so a
 * table the `<adapter>_specific_schema.rb` arm lays but the snapshot misses is
 * silently dropped on a worker recycled onto an already-loaded database. That
 * direction is what this file catches, on whichever lane is running.
 */
import { describe, expect, it, test } from "vitest";
import "../sqlite/better-sqlite3.js";
import { Base } from "../base.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { recordBootLaidTables, resetTestTables } from "./drop-all-tables.js";
import { loadAdapterSpecificSchema, loadSchema } from "./load-schema-helper.js";

describe("boot-laid table snapshot", () => {
  it("survives the reset for every table the adapter-specific arm lays", async () => {
    const adapter = Base.connection;

    await loadAdapterSpecificSchema(adapter);
    const bookkeeping = new Set(["schema_migrations", "ar_internal_metadata"]);
    const laid = (await adapter.tables()).filter((name) => !bookkeeping.has(name));
    expect(laid).toContain("defaults");

    await resetTestTables(adapter);

    const after = new Set(await adapter.tables());
    expect(laid.filter((name) => !after.has(name))).toEqual([]);
  });

  it("excludes a table left in the database before the schema load", async () => {
    const adapter = Base.connection;
    await adapter.executeMutation(`CREATE TABLE leftover_boot_t (id INTEGER PRIMARY KEY)`);

    await resetTestTables(adapter);
    await loadAdapterSpecificSchema(adapter);
    await recordBootLaidTables(adapter);

    expect(await adapter.tables()).not.toContain("leftover_boot_t");

    await adapter.executeMutation(`CREATE TABLE leftover_boot_t (id INTEGER PRIMARY KEY)`);
    await resetTestTables(adapter);

    const after = await adapter.tables();
    expect(after).not.toContain("leftover_boot_t");
    expect(after).toContain("defaults");
  });
});

describe("LoadSchemaHelper", () => {
  test("load_schema", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadSchema(adapter);

      const res = await adapter.selectAll(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      );
      const tables = res.toArray().map((r) => r.name as string);

      expect(tables.length).toBeGreaterThan(300);
      expect(tables).toContain("topics");
      expect(tables).toContain("posts");
      expect(tables).not.toContain("chat_messages");
      // The sqlite arm of ADAPTER_SPECIFIC_SCHEMAS: sqlite_specific_schema.rb's
      // only table.
      expect(tables).toContain("defaults");
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });
});
