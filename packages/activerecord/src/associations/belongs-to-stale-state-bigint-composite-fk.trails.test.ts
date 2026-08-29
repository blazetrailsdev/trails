import { describe, it, expect } from "vitest";

import { Base } from "../base.js";
import { registerModel } from "../associations.js";

class BigIntCpkBlogPost extends Base {
  static _tableName = "bigint_cpk_blog_posts";
  static {
    this._primaryKey = ["blog_id", "id"];
    this.attribute("blog_id", "integer");
    this.attribute("id", "integer");
  }
}

class BigIntCpkComment extends Base {
  static _tableName = "bigint_cpk_comments";
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
  registerModel(BigIntCpkBlogPost);
  registerModel(BigIntCpkComment);

  it("serializes a BigInt FK component without throwing", () => {
    const comment = new BigIntCpkComment({ blog_id: 1, blog_post_id: 9007199254740993n });
    const holder = comment.association("blogPostWithInverse") as unknown as {
      staleState(): unknown;
    };

    let state: unknown;
    expect(() => {
      state = holder.staleState();
    }).not.toThrow();
    expect(state).toBeNull();
  });

  it("preserves a deterministic key across reads", () => {
    const comment = new BigIntCpkComment({ blog_id: 2, blog_post_id: 9007199254740993n });
    const holder = comment.association("blogPostWithInverse") as unknown as {
      staleState(): unknown;
    };

    expect(holder.staleState()).toBe(holder.staleState());
  });

  it("never marks a loaded composite-FK belongs_to stale on FK change", () => {
    const post = new BigIntCpkBlogPost({ blog_id: 1 });
    const comment = new BigIntCpkComment({ blog_id: 1, blog_post_id: 1n });
    const holder = comment.association("blogPostWithInverse") as unknown as {
      target: unknown;
      loadedBang(): void;
      isStaleTarget(): boolean;
      readonly reader: unknown;
    };
    holder.target = post;
    holder.loadedBang();
    expect(holder.isStaleTarget()).toBe(false);

    (comment as unknown as Record<string, unknown>).blog_post_id = 2n;
    expect(holder.isStaleTarget()).toBe(false);
    expect(holder.reader).toBe(post);
  });
});
