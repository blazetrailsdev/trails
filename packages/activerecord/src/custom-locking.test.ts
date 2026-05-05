import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { dropAllTables } from "./test-helpers/drop-all-tables.js";
import type { DatabaseAdapter } from "./adapter.js";

let adapter: DatabaseAdapter;

beforeAll(() => {
  adapter = createTestAdapter();
});
beforeEach(async () => {
  await defineSchema(adapter, {
    posts: { title: "string", lock_version: "integer" },
  });
});
afterAll(async () => {
  await dropAllTables(adapter);
});

describe("CustomLockingTest", () => {
  it("custom lock", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("title", "string");
        this.attribute("lock_version", "integer", { default: 0 });
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ title: "test" });
    await p.update({ title: "updated" });
    expect(p.lock_version).toBe(1);
  });
});
