import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { JoinDependency } from "./join-dependency.js";

describe("JoinDependency extra columns in instantiate", () => {
  // Ride the boot-laid canonical `Base.connection` (single-pool test model)
  // rather than a sidecar `_pool` lease; these wiring tests only need an
  // adapter for JoinDependency's quoting, not a bespoke schema.
  fixtures({});

  // Canonical `posts` column order (schema.rb): id, author_id, title — so `title`
  // hydrates from `t0_r2`, matching the schema `fixtures({})` warms.
  class Post extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("author_id", "integer");
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
    for (const m of [Post, Comment]) {
      m._associations = [];
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
        t0_r2: "First Post",
        t1_r0: 10,
        t1_r1: 1,
        t1_r2: "Nice",
        comment_count: 5,
      },
      {
        t0_r0: 1,
        t0_r2: "First Post",
        t1_r0: 11,
        t1_r1: 1,
        t1_r2: "Great",
        comment_count: 5,
      },
      {
        t0_r0: 2,
        t0_r2: "Second Post",
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
        t0_r2: "Post",
        t1_r0: 10,
        t1_r1: 1,
        t1_r2: "Hello",
        extra_col: "extra_value",
      },
    ];

    const { parents, associations } = jd.instantiateFromRows(rows);
    // The associations map is keyed by the RAW aliased PK value (the same key the
    // parents dedup map uses), not the model-cast `_readAttribute` value — look it
    // up by the raw row value (`t0_r0`) accordingly.
    const children = associations.get(1)?.get("comments") ?? [];

    expect(children).toHaveLength(1);
    expect(children[0]._readAttribute("extra_col")).toBeNull();
  });

  it("works with no extra columns (no regression)", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("comments");

    const rows = [{ t0_r0: 1, t0_r2: "Post", t1_r0: 10, t1_r1: 1, t1_r2: "Hi" }];

    const { parents } = jd.instantiateFromRows(rows);

    expect(parents).toHaveLength(1);
    expect(parents[0]._readAttribute("title")).toBe("Post");
  });
});
