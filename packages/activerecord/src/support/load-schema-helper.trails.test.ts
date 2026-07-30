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
import { resetTestTables } from "./drop-all-tables.js";
import { loadAdapterSpecificSchema } from "./load-schema-helper.js";

describe("boot-laid table snapshot", () => {
  it("survives the reset for every table the adapter-specific arm lays", async () => {
    const adapter = Base.connection;

    // Re-running the arm is how the lane's own tables are named without a second
    // list: whatever it lays here is what the snapshot had to have captured.
    await loadAdapterSpecificSchema(adapter);
    const bookkeeping = new Set(["schema_migrations", "ar_internal_metadata"]);
    const laid = (await adapter.tables()).filter((name) => !bookkeeping.has(name));
    expect(laid).toContain("defaults");

    await resetTestTables(adapter);

    const after = new Set(await adapter.tables());
    expect(laid.filter((name) => !after.has(name))).toEqual([]);
  });
});
