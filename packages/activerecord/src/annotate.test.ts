import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";

setupHandlerSuite();

describe("AnnotateTest", () => {
  it("annotate wraps content in an inline comment", () => {
    class Post extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
      }
    }
    const sql = Post.select("id").annotate("foo").toSql();
    expect(sql).toMatch(/\/\* foo \*\//);
  });

  it("annotate is sanitized", () => {
    class Post extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
      }
    }
    const sql = Post.select("id").annotate("*/foo/*").toSql();
    expect(sql).toContain("foo");

    const sql2 = Post.select("id").annotate("**//foo//**").toSql();
    expect(sql2).toContain("foo");

    const sql3 = Post.select("id").annotate("*/foo/*").annotate("*/bar").toSql();
    expect(sql3).toContain("foo");
    expect(sql3).toContain("bar");

    const sql4 = Post.select("id").annotate("+ MAX_EXECUTION_TIME(1)").toSql();
    expect(sql4).toContain("MAX_EXECUTION_TIME");
  });
});
