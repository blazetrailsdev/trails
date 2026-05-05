import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

let adapter: DatabaseAdapter;

beforeAll(() => {
  adapter = createTestAdapter();
});

describe("AnnotateTest", () => {
  it("annotate wraps content in an inline comment", () => {
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
