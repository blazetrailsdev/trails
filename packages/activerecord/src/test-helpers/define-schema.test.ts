import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { defineSchema } from "./define-schema.js";

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

  it("dropExisting drops first then creates", async () => {
    await defineSchema(adapter, { items: { name: "string" } });
    await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('old')`);

    await defineSchema(adapter, { items: { name: "string" } }, { dropExisting: true });

    const rows = await adapter.execute(`SELECT * FROM "items"`);
    expect(rows).toHaveLength(0);
  });
});
