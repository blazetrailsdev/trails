import { describe, it, expect, beforeEach } from "vitest";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { defineSchema } from "./define-schema.js";

let adapter: DatabaseAdapter;

beforeEach(() => {
  adapter = createTestAdapter();
});

describe("defineSchema", () => {
  it("creates a single table with all column types", async () => {
    await defineSchema(adapter, {
      things: {
        name: "string",
        body: "text",
        count: "integer",
        big_count: "big_integer",
        ratio: "float",
        price: "decimal",
        active: "boolean",
        created_at: "datetime",
        born_on: "date",
        wakeup: "time",
        data: "binary",
        meta: "json",
      },
    });

    await adapter.executeMutation(
      `INSERT INTO "things" ("name","body","count","big_count","ratio","price","active","created_at","born_on","wakeup","data","meta") VALUES ('x','y',1,2,1.5,9.99,1,'2024-01-01','2024-01-01','08:00','\\x00','{}')`,
    );
    const rows = await adapter.execute(`SELECT * FROM "things"`);
    expect(rows).toHaveLength(1);
  });

  it("creates two tables with a references FK in correct order", async () => {
    await defineSchema(adapter, {
      comments: {
        body: "text",
        post_id: { type: "integer", references: "posts" },
      },
      posts: {
        title: "string",
      },
    });

    await adapter.executeMutation(`INSERT INTO "posts" ("title") VALUES ('hello')`);
    const [post] = await adapter.execute(`SELECT "id" FROM "posts"`);
    await adapter.executeMutation(
      `INSERT INTO "comments" ("body","post_id") VALUES ('world',${post["id"]})`,
    );
    const rows = await adapter.execute(`SELECT * FROM "comments"`);
    expect(rows).toHaveLength(1);
  });

  it("topo sort handles a 3-table chain", async () => {
    await expect(
      defineSchema(adapter, {
        c: { b_id: { type: "integer", references: "b" } },
        b: { a_id: { type: "integer", references: "a" } },
        a: { name: "string" },
      }),
    ).resolves.toBeUndefined();

    await adapter.executeMutation(`INSERT INTO "a" ("name") VALUES ('one')`);
    const [aRow] = await adapter.execute(`SELECT "id" FROM "a"`);
    await adapter.executeMutation(`INSERT INTO "b" ("a_id") VALUES (${aRow["id"]})`);
    const [bRow] = await adapter.execute(`SELECT "id" FROM "b"`);
    await adapter.executeMutation(`INSERT INTO "c" ("b_id") VALUES (${bRow["id"]})`);
    expect(await adapter.execute(`SELECT * FROM "c"`)).toHaveLength(1);
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
