import { describe, it, expect } from "vitest";
import { createTestAdapter } from "./test-adapter.js";
import { MigrationContext } from "./migration.js";
import {
  introspectTables,
  introspectColumns,
  introspectIndexes,
  introspectPrimaryKey,
} from "./schema-introspection.js";

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

describe("introspectIndexes", () => {
  it("uses adapter.indexes() when the adapter implements it", async () => {
    let calledWith: string | undefined;
    const fakeIndexes = [{ name: "idx_users_email", columns: ["email"], unique: true }];
    const adapter = {
      async indexes(table: string): Promise<unknown[]> {
        calledWith = table;
        return fakeIndexes;
      },
    } as unknown as Parameters<typeof introspectIndexes>[0];

    const idxs = await introspectIndexes(adapter, "users");

    expect(calledWith).toBe("users");
    expect(idxs).toBe(fakeIndexes);
  });

  it("falls back to SchemaStatements when the adapter doesn't implement indexes()", async () => {
    const realAdapter = createTestAdapter();
    const ctx = new MigrationContext(realAdapter);
    await ctx.createTable("widgets", {}, (t) => {
      t.string("name");
    });
    await ctx.addIndex("widgets", ["name"], { name: "idx_widgets_name" });

    const stripped = withoutMethods(realAdapter, ["indexes"]);

    const idxs = await introspectIndexes(stripped, "widgets");

    expect(idxs.some((i) => i.name === "idx_widgets_name")).toBe(true);
  });
});

describe("introspectPrimaryKey", () => {
  it("uses adapter.primaryKey() when the adapter implements it", async () => {
    let calledWith: string | undefined;
    const adapter = {
      async primaryKey(table: string): Promise<string | null> {
        calledWith = table;
        return "id";
      },
    } as unknown as Parameters<typeof introspectPrimaryKey>[0];

    const pk = await introspectPrimaryKey(adapter, "users");

    expect(calledWith).toBe("users");
    expect(pk).toEqual(["id"]);
  });

  it("returns composite PK as ordered array from adapter.primaryKey()", async () => {
    const adapter = {
      async primaryKey(_table: string): Promise<string[]> {
        return ["b", "a"]; // PK constraint order, not declaration order
      },
    } as unknown as Parameters<typeof introspectPrimaryKey>[0];

    expect(await introspectPrimaryKey(adapter, "t")).toEqual(["b", "a"]);
  });

  it("returns empty array when adapter.primaryKey() returns null", async () => {
    const adapter = {
      async primaryKey(_table: string): Promise<null> {
        return null;
      },
    } as unknown as Parameters<typeof introspectPrimaryKey>[0];

    expect(await introspectPrimaryKey(adapter, "t")).toEqual([]);
  });

  it("falls back to columns with primaryKey===true when adapter lacks primaryKey()", async () => {
    const realAdapter = createTestAdapter();
    const ctx = new MigrationContext(realAdapter);
    await ctx.createTable("widgets", {}, (t) => {
      t.string("name");
    });

    const stripped = withoutMethods(realAdapter, ["primaryKey"]);

    const pk = await introspectPrimaryKey(stripped, "widgets");

    expect(pk).toEqual(["id"]);
  });
});
