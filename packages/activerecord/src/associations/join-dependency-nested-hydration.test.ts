import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { JoinDependency } from "./join-dependency.js";

describe("JoinDependency nested hydration", () => {
  // Ride the boot-laid canonical `Base.connection` (single-pool test model)
  // rather than a sidecar `_pool` lease; these wiring tests only need an
  // adapter for JoinDependency's quoting, not a bespoke schema.
  fixtures({});

  // Canonical column order (schema.rb) drives the `tN_rN` hydration offsets so
  // the hand-built rows survive the schema cache `fixtures({})` warms: `authors`
  // is (id, name); `comments` is (id, post_id, body, …, author_id) with author_id
  // at slot 8; `posts` is (id, author_id, title).
  // prettier-ignore
  class Author extends Base {
    static { this.attribute("id", "integer"); this.attribute("name", "string"); }
  }
  // prettier-ignore
  class Comment extends Base {
    static {
      this.attribute("id", "integer"); this.attribute("post_id", "integer"); this.attribute("body", "string");
      this.attribute("type", "string"); this.attribute("label", "integer"); this.attribute("tags_count", "integer");
      this.attribute("children_count", "integer"); this.attribute("parent_id", "integer"); this.attribute("author_id", "integer");
    }
  }
  // prettier-ignore
  class Post extends Base {
    static { this.attribute("id", "integer"); this.attribute("author_id", "integer"); this.attribute("title", "string"); }
  }

  beforeEach(() => {
    for (const m of [Author, Comment, Post]) {
      m._associations = [];
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
      { t0_r0: 1, t0_r2: "Post A", t1_r0: 10, t1_r1: 1, t1_r2: "Comment 1", t1_r8: 42, t2_r0: 42, t2_r1: "Alice" },
      { t0_r0: 1, t0_r2: "Post A", t1_r0: 11, t1_r1: 1, t1_r2: "Comment 2", t1_r8: 42, t2_r0: 42, t2_r1: "Alice" },
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

    expect(comment1.association("author").target).toBeDefined();
    // "author" is a Comment association, not a Post one — verify it was not
    // grafted onto the wrong (Post) parent's association cache.
    expect(post._associationInstances.has("author")).toBe(false);
  });

  it("eager association loading with cascaded two levels and one level", () => {
    const jd = new JoinDependency(Post);
    jd.addNestedAssociation("comments.author");

    // prettier-ignore
    const rows = [
      { t0_r0: 1, t0_r2: "Post A", t1_r0: 10, t1_r1: 1, t1_r2: "C1", t1_r8: 42, t2_r0: 42, t2_r1: "Alice" },
      { t0_r0: 2, t0_r2: "Post B", t1_r0: 20, t1_r1: 2, t1_r2: "C2", t1_r8: 42, t2_r0: 42, t2_r1: "Alice" },
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
    const rows = [{ t0_r0: 1, t0_r2: "Post A", t1_r0: 10, t1_r1: 1, t1_r2: "C1", t1_r8: null }];
    const { parents } = jd.instantiateFromRows(rows);
    const comment = parents[0].association("comments").target[0];
    expect(comment._readonly).toBeFalsy();
  });
});
