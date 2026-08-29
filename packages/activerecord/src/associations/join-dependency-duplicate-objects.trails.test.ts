import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { aliasedRow } from "../support/join-dependency-aliased-row.js";
import { fixtures } from "../test-fixtures.js";
import { JoinDependency } from "./join-dependency.js";
import { Nodes } from "@blazetrails/arel";

describe("JoinDependency dedupes duplicate join rows", () => {
  fixtures({});

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
      this.attribute("author_id", "integer");
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
    for (const m of [Comment, Post, Reader]) {
      m._reflections = {};
      registerModel(m);
    }
    Associations.hasMany.call(Post, "comments", { className: "Comment" });
    Associations.belongsTo.call(Reader, "post", { className: "Post" });
  });

  it("collapses repeated child join rows to one instance for a single parent", () => {
    const jd = new JoinDependency(Post, null, "comments", Nodes.OuterJoin);

    const row = aliasedRow(jd, {
      "": { id: 1, title: "foo" },
      comments: { id: 10, post_id: 1, body: "hmm" },
    });
    const rows = [row, { ...row }];

    const { parents } = jd.instantiateFromRows(rows);

    expect(parents).toHaveLength(1);
    const comments = parents[0].association("comments")?.target;
    expect(comments).toHaveLength(1);
    expect(comments[0]._readAttribute("id")).toBe(10);
  });

  it("shares one child instance across distinct parents joined to the same record", () => {
    const jd = new JoinDependency(Reader, null, "post.comments", Nodes.OuterJoin);

    const rows = [
      aliasedRow(jd, {
        "": { id: 1, post_id: 5 },
        post: { id: 5, title: "foo" },
        "post.comments": { id: 10, post_id: 5, body: "lol" },
      }),
      aliasedRow(jd, {
        "": { id: 2, post_id: 5 },
        post: { id: 5, title: "foo" },
        "post.comments": { id: 10, post_id: 5, body: "lol" },
      }),
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
