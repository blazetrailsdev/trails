import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../index.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({
    arel_posts: { title: "string" },
    posts: { title: "string" },
  });
});
describe("DelegationTest", () => {
  it("not respond to arel method", () => {
    class ArelPost extends Base {
      static {
        this._tableName = "arel_posts";
        this.attribute("title", "string");
      }
    }
    const post = new ArelPost({ title: "test" });
    expect("arel" in post).toBe(false);
  });

  describe("QueryingMethodsDelegationTest", () => {
    it("delegate querying methods", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
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
  }); // QueryingMethodsDelegationTest

  describe("DelegationCachingTest", () => {
    it("delegation doesn't override methods defined in other relation subclasses", () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
        }
      }
      const r1 = Post.where({ title: "x" });
      const r2 = Post.where({ title: "y" });
      expect(r1.toSql()).not.toBe(r2.toSql());
    });
  }); // DelegationCachingTest
});
