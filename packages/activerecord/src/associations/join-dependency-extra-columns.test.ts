import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";

describe("JoinDependency extra columns in instantiate", () => {
  let adapter: any;

  class Post extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("title", "string");
    }
  }

  class Comment extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("post_id", "integer");
      this.attribute("body", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    for (const m of [Post, Comment]) {
      (m as any).adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }
    Associations.hasMany.call(Post, "comments", { className: "Comment" });
  });

  it("merges non-aliased columns into the parent record", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("comments");

    const rows = [
      {
        t0_r0: 1,
        t0_r1: "First Post",
        t1_r0: 10,
        t1_r1: 1,
        t1_r2: "Nice",
        comment_count: 5,
      },
      {
        t0_r0: 1,
        t0_r1: "First Post",
        t1_r0: 11,
        t1_r1: 1,
        t1_r2: "Great",
        comment_count: 5,
      },
      {
        t0_r0: 2,
        t0_r1: "Second Post",
        t1_r0: 12,
        t1_r1: 2,
        t1_r2: "Cool",
        comment_count: 1,
      },
    ];

    const { parents } = jd.instantiateFromRows(rows);

    expect(parents).toHaveLength(2);
    expect(parents[0]._readAttribute("comment_count")).toBe(5);
    expect(parents[1]._readAttribute("comment_count")).toBe(1);
  });

  it("does not assign extra columns to child records", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("comments");

    const rows = [
      {
        t0_r0: 1,
        t0_r1: "Post",
        t1_r0: 10,
        t1_r1: 1,
        t1_r2: "Hello",
        extra_col: "extra_value",
      },
    ];

    const { parents, associations } = jd.instantiateFromRows(rows);
    const children = associations.get(parents[0]._readAttribute("id"))?.get("comments") ?? [];

    expect(children).toHaveLength(1);
    expect(children[0]._readAttribute("extra_col")).toBeNull();
  });

  it("works with no extra columns (no regression)", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("comments");

    const rows = [{ t0_r0: 1, t0_r1: "Post", t1_r0: 10, t1_r1: 1, t1_r2: "Hi" }];

    const { parents } = jd.instantiateFromRows(rows);

    expect(parents).toHaveLength(1);
    expect(parents[0]._readAttribute("title")).toBe("Post");
  });
});
