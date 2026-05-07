/**
 * Smoke test: SchemaStatements methods are accessible directly on the adapter.
 * Rails: `AbstractAdapter` includes `SchemaStatements`, so
 * `connection.create_table(...)` works without going through MigrationContext.
 */
import { describe, it, expect, afterEach } from "vitest";
import { SQLite3Adapter } from "../sqlite3-adapter.js";
import { AbstractAdapter } from "../abstract-adapter.js";

let adapter: SQLite3Adapter | undefined;

afterEach(async () => {
  await adapter?.close();
});

/**
 * Minimal stub adapter that extends AbstractAdapter but overrides nothing from
 * SchemaStatements. Used to exercise the self-delegation guard: methods like
 * foreignKeys/removeForeignKey check whether this.adapter.<method> is the
 * mixed-in SchemaStatements version and, if so, skip delegation and execute
 * the base SQL directly (or return the base fallback).
 */
class StubAdapter extends AbstractAdapter {
  get adapterName() {
    return "sqlite" as const;
  }
  execute(_sql: string) {
    return Promise.resolve([] as Record<string, unknown>[]);
  }
  executeMutation(_sql: string) {
    return Promise.resolve(0);
  }
}

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

  it("delegating methods (foreignKeys, removeForeignKey) do not infinitely recurse on base adapter", async () => {
    // Regression guard: before the self-delegation fix, mixed-in SchemaStatements
    // methods checked `this.adapter.<method>` — which returned `this` — and called
    // themselves again, causing a stack overflow. This test uses StubAdapter, which
    // does NOT override foreignKeys or removeForeignKey, so it hits the base
    // SchemaStatements code paths (not a concrete adapter shortcut).
    const stub = new StubAdapter();
    // foreignKeys base path returns [] when adapter has no override
    const fks = await stub.foreignKeys("any_table");
    expect(fks).toEqual([]);
    // removeForeignKey base path reaches SQL execution (which our stub no-ops) —
    // it resolves without a stack overflow
    await expect(
      (stub as any).removeForeignKey("products", { name: "fk_products_user_id" }),
    ).resolves.toBeUndefined();
  });
});
