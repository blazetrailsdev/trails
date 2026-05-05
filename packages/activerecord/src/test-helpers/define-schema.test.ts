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
        meta: "json",
      },
    });

    await adapter.executeMutation(
      `INSERT INTO "things" ("name","body","count","big_count","ratio","price","created_at","born_on","meta") VALUES ('x','y',1,2,1.5,9.99,'2024-01-01','2024-01-01','{}')`,
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

  it("dropExisting drops first then creates", async () => {
    await defineSchema(adapter, { items: { name: "string" } });
    await adapter.executeMutation(`INSERT INTO "items" ("name") VALUES ('old')`);

    await defineSchema(adapter, { items: { name: "string" } }, { dropExisting: true });

    const rows = await adapter.execute(`SELECT * FROM "items"`);
    expect(rows).toHaveLength(0);
  });
});
