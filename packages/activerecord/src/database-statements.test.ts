import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";

describe("DatabaseStatementsTest", () => {
  it("insert should return the inserted id", async () => {
    const adapter = createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const post = await Post.create({ title: "Test" });
    expect(post.id).toBeDefined();
    expect(post.id).not.toBeNull();
  });

  it("create should return the inserted id", async () => {
    const adapter = createTestAdapter();
    class Article extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const article = await Article.create({ title: "Created" });
    expect(article.id).toBeDefined();
    expect(typeof article.id).toBe("number");
  });
});
