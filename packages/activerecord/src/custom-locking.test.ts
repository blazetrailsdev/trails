import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";

function freshAdapter() {
  return createTestAdapter();
}

describe("CustomLockingTest", () => {
  it("custom lock", async () => {
    const adapter = freshAdapter();
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
    expect(p.readAttribute("lock_version")).toBe(1);
  });
});
