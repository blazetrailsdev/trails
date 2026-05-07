import { describe, it, expect, beforeAll } from "vitest";
import { Base, Relation } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

let adapter: DatabaseAdapter;

beforeAll(() => {
  adapter = createTestAdapter();
});

describe("QueryingTest — static forwarders on Base", () => {
  let Post: typeof Base;

  beforeAll(() => {
    class PostClass extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    Post = PostClass;
  });

  it("includes() returns a Relation without throwing", () => {
    expect(Post.includes("author")).toBeInstanceOf(Relation);
  });

  it("preload() returns a Relation", () => {
    expect(Post.preload("comments")).toBeInstanceOf(Relation);
  });

  it("eagerLoad() returns a Relation", () => {
    expect(Post.eagerLoad("author")).toBeInstanceOf(Relation);
  });

  it("references() returns a Relation", () => {
    expect(Post.references("authors")).toBeInstanceOf(Relation);
  });

  it("extending() returns a Relation", () => {
    expect(Post.extending()).toBeInstanceOf(Relation);
  });

  it("unscope() static forwarder returns a Relation", () => {
    expect(Post.unscope("where")).toBeInstanceOf(Relation);
  });

  it("reselect() returns a Relation", () => {
    expect(Post.reselect("title")).toBeInstanceOf(Relation);
  });

  it("reorder() returns a Relation", () => {
    expect(Post.reorder("title ASC")).toBeInstanceOf(Relation);
  });

  it("rewhere() returns a Relation", () => {
    expect(Post.rewhere({ title: "x" })).toBeInstanceOf(Relation);
  });

  it("regroup() returns a Relation", () => {
    expect(Post.regroup("status")).toBeInstanceOf(Relation);
  });

  it("having() returns a Relation", () => {
    expect(Post.having("COUNT(*) > 1")).toBeInstanceOf(Relation);
  });

  it("lock() returns a Relation", () => {
    expect(Post.lock()).toBeInstanceOf(Relation);
  });

  it("readonly() returns a Relation", () => {
    expect(Post.readonly()).toBeInstanceOf(Relation);
  });

  it("annotate() returns a Relation", () => {
    expect(Post.annotate("hint")).toBeInstanceOf(Relation);
  });

  it("or() returns a Relation", () => {
    expect(Post.where({ status: "a" }).or(Post.where({ status: "b" }))).toBeInstanceOf(Relation);
  });

  it("and() returns a Relation", () => {
    expect(Post.where({ status: "a" }).and(Post.where({ title: "x" }))).toBeInstanceOf(Relation);
  });

  it("inOrderOf() returns a Relation", () => {
    expect(Post.inOrderOf("status", ["draft", "published"])).toBeInstanceOf(Relation);
  });

  it("strictLoading() returns a Relation", () => {
    expect(Post.strictLoading()).toBeInstanceOf(Relation);
  });

  it("createWith() returns a Relation", () => {
    expect(Post.createWith({ status: "draft" })).toBeInstanceOf(Relation);
  });

  it("includes().where() chains and produces valid SQL", () => {
    const rel = Post.includes("author").where({ status: "published" });
    expect(rel).toBeInstanceOf(Relation);
    const sql = rel.toSql();
    expect(sql).toContain("post_classes");
  });

  it("invertWhere() static forwarder returns a Relation", () => {
    expect(Post.invertWhere()).toBeInstanceOf(Relation);
  });

  it("without() returns a Relation", () => {
    expect(Post.without()).toBeInstanceOf(Relation);
  });

  it("except() returns a Relation", () => {
    expect(Post.except()).toBeInstanceOf(Relation);
  });

  it("only() returns a Relation", () => {
    expect(Post.only("where")).toBeInstanceOf(Relation);
  });

  it("merge() returns a Relation", () => {
    expect(Post.merge(Post.where({ status: "draft" }))).toBeInstanceOf(Relation);
  });
});
