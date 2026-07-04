import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { JoinDependency } from "./join-dependency.js";

describe("JoinDependency extra columns in instantiate", () => {
  // Ride the canonical schema `fixtures({})` warms; the hydration rows below are
  // built by column name via `jd.aliasedRow`, so no bespoke schema is declared
  // and no `tN_rN` offsets are hardcoded.
  fixtures({});

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
        ...jd.aliasedRow({
          "": { id: 1, title: "First Post" },
          comments: { id: 10, post_id: 1, body: "Nice" },
        }),
        comment_count: 5,
      },
      {
        ...jd.aliasedRow({
          "": { id: 1, title: "First Post" },
          comments: { id: 11, post_id: 1, body: "Great" },
        }),
        comment_count: 5,
      },
      {
        ...jd.aliasedRow({
          "": { id: 2, title: "Second Post" },
          comments: { id: 12, post_id: 2, body: "Cool" },
        }),
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
        ...jd.aliasedRow({
          "": { id: 1, title: "Post" },
          comments: { id: 10, post_id: 1, body: "Hello" },
        }),
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

    const rows = [
      jd.aliasedRow({ "": { id: 1, title: "Post" }, comments: { id: 10, post_id: 1, body: "Hi" } }),
    ];

    const { parents } = jd.instantiateFromRows(rows);

    expect(parents).toHaveLength(1);
    expect(parents[0]._readAttribute("title")).toBe("Post");
  });
});
