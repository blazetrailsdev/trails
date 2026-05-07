/**
 * Smoke test: SchemaStatements methods are accessible directly on the adapter.
 * Rails: `AbstractAdapter` includes `SchemaStatements`, so
 * `connection.create_table(...)` works without going through MigrationContext.
 */
import { describe, it, expect, afterEach } from "vitest";
import { SQLite3Adapter } from "../sqlite3-adapter.js";

let adapter: SQLite3Adapter | undefined;

afterEach(async () => {
  await adapter?.close();
});

describe("SchemaStatements mixed into AbstractAdapter", () => {
  it("createTable is callable directly on the adapter", async () => {
    adapter = new SQLite3Adapter(":memory:");
    await adapter.createTable("things", (t) => {
      t.string("name");
      t.integer("quantity");
    });
    expect(await adapter.tableExists("things")).toBe(true);
    const cols = await adapter.columns("things");
    const names = cols.map((c) => c.name);
    expect(names).toContain("name");
    expect(names).toContain("quantity");
  });

  it("dropTable removes the table", async () => {
    adapter = new SQLite3Adapter(":memory:");
    await adapter.createTable("temp_table", (t) => t.string("value"));
    expect(await adapter.tableExists("temp_table")).toBe(true);
    await adapter.dropTable("temp_table");
    expect(await adapter.tableExists("temp_table")).toBe(false);
  });

  it("addColumn and columnExists work on adapter", async () => {
    adapter = new SQLite3Adapter(":memory:");
    await adapter.createTable("widgets", { id: false }, (t) => {
      t.string("title");
    });
    expect(await adapter.columnExists("widgets", "title")).toBe(true);
    await adapter.addColumn("widgets", "color", "string");
    expect(await adapter.columnExists("widgets", "color")).toBe(true);
  });

  it("delegating methods (removeForeignKey, foreignKeys) do not infinitely recurse", async () => {
    // Regression: before the self-delegation guard, mixed-in SchemaStatements
    // methods like removeForeignKey/foreignKeys checked `this.adapter.<method>`
    // which returned `this`, causing infinite recursion on adapters without overrides.
    adapter = new SQLite3Adapter(":memory:");
    await adapter.createTable("products", (t) => t.string("name"));
    // foreignKeys falls back to [] on SQLite (no override, no recursion)
    const fks = await (adapter as any).foreignKeys("products");
    expect(Array.isArray(fks)).toBe(true);
    // removeForeignKey on a non-existent key should throw without stack overflow
    await expect(
      (adapter as any).removeForeignKey("products", { name: "nonexistent_fk" }),
    ).rejects.toThrow();
  });
});
