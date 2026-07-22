/**
 * Convergence guard: `BelongsToAssociation#staleState` for a composite (array)
 * foreign key matches Rails. Rails' `stale_state`
 * (belongs_to_association.rb:164-166) is
 * `owner._read_attribute(reflection.foreign_key)` with no array branching —
 * when `reflection.foreign_key` is an Array, Ruby's `@attributes[Array]`
 * matches no stored attribute and resolves to `Attribute.null` → nil.
 * Verified empirically against ActiveRecord 8.0.2: composite `stale_state` is
 * nil, `stale_target?` never fires, and an FK change does NOT reload a loaded
 * composite-FK belongs_to.
 *
 * trails previously invented a composite key shape
 * (`JSON.stringify` of the FK components, with BigInt folding — PR #4620);
 * this file replaces that regression test. The BigInt case is kept: a BigInt
 * FK component (int8 under PG bigserial) must not throw — trivially true now
 * that the composite path returns null without serializing anything.
 *
 * `staleState` reads the owner's in-memory FK attributes, so this exercises
 * the path with no database round-trip. The models mirror the canonical
 * `Sharded::Comment` → `blog_post_with_inverse` shape (composite FK
 * `[blog_id, blog_post_id]`); the columns are declared here so the in-memory
 * owner carries the BigInt component without a schema load, following the
 * sibling `belongs-to-inverse-seed-composite-pk.test.ts` pattern.
 */
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
    // Rails: composite stale_state resolves through the missing-attribute
    // path to nil — never a real composite value.
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
    // Rails (verified on AR 8.0.2): with @stale_state nil, `stale_target?`
    // stays false after the FK changes, so the loaded target is kept.
    const post = new BigIntCpkBlogPost({ blog_id: 1 });
    const comment = new BigIntCpkComment({ blog_id: 1, blog_post_id: 1n });
    const holder = comment.association("blogPostWithInverse") as unknown as {
      target: unknown;
      loadedBang(): void;
      isStaleTarget(): boolean;
    };
    holder.target = post;
    holder.loadedBang();
    expect(holder.isStaleTarget()).toBe(false);

    (comment as unknown as Record<string, unknown>).blog_post_id = 2n;
    expect(holder.isStaleTarget()).toBe(false);
  });
});
