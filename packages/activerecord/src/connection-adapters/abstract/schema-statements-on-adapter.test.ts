/**
 * Smoke test: SchemaStatements methods are accessible directly on the adapter.
 * Rails: `AbstractAdapter` includes `SchemaStatements`, so
 * `connection.create_table(...)` works without going through MigrationContext.
 */
import { describe, it, expect, afterEach } from "vitest";
import { AbstractSQLite3Adapter } from "../sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../better-sqlite3-adapter.js";
import { AbstractAdapter } from "../abstract-adapter.js";

let adapter: AbstractSQLite3Adapter | undefined;

afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
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
    adapter = new BetterSQLite3Adapter(":memory:");
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
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("temp_table", (t) => t.string("value"));
    expect(await adapter.tableExists("temp_table")).toBe(true);
    await adapter.dropTable("temp_table");
    expect(await adapter.tableExists("temp_table")).toBe(false);
  });

  it("addColumn and columnExists work on adapter", async () => {
    adapter = new BetterSQLite3Adapter(":memory:");
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
      stub.removeForeignKey("products", { name: "fk_products_user_id" }),
    ).resolves.toBeUndefined();
  });

  it("validColumnDefinitionOptions includes ifExists (Rails OPTION_NAMES)", () => {
    const stub = new StubAdapter();
    const opts = (stub as any).validColumnDefinitionOptions() as string[];
    expect(opts).toContain("ifExists");
    expect(opts).toContain("ifNotExists");
  });

  it("addForeignKey with ifNotExists skips creation when a matching FK exists", async () => {
    let executed = 0;
    class FkStub extends StubAdapter {
      override executeMutation(_sql: string) {
        executed++;
        return Promise.resolve(0);
      }
      override foreignKeys(_table: string) {
        return Promise.resolve([{ toTable: "authors", column: "author_id" }] as any);
      }
    }
    const stub = new FkStub();
    await stub.addForeignKey("articles", "authors", { column: "author_id", ifNotExists: true });
    expect(executed).toBe(0);
  });

  it("addForeignKey with ifNotExists creates the FK when none exists", async () => {
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("authors", (t) => t.string("name"));
    await adapter.createTable("articles", (t) => t.bigint("author_id"));
    await adapter.addForeignKey("articles", "authors", {
      column: "author_id",
      ifNotExists: true,
    });
    expect(await (adapter as any).foreignKeyExists("articles", { column: "author_id" })).toBe(true);
  });
});
