// Trails-only unit tests for the trails-invented `introspect*` helpers
// (introspectTables/Columns/Indexes/PrimaryKey) — no 1:1 Rails counterpart
// exists. The scratch tables these create (`widgets`) are real Rails
// migration-test table names (primary_keys_test.rb), not freshly-invented
// ones, per the RFC 0048 fidelity contract.
import { describe, it, expect, afterEach } from "vitest";
import { Base } from "./base.js";
import { adapterType } from "./test-adapter.js";
import { fixtures } from "./test-fixtures.js";
import {
  introspectTables,
  introspectColumns,
  introspectIndexes,
  introspectPrimaryKey,
} from "./schema-introspection.js";

// Ride the primary schema-loaded pool (`Base.connection`) instead of the
// sidecar test pool.
fixtures({}, { useTransactionalTests: false });

// The tables these tests create leak into the shared
// per-worker DB; drop them by name so they don't collide with sibling files.
afterEach(async () => {
  await Base.connection.dropTable("widgets", { ifExists: true });
});

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

  // `where` (partial-index predicate) is only reflected by adapters that
  // support partial indexes (sqlite/postgres — MySQL has none).
  it("surfaces where/orders carried by adapter.indexes()", async () => {
    const supportsPartial = adapterType === "sqlite" || adapterType === "postgres";
    const realAdapter = Base.connection;
    await realAdapter.createTable("widgets", {}, (t) => {
      t.string("name");
      t.boolean("active");
    });
    await realAdapter.addIndex("widgets", ["name"], {
      name: "idx_widgets_name_partial",
      ...(supportsPartial ? { where: "active" } : {}),
      order: { name: "desc" },
    });

    const idxs = await introspectIndexes(realAdapter, "widgets");
    const idx = idxs.find((i) => i.name === "idx_widgets_name_partial");

    // `where` and `orders` are now statically visible on IntrospectedIndex,
    // not just present at runtime under an `as`-cast. `orders` is only stored
    // when the backend honors index sort order (MariaDB < 10.8 silently drops
    // DESC, so the index is ascending and `orders` is undefined). When stored,
    // PostgreSQL collapses single-direction orders to a scalar (Rails'
    // concise_options); sqlite/mysql carry the per-column map.
    const supportsIndexSortOrder = (
      realAdapter as unknown as { supportsIndexSortOrder(): boolean }
    ).supportsIndexSortOrder();
    const expectedOrders = !supportsIndexSortOrder
      ? undefined
      : adapterType === "postgres"
        ? "desc"
        : { name: "desc" };
    expect(idx?.orders).toEqual(expectedOrders);
    expect(idx?.where).toBe(supportsPartial ? "active" : undefined);
  });

  // The postgres indexes() implementation builds `columns` from a `pg_attribute` join
  // that drops expression columns (attnum 0), so it must instead surface the raw
  // expression string parsed from pg_get_indexdef, mirroring the concrete
  // PostgreSQLSchemaStatements#indexes / Rails (schema_statements.rb:117).
  it.skipIf(adapterType !== "postgres")(
    "surfaces expression-index columns from adapter.indexes()",
    async () => {
      const realAdapter = Base.connection;
      await realAdapter.createTable("widgets", {}, (t) => {
        t.string("name");
      });
      await realAdapter.addIndex("widgets", "lower(name)", { name: "idx_widgets_lower_name" });

      const idxs = await introspectIndexes(realAdapter, "widgets");
      const idx = idxs.find((i) => i.name === "idx_widgets_lower_name");

      expect(idx?.columns).toBe("lower((name)::text)");
    },
  );
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
});
