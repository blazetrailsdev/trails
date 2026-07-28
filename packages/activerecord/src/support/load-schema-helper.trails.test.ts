/**
 * trails-only guards on `ADAPTER_SPECIFIC_TABLES` — the table-name list
 * `support/drop-all-tables.ts` reads to decide which tables its between-test
 * reset must TRUNCATE rather than DROP.
 *
 * Rails needs no such list: `load_schema_helper.rb` runs the `.rb` schema file
 * and nothing between tests drops schema tables. trails' reset does, so a table
 * added to a loader but missed in the list is silently dropped before the first
 * test of every file — the exact failure this file exists to catch.
 */
import { describe, expect, it } from "vitest";
import "../sqlite/better-sqlite3.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { Base } from "../base.js";
import { adapterSpecificTableNames, loadAdapterSpecificSchema } from "./load-schema-helper.js";

describe("ADAPTER_SPECIFIC_TABLES", () => {
  it("lists exactly the tables the sqlite arm creates", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadAdapterSpecificSchema(adapter);
      const created = (await adapter.tables()).sort();
      expect(created).toEqual([...adapterSpecificTableNames("sqlite")].sort());
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });

  it("lists tables the active lane actually has after boot", async () => {
    const adapter = Base.connection;
    const declared = adapterSpecificTableNames(adapter.adapterName);
    expect(declared.length).toBeGreaterThan(0);

    const present = new Set(await adapter.tables());
    expect(declared.filter((name) => !present.has(name))).toEqual([]);
  });
});
