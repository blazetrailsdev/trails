import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";

describe("JoinDependency nested hydration", () => {
  let adapter: any;

  // prettier-ignore
  class Author extends Base {
    static { this.attribute("id", "integer"); this.attribute("name", "string"); }
  }
  // prettier-ignore
  class Comment extends Base {
    static { this.attribute("id", "integer"); this.attribute("body", "string"); this.attribute("post_id", "integer"); this.attribute("author_id", "integer"); }
  }
  // prettier-ignore
  class Post extends Base {
    static { this.attribute("id", "integer"); this.attribute("title", "string"); }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    for (const m of [Author, Comment, Post]) {
      (m as any).adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }
    Associations.hasMany.call(Post, "comments", { className: "Comment" });
    Associations.belongsTo.call(Comment, "author", { className: "Author" });
  });

  it("eager association loading grafts stashed associations to correct parent", () => {
    const jd = new JoinDependency(Post);
    jd.addNestedAssociation("comments.author");

    // prettier-ignore
    const rows = [
      { t0_r0: 1, t0_r1: "Post A", t1_r0: 10, t1_r1: "Comment 1", t1_r2: 1, t1_r3: 42, t2_r0: 42, t2_r1: "Alice" },
      { t0_r0: 1, t0_r1: "Post A", t1_r0: 11, t1_r1: "Comment 2", t1_r2: 1, t1_r3: 42, t2_r0: 42, t2_r1: "Alice" },
    ];

    const { parents } = jd.instantiateFromRows(rows);

    expect(parents).toHaveLength(1);
    const post = parents[0];

    const commentsProxy = post.association("comments");
    expect(commentsProxy.target).toHaveLength(2);

    const comment1 = commentsProxy.target[0];
    const comment2 = commentsProxy.target[1];

    const authorProxy1 = comment1.association("author");
    const authorProxy2 = comment2.association("author");
    expect(authorProxy1?.target).toBeDefined();
    expect(authorProxy1?.target.readAttribute("name")).toBe("Alice");
    expect(authorProxy2?.target).toBeDefined();
    expect(authorProxy1?.target).toBe(authorProxy2?.target);

    expect((comment1 as any)._preloadedAssociations?.get("author")).toBeDefined();
    expect((post as any)._preloadedAssociations?.has("author")).toBeFalsy();
  });

  it("eager association loading with cascaded two levels and one level", () => {
    const jd = new JoinDependency(Post);
    jd.addNestedAssociation("comments.author");

    // prettier-ignore
    const rows = [
      { t0_r0: 1, t0_r1: "Post A", t1_r0: 10, t1_r1: "C1", t1_r2: 1, t1_r3: 42, t2_r0: 42, t2_r1: "Alice" },
      { t0_r0: 2, t0_r1: "Post B", t1_r0: 20, t1_r1: "C2", t1_r2: 2, t1_r3: 42, t2_r0: 42, t2_r1: "Alice" },
    ];

    const { parents } = jd.instantiateFromRows(rows);
    expect(parents).toHaveLength(2);
    const a1 = parents[0].association("comments").target[0].association("author")?.target;
    const a2 = parents[1].association("comments").target[0].association("author")?.target;
    expect(a1).toBeDefined();
    expect(a1).toBe(a2);
  });

  it("nested records are not readonly by default when no reflection scope marks readonly", () => {
    const jd = new JoinDependency(Post);
    jd.addNestedAssociation("comments");
    const rows = [{ t0_r0: 1, t0_r1: "Post A", t1_r0: 10, t1_r1: "C1", t1_r2: 1, t1_r3: null }];
    const { parents } = jd.instantiateFromRows(rows);
    const comment = parents[0].association("comments").target[0];
    expect((comment as any)._readonly).toBeFalsy();
  });
});
