import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";

describe("AnnotateTest", () => {
  it("annotate wraps content in an inline comment", () => {
    const adapter = createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().annotate("my-hint").toSql();
    expect(sql).toContain("my-hint");
  });

  it("annotate is sanitized", () => {
    const adapter = createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().annotate("safe-hint").toSql();
    expect(sql).toContain("safe-hint");
  });
});
