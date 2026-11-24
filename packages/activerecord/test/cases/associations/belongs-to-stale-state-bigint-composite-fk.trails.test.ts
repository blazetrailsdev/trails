import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";

import { Base } from "../../../lib/base.js";

class BigIntCpkBlogPost extends Base {
  static tableName = "bigint_cpk_blog_posts";
  static {
    this.primaryKey = ["blog_id", "id"];
    this.attribute("blog_id", "integer");
    this.attribute("id", "integer");
  }
}

class BigIntCpkComment extends Base {
  static tableName = "bigint_cpk_comments";
  static {
    this.attribute("blog_id", "integer");
    this.attribute("blog_post_id", "integer");
    this.belongsTo("blogPostWithInverse", {
      className: "BigIntCpkBlogPost",
      foreignKey: ["blog_id", "blog_post_id"],
      primaryKey: ["blog_id", "id"],
    });
  }
}

describe("belongs_to composite-FK staleState with a BigInt component", () => {
  constSet(TopLevel, "BigIntCpkBlogPost", BigIntCpkBlogPost);
  DescendantsTracker.registerSubclass(Base, BigIntCpkBlogPost);
  constSet(TopLevel, "BigIntCpkComment", BigIntCpkComment);
  DescendantsTracker.registerSubclass(Base, BigIntCpkComment);

  it("serializes a BigInt FK component without throwing", () => {
    const comment = new BigIntCpkComment({ blog_id: 1, blog_post_id: 9007199254740993n });
    const holder = comment.association("blogPostWithInverse") as unknown as {
      staleState(): unknown;
    };

    let state: unknown;
    expect(() => {
      state = holder.staleState();
    }).not.toThrow();
    expect(state).toEqual([1, 9007199254740993n]);
  });

  it("preserves a deterministic key across reads", () => {
    const comment = new BigIntCpkComment({ blog_id: 2, blog_post_id: 9007199254740993n });
    const holder = comment.association("blogPostWithInverse") as unknown as {
      staleState(): unknown;
    };

    expect(holder.staleState()).toEqual(holder.staleState());
  });
});
