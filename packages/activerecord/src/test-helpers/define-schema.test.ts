import { describe, it, expect, beforeEach, vi } from "vitest";
import { adapterType, createSidecarTestAdapter, createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { clearAppliedSchemaSignatures, defineSchema, type ColumnSpec } from "./define-schema.js";
import { dropAllTables } from "./drop-all-tables.js";

let adapter: DatabaseAdapter;

beforeEach(() => {
  adapter = createTestAdapter();
});

describe("defineSchema", () => {
  it("creates a single table with common column types", async () => {
    await defineSchema(adapter, {
      things: {
        name: "string",
        body: "text",
        count: "integer",
        big_count: "big_integer",
        ratio: "float",
        price: "decimal",
        created_at: "datetime",
        born_on: "date",
        start_time: "time",
        meta: "json",
      },
    });

    await adapter.executeMutation(
      `INSERT INTO "things" ("name","body","count","big_count","ratio","price","created_at","born_on","start_time","meta") VALUES ('x','y',1,2,1.5,9.99,'2024-01-01','2024-01-01','11:30:00','{}')`,
    );
    const rows = await adapter.execute(`SELECT * FROM "things"`);
    expect(rows).toHaveLength(1);
  });

  it("creates two tables with a references FK in correct order", async () => {
    const spy = vi.spyOn(adapter, "executeMutation");

    await defineSchema(adapter, {
      comments: {
        body: "text",
        post_id: { type: "integer", references: "posts" },
      },
      posts: {
        title: "string",
      },
    });

    const createCalls = spy.mock.calls
      .map((c) => c[0] as string)
      .filter((sql) => /CREATE TABLE/i.test(sql));
    expect(createCalls[0]).toMatch(/\bposts\b/);
    expect(createCalls[1]).toMatch(/\bcomments\b/);
  });

  it("topo sort handles a 3-table chain", async () => {
    const spy = vi.spyOn(adapter, "executeMutation");

    await defineSchema(adapter, {
      c: { b_id: { type: "integer", references: "b" } },
      b: { a_id: { type: "integer", references: "a" } },
      a: { name: "string" },
    });

    const order = spy.mock.calls
      .map((c) => c[0] as string)
      .filter((sql) => /CREATE TABLE/i.test(sql))
      .map((sql) => sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"']?(\w+)[`"']?/i)?.[1]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("self-referential table does not throw", async () => {
    await expect(
      defineSchema(adapter, {
        categories: { parent_id: { type: "integer", references: "categories" } },
      }),
    ).resolves.toBeUndefined();
  });

  it("cycle throws clearly", async () => {
    await expect(
      defineSchema(adapter, {
        x: { y_id: { type: "integer", references: "y" } },
        y: { x_id: { type: "integer", references: "x" } },
      }),
    ).rejects.toThrow(/circular reference/);
  });

  describe("wrapped { columns, primaryKey } shape", () => {
    it("composite primary key produces a PRIMARY KEY constraint over the named columns", async () => {
      await defineSchema(adapter, {
        comp: {
          columns: { shop_id: "integer", order_number: "integer", name: "string" },
          primaryKey: ["shop_id", "order_number"],
        },
      });
      // Both rows differ in (shop_id, order_number) → both insert.
      await adapter.executeMutation(
        `INSERT INTO "comp" ("shop_id","order_number","name") VALUES (1,1,'a'),(1,2,'b')`,
      );
      // Same composite key → should reject.
      await expect(
        adapter.executeMutation(
          `INSERT INTO "comp" ("shop_id","order_number","name") VALUES (1,1,'dup')`,
        ),
      ).rejects.toThrow();
    });

    it("single-element primaryKey array names a non-id PK column (also NOT NULL)", async () => {
      // The wrapper's documented form for a single-column non-`id` PK is
      // `primaryKey: [name]` — cover that path so regressions don't slip
      // past the composite-key test below.
      await defineSchema(adapter, {
        single_pk: { columns: { code: "string", label: "string" }, primaryKey: ["code"] },
      });
      await adapter.executeMutation(`INSERT INTO "single_pk" ("code","label") VALUES ('a','x')`);
      await expect(
        adapter.executeMutation(`INSERT INTO "single_pk" ("code","label") VALUES ('a','y')`),
      ).rejects.toThrow();
      await expect(
        adapter.executeMutation(`INSERT INTO "single_pk" ("code","label") VALUES (NULL,'z')`),
      ).rejects.toThrow();
      const rows = (await adapter.execute(`SELECT * FROM "single_pk"`)) as Array<
        Record<string, unknown>
      >;
      expect(rows).toHaveLength(1);
      // No auto `id` column when wrapper.primaryKey is set.
      expect("id" in rows[0]).toBe(false);
    });

    it("composite primary key columns are NOT NULL (matches Rails; SQLite quirk-proof)", async () => {
      await defineSchema(adapter, {
        cpk_nn: {
          columns: { a: "integer", b: "integer", name: "string" },
          primaryKey: ["a", "b"],
        },
      });
      // SQLite otherwise accepts NULLs in composite-PK columns; we forbid it.
      await expect(
        adapter.executeMutation(`INSERT INTO "cpk_nn" ("a","b","name") VALUES (NULL,1,'x')`),
      ).rejects.toThrow();
      await expect(
        adapter.executeMutation(`INSERT INTO "cpk_nn" ("a","b","name") VALUES (1,NULL,'x')`),
      ).rejects.toThrow();
    });

    it("primaryKey: false creates a table with no primary key (no auto id column)", async () => {
      await defineSchema(adapter, {
        no_pk: { columns: { tag: "string" }, primaryKey: false },
      });
      // No "id" column present.
      await adapter.executeMutation(`INSERT INTO "no_pk" ("tag") VALUES ('x')`);
      const rows = (await adapter.execute(`SELECT * FROM "no_pk"`)) as Array<
        Record<string, unknown>
      >;
      expect(rows).toHaveLength(1);
      expect("id" in rows[0]).toBe(false);
    });

    it("STI columns map with a 'type' column is recognised as the wrapper shape", async () => {
      // Regression: an earlier discriminator looked for `type` inside the
      // `columns` value to reject ColumnSpec object shapes, which made STI
      // wrappers (columns: { type: "string", ... }) misclassify as legacy
      // and silently drop the primaryKey directive.
      await defineSchema(adapter, {
        sti: {
          columns: { type: "string", name: "string" },
          primaryKey: false,
        },
      });
      await adapter.executeMutation(`INSERT INTO "sti" ("type","name") VALUES ('Dog','Rex')`);
      const rows = (await adapter.execute(`SELECT * FROM "sti"`)) as Array<Record<string, unknown>>;
      expect(rows[0]["type"]).toBe("Dog");
      expect("id" in rows[0]).toBe(false);
    });

    it("legacy table with columns both named 'columns' and 'primaryKey' stays legacy (primaryKey is not wrapper-shaped)", async () => {
      // primaryKey here is a column name with a ColumnSpec value, not a
      // string[]/false marker. The discriminator must validate the
      // primaryKey value's shape before treating the table as a wrapper.
      await defineSchema(adapter, {
        legacy_pk_col: {
          columns: { type: "string" },
          primaryKey: "string",
        } as unknown as Record<string, ColumnSpec>,
      });
      await adapter.executeMutation(
        `INSERT INTO "legacy_pk_col" ("columns","primaryKey") VALUES ('a','b')`,
      );
      const rows = (await adapter.execute(`SELECT * FROM "legacy_pk_col"`)) as Array<
        Record<string, unknown>
      >;
      expect(rows[0]["columns"]).toBe("a");
      expect(rows[0]["primaryKey"]).toBe("b");
    });

    it("legacy single-column table named 'columns' with object ColumnSpec stays legacy", async () => {
      // Corner case: `{ columns: { type: "string" } }` is structurally
      // indistinguishable from a wrapper with one column named `type` if
      // the discriminator only inspects `columns`. Requiring `primaryKey`
      // on the wrapper means a legacy ColumnSpec-object shape like this
      // unambiguously stays legacy.
      await defineSchema(adapter, {
        reports2: { columns: { type: "string" } },
      });
      await adapter.executeMutation(`INSERT INTO "reports2" ("columns") VALUES ('hi')`);
      const rows = (await adapter.execute(`SELECT * FROM "reports2"`)) as Array<
        Record<string, unknown>
      >;
      expect(rows[0]["columns"]).toBe("hi");
    });

    it("does not mis-classify a legacy column literally named 'columns'", async () => {
      // The discriminator must require `columns` to be an object map (not a
      // ColumnSpec string/object) — otherwise a legacy table with a column
      // called "columns" would be parsed as the wrapper shape.
      await defineSchema(adapter, {
        reports: { columns: "string", count: "integer" },
      });
      await adapter.executeMutation(`INSERT INTO "reports" ("columns","count") VALUES ('hello',1)`);
      const rows = (await adapter.execute(`SELECT * FROM "reports"`)) as Array<
        Record<string, unknown>
      >;
      expect(rows[0]["columns"]).toBe("hello");
    });
  });

  // PG-only-type guards fire only on MySQL/SQLite — skip these when the
  // test adapter resolves to PG. PG positive path lives in
  // adapters/postgresql/define-schema-pg-types.test.ts.
  describe.skipIf(adapterType === "postgres")("PG-only column types", () => {
    it("rejects citext/hstore/uuid/interval/oid against non-PG adapters", async () => {
      for (const ty of ["citext", "hstore", "uuid", "interval", "oid"] as const) {
        await expect(
          defineSchema(adapter, { t: { col: ty } }, { dropExisting: true }),
        ).rejects.toThrow(/PostgreSQL-only type/);
      }
    });

    it("rejects array:true against non-PG adapters", async () => {
      await expect(
        defineSchema(adapter, {
          t: { tags: { type: "integer", array: true } },
        }),
      ).rejects.toThrow(/array:true.*PostgreSQL-only/);
    });
  });

  describe("idempotency", () => {
    function ddlCounts(sqls: string[]): { creates: number; drops: number } {
      return {
        creates: sqls.filter((s) => /CREATE TABLE/i.test(s)).length,
        drops: sqls.filter((s) => /DROP TABLE/i.test(s)).length,
      };
    }

    it("re-running with the same schema emits no DDL", async () => {
      await defineSchema(adapter, {
        widgets: { name: "string", count: "integer" },
      });

      const spy = vi.spyOn(adapter, "executeMutation");
      await defineSchema(adapter, {
        widgets: { name: "string", count: "integer" },
      });

      const { creates, drops } = ddlCounts(spy.mock.calls.map((c) => c[0] as string));
      expect(creates).toBe(0);
      expect(drops).toBe(0);
    });

    it("changed column type drops + recreates only the changed table", async () => {
      await defineSchema(adapter, {
        a: { name: "string" },
        b: { count: "integer" },
        c: { ratio: "float" },
      });

      const spy = vi.spyOn(adapter, "executeMutation");
      await defineSchema(adapter, {
        a: { name: "string" },
        b: { count: "string" }, // type changed
        c: { ratio: "float" },
      });

      const sqls = spy.mock.calls.map((c) => c[0] as string);
      const creates = sqls.filter((s) => /CREATE TABLE/i.test(s));
      const drops = sqls.filter((s) => /DROP TABLE/i.test(s));
      expect(drops).toHaveLength(1);
      expect(drops[0]).toMatch(/\bb\b/);
      expect(creates).toHaveLength(1);
      expect(creates[0]).toMatch(/\bb\b/);
    });

    it("adding a column to one table leaves siblings alone", async () => {
      await defineSchema(adapter, {
        p: { title: "string" },
        q: { label: "string" },
      });

      const spy = vi.spyOn(adapter, "executeMutation");
      await defineSchema(adapter, {
        p: { title: "string", extra: "integer" }, // column added
        q: { label: "string" },
      });

      const sqls = spy.mock.calls.map((c) => c[0] as string);
      const touchedQ = sqls.some((s) => /\bq\b/.test(s) && /(CREATE|DROP) TABLE/i.test(s));
      expect(touchedQ).toBe(false);
      const createsP = sqls.filter((s) => /CREATE TABLE/i.test(s) && /\bp\b/.test(s));
      expect(createsP).toHaveLength(1);
    });

    it("dropExisting forces full drop+recreate even when schemas match", async () => {
      await defineSchema(adapter, { items: { name: "string" } });

      const spy = vi.spyOn(adapter, "executeMutation");
      await defineSchema(adapter, { items: { name: "string" } }, { dropExisting: true });

      const { creates, drops } = ddlCounts(spy.mock.calls.map((c) => c[0] as string));
      expect(creates).toBeGreaterThanOrEqual(1);
      expect(drops).toBeGreaterThanOrEqual(1);
    });
  });

  it("dropExisting drops first then creates", async () => {
    await defineSchema(adapter, { items: { name: "string" } });
    await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('old')`);

    await defineSchema(adapter, { items: { name: "string" } }, { dropExisting: true });

    const rows = await adapter.execute(`SELECT * FROM "items"`);
    expect(rows).toHaveLength(0);
  });

  describe("clearAppliedSchemaSignatures", () => {
    // Regression: under the sidecar shape a single shared raw adapter
    // survives across tests, so the signature cache must be invalidated
    // alongside dropAllTables — otherwise defineSchema(sameSpec) no-ops
    // over a now-missing table.
    //
    // Use the raw sidecar adapter (no `tables: Set`) so this exercises the
    // cache-only path. The wrapper's `tables` Set would let
    // `adapterKnownTables` detect the drop and force DDL re-execution
    // without the explicit clear, masking the bug.
    it("re-runs DDL after the table is dropped underneath the cache (per-adapter clear)", async () => {
      const { adapter: raw } = createSidecarTestAdapter();
      const spec = { widgets: { name: "string" as ColumnSpec } };
      await defineSchema(raw, spec);
      await dropAllTables(raw);
      clearAppliedSchemaSignatures(raw);

      await defineSchema(raw, spec);

      await expect(
        raw.executeMutation(`INSERT INTO widgets (name) VALUES ('ok')`),
      ).resolves.toBeDefined();
    });

    it("no-arg form rebinds the WeakMap so the next defineSchema re-runs DDL", async () => {
      const { adapter: raw } = createSidecarTestAdapter();
      const spec = { gizmos: { name: "string" as ColumnSpec } };
      await defineSchema(raw, spec);
      await dropAllTables(raw);
      clearAppliedSchemaSignatures();

      await defineSchema(raw, spec);
      await expect(
        raw.executeMutation(`INSERT INTO gizmos (name) VALUES ('ok')`),
      ).resolves.toBeDefined();
    });
  });

  describe("IF NOT EXISTS idempotency", () => {
    // Regression: when the signature cache is cleared (e.g. between vitest
    // files sharing one pooled adapter) while the table remains in the DB,
    // defineSchema must not throw "table already exists". Simulated by
    // clearing the cache after the first call without dropping the table.
    it("does not throw when the table already exists and the cache was cleared", async () => {
      const { adapter: raw } = createSidecarTestAdapter();
      const spec = { sprockets: { name: "string" as ColumnSpec } };
      await defineSchema(raw, spec);
      // Simulate File B: cache is gone, but the table is still in the DB.
      clearAppliedSchemaSignatures(raw);

      await expect(defineSchema(raw, spec)).resolves.toBeUndefined();
    });
  });
});
