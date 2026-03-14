import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";

describe("DelegationTest", () => {
  it("not respond to arel method", () => {
    const adapter = createTestAdapter();
    class ArelPost extends Base {
      static {
        this._tableName = "arel_posts";
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const post = new ArelPost({ title: "test" });
    expect("arel" in post).toBe(false);
  });

  it("delegate querying methods", async () => {
    const adapter = createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const all = await Post.all().toArray();
    expect(all.length).toBe(2);
    const filtered = await Post.where({ title: "a" }).toArray();
    expect(filtered.length).toBe(1);
    const ordered = Post.order("title");
    expect(ordered.toSql()).toContain("ORDER");
  });

  it("delegation doesn't override methods defined in other relation subclasses", () => {
    const adapter = createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const r1 = Post.where({ title: "x" });
    const r2 = Post.where({ title: "y" });
    expect(r1.toSql()).not.toBe(r2.toSql());
  });
});
