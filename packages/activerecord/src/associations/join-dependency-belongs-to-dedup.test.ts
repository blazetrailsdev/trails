import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";

describe("JoinDependency cross-parent belongsTo dedup", () => {
  let adapter: any;

  class Author extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("name", "string");
    }
  }

  class Post extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("title", "string");
      this.attribute("author_id", "integer");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    for (const m of [Author, Post]) {
      (m as any).adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }

    Associations.belongsTo.call(Post, "author", { className: "Author" });
  });

  it("shares a single author instance across posts with the same author", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("author");

    const rows = [
      { t0_r0: 1, t0_r1: "Post A", t0_r2: 42, t1_r0: 42, t1_r1: "Alice" },
      { t0_r0: 2, t0_r1: "Post B", t0_r2: 42, t1_r0: 42, t1_r1: "Alice" },
      { t0_r0: 3, t0_r1: "Post C", t0_r2: 42, t1_r0: 42, t1_r1: "Alice" },
    ];

    const { parents } = jd.instantiateFromRows(rows);

    expect(parents).toHaveLength(3);

    const authors = parents.map((p: any) => {
      const proxy = p.association("author");
      return proxy?.target;
    });

    expect(authors[0]).toBeDefined();
    expect(authors[0]).toBe(authors[1]);
    expect(authors[0]).toBe(authors[2]);
  });

  it("creates distinct instances for different authors", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("author");

    const rows = [
      { t0_r0: 1, t0_r1: "Post A", t0_r2: 42, t1_r0: 42, t1_r1: "Alice" },
      { t0_r0: 2, t0_r1: "Post B", t0_r2: 99, t1_r0: 99, t1_r1: "Bob" },
    ];

    const { parents } = jd.instantiateFromRows(rows);

    const author1 = parents[0].association("author")?.target;
    const author2 = parents[1].association("author")?.target;

    expect(author1).toBeDefined();
    expect(author2).toBeDefined();
    expect(author1).not.toBe(author2);
  });
});
