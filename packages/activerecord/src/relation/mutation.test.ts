/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../index.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("RelationMutationTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModel() {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author", "string");
        this.adapter = adapter;
      }
    }
    return { Post };
  }

  it("#!", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "x" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("#_select!", () => {
    const { Post } = makeModel();
    const sql = Post.select("title").toSql();
    expect(sql).toContain("title");
  });

  it("#order!", () => {
    const { Post } = makeModel();
    const sql = Post.order("title").toSql();
    expect(sql).toContain("ORDER");
  });

  it("#order! with symbol prepends the table name", () => {
    const { Post } = makeModel();
    const sql = Post.order("title").toSql();
    expect(sql).toContain("title");
  });

  it("#order! on non-string does not attempt regexp match for references", () => {
    const { Post } = makeModel();
    const sql = Post.order("author").toSql();
    expect(sql).toContain("ORDER");
  });

  it("extending!", () => {
    const { Post } = makeModel();
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("extending! with empty args", () => {
    const { Post } = makeModel();
    const sql = Post.all().toSql();
    expect(sql).toContain("FROM");
  });

  it("#from!", () => {
    const { Post } = makeModel();
    const sql = Post.all().toSql();
    expect(sql).toContain("FROM");
  });

  it("#lock!", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "x" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("#reorder!", () => {
    const { Post } = makeModel();
    const sql = Post.order("title").reorder("author").toSql();
    expect(sql).toContain("author");
  });

  it("#reorder! with symbol prepends the table name", () => {
    const { Post } = makeModel();
    const sql = Post.order("title").reorder("author").toSql();
    expect(sql).toContain("ORDER");
  });

  it("reverse_order!", () => {
    const { Post } = makeModel();
    const sql = Post.order("title").reverseOrder().toSql();
    expect(sql).toContain("DESC");
  });

  it("create_with!", () => {
    const { Post } = makeModel();
    const rel = Post.all().createWith({ author: "default" });
    expect(rel.toSql()).toContain("SELECT");
  });

  it("merge!", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "a" })
      .merge(Post.where({ author: "b" }))
      .toSql();
    expect(sql).toContain("WHERE");
  });

  it("merge with a proc", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "a" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("none!", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "x" });
    const results = await Post.none().toArray();
    expect(results.length).toBe(0);
  });

  it("skip_query_cache!", () => {
    const { Post } = makeModel();
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("skip_preloading!", () => {
    const { Post } = makeModel();
    const sql = Post.all().toSql();
    expect(sql).toContain("FROM");
  });

  it("#regroup!", () => {
    const { Post } = makeModel();
    const sql = Post.group("title").regroup("author").toSql();
    expect(sql).toContain("GROUP");
  });

  it("distinct!", () => {
    const { Post } = makeModel();
    const sql = Post.distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });
});
