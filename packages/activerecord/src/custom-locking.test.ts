import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter, type TestDatabaseAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { withTransactionalFixtures } from "./test-helpers/with-transactional-fixtures.js";

let adapter: TestDatabaseAdapter;

beforeAll(async () => {
  adapter = createTestAdapter();
  await defineSchema(adapter, {
    posts: { title: "string", lock_version: "integer" },
  });
});
withTransactionalFixtures(() => adapter);

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
