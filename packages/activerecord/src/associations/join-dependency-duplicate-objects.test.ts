import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";

// Row-level proof of the unified parent-key accessor (`_nodeKey`): a join that
// multiplies rows — one parent repeated across children, or one child repeated
// across parents — must collapse to exactly one instance per logical record.
// The end-to-end equivalents are eager.test.ts "including duplicate objects from
// {has many,belongs to}" (Rails eager_test.rb #test_including_duplicate_objects_*);
// these exercise the dedup at the instantiateFromRows boundary this story changes,
// so the raw-aliased key (seeded and looked up through the single `_nodeKey` path)
// is the only thing under test.
describe("JoinDependency dedupes duplicate join rows", () => {
  let adapter: any;

  class Comment extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("post_id", "integer");
      this.attribute("body", "string");
    }
  }

  class Post extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("title", "string");
    }
  }

  class Reader extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("post_id", "integer");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    for (const m of [Comment, Post, Reader]) {
      (m as any).adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }
    Associations.hasMany.call(Post, "comments", { className: "Comment" });
    Associations.belongsTo.call(Reader, "post", { className: "Post" });
  });

  it("collapses repeated child join rows to one instance for a single parent", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("comments");

    // Same parent, same child, repeated join rows — must dedupe to one comment.
    const rows = [
      { t0_r0: 1, t0_r1: "foo", t1_r0: 10, t1_r1: 1, t1_r2: "hmm" },
      { t0_r0: 1, t0_r1: "foo", t1_r0: 10, t1_r1: 1, t1_r2: "hmm" },
    ];

    const { parents } = jd.instantiateFromRows(rows);

    expect(parents).toHaveLength(1);
    const comments = parents[0].association("comments")?.target;
    expect(comments).toHaveLength(1);
    expect(comments[0]._readAttribute("id")).toBe(10);
  });

  it("shares one child instance across distinct parents joined to the same record", () => {
    const jd = new JoinDependency(Reader);
    jd.addNestedAssociation("post.comments");

    // Two distinct parents share one post which has one comment; the post and the
    // comment must each be a single shared instance, exactly deduped.
    const rows = [
      { t0_r0: 1, t0_r1: 5, t1_r0: 5, t1_r1: "foo", t2_r0: 10, t2_r1: 5, t2_r2: "lol" },
      { t0_r0: 2, t0_r1: 5, t1_r0: 5, t1_r1: "foo", t2_r0: 10, t2_r1: 5, t2_r2: "lol" },
    ];

    const { parents } = jd.instantiateFromRows(rows);

    expect(parents).toHaveLength(2);
    const post0 = parents[0].association("post")?.target;
    const post1 = parents[1].association("post")?.target;
    expect(post0).toBe(post1);

    const comments0 = post0.association("comments")?.target;
    const comments1 = post1.association("comments")?.target;
    expect(comments0).toHaveLength(1);
    expect(comments1).toHaveLength(1);
    expect(comments0[0]).toBe(comments1[0]);
    expect(comments0[0]._readAttribute("id")).toBe(10);
  });
});
