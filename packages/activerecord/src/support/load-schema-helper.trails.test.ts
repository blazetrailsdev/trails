/**
 * trails-only guard on the boot-laid table snapshot `support/drop-all-tables.ts`
 * takes: the set its between-test reset TRUNCATEs rather than DROPs.
 *
 * Rails needs no such set — `load_schema_helper.rb` runs the `.rb` schema file
 * and nothing between tests drops schema tables. trails' reset does, so a table
 * the `<adapter>_specific_schema.rb` arm lays but the snapshot misses is
 * silently dropped before the first test of every file. That direction is what
 * this file catches, on whichever lane is running.
 */
import { describe, expect, it } from "vitest";
import { Base } from "../base.js";
import { recordBootLaidTables, resetTestTables } from "./drop-all-tables.js";
import { loadAdapterSpecificSchema } from "./load-schema-helper.js";

describe("boot-laid table snapshot", () => {
  it("survives the reset for every table the adapter-specific arm lays", async () => {
    const adapter = Base.connection;

    // The canonical half is already on this worker's DB, so only the
    // adapter-specific arm is replayed here.
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

    // `test-setup-dy.ts`'s boot order, replayed: the database is emptied of
    // everything that is not canonical, then the schema is laid — here only its
    // adapter-specific arm, the canonical half already being on this worker's
    // DB — then the snapshot.
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
