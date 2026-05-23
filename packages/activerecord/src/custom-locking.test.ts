import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({
    posts: { title: "string", lock_version: "integer" },
  });
});
describe("CustomLockingTest", () => {
  it("custom lock", async () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("title", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const p = await Post.create({ title: "test" });
    await p.update({ title: "updated" });
    expect(p.lock_version).toBe(1);
  });
});
