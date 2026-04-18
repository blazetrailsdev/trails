import { describe, it, expect } from "vitest";
import { createTestAdapter } from "./test-adapter.js";
import { MigrationContext } from "./migration.js";
import { introspectTables, introspectColumns } from "./schema-introspection.js";

/**
 * Return a proxy over `adapter` that hides the named methods so the
 * SchemaStatements fallback path inside `introspect*` runs. Keeping
 * the real adapter underneath means detectAdapterName + execute()
 * work, so SchemaStatements' query dispatch can complete.
 */
function withoutMethods<A extends object>(adapter: A, hidden: string[]): A {
  const hiddenSet = new Set(hidden);
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && hiddenSet.has(prop)) return undefined;
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (typeof prop === "string" && hiddenSet.has(prop)) return false;
      return Reflect.has(target, prop);
    },
  }) as A;
}

describe("introspectTables", () => {
  it("uses adapter.tables() when the adapter implements it", async () => {
    let called = false;
    const adapter = {
      async tables() {
        called = true;
        return ["users", "posts"];
      },
    } as unknown as Parameters<typeof introspectTables>[0];

    const tables = await introspectTables(adapter);

    expect(called).toBe(true);
    expect(tables).toEqual(["users", "posts"]);
  });

  it("falls back to SchemaStatements when the adapter doesn't implement tables()", async () => {
    const realAdapter = createTestAdapter();
    const ctx = new MigrationContext(realAdapter);
    await ctx.createTable("widgets", {}, () => {});
    await ctx.createTable("gadgets", {}, () => {});

    // Strip `tables()` so introspectTables routes through SchemaStatements.
    const stripped = withoutMethods(realAdapter, ["tables"]);

    const tables = await introspectTables(stripped);

    expect(tables).toContain("widgets");
    expect(tables).toContain("gadgets");
  });
});

describe("introspectColumns", () => {
  it("uses adapter.columns() when the adapter implements it", async () => {
    let calledWith: string | undefined;
    const fakeCols = [{ name: "id" }, { name: "name" }];
    const adapter = {
      async columns(table: string): Promise<unknown[]> {
        calledWith = table;
        return fakeCols;
      },
    } as unknown as Parameters<typeof introspectColumns>[0];

    const cols = await introspectColumns(adapter, "users");

    expect(calledWith).toBe("users");
    expect(cols).toBe(fakeCols);
  });

  it("falls back to SchemaStatements when the adapter doesn't implement columns()", async () => {
    const realAdapter = createTestAdapter();
    const ctx = new MigrationContext(realAdapter);
    await ctx.createTable("widgets", {}, (t) => {
      t.string("name");
      t.integer("age");
    });

    // Strip `columns()` so introspectColumns routes through SchemaStatements.
    const stripped = withoutMethods(realAdapter, ["columns"]);

    const cols = await introspectColumns(stripped, "widgets");
    const names = cols.map((c) => c.name).sort();

    expect(names).toEqual(["age", "id", "name"]);
  });
});
