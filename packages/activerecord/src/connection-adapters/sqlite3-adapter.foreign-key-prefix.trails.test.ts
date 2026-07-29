import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";
import { Base } from "../base.js";

// trails-only coverage: Rails' SQLite `add_foreign_key` strips the table name
// prefix/suffix off `to_table` before `definition.foreign_key`
// (sqlite3/schema_statements.rb:60), because `TableDefinition#foreign_key` ->
// `new_foreign_key_definition` re-applies it. Rails' own
// ForeignKeyTest#test_add_foreign_key_with_prefix passes unprefixed names, so it
// never observes the double application; passing the real (already-prefixed)
// table name — what the schema dumper emits — does.
describe("SQLite3Adapter addForeignKey under a table name prefix/suffix", () => {
  let adapter: AbstractSQLite3Adapter;

  beforeEach(async () => {
    adapter = new BetterSQLite3Adapter(":memory:");
    Base.tableNamePrefix = "p_";
    Base.tableNameSuffix = "_s";
    await adapter.createTable("p_rockets_s", { force: true }, (t) => {
      t.string("name");
    });
    await adapter.createTable("p_astronauts_s", { force: true }, (t) => {
      t.integer("rocket_id");
    });
  });

  afterEach(async () => {
    Base.tableNamePrefix = "";
    Base.tableNameSuffix = "";
    await adapter.dropTable("p_astronauts_s", "p_rockets_s", { ifExists: true });
    await adapter.close();
  });

  it("reflects the singly prefixed table", async () => {
    await adapter.addForeignKey("p_astronauts_s", "p_rockets_s", { column: "rocket_id" });

    const foreignKeys = await adapter.foreignKeys("p_astronauts_s");
    expect(foreignKeys.length).toBe(1);
    expect(foreignKeys[0].toTable).toBe("p_rockets_s");
  });
});
