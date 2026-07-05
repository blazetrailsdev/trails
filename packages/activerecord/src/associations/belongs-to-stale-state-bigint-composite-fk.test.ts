/**
 * Regression guard: `BelongsToAssociation#staleState` composite-FK path folds
 * BigInt FK components before `JSON.stringify`. node-postgres deserializes int8
 * columns (default under PG bigserial) to JS `BigInt`, which `JSON.stringify`
 * rejects ("Do not know how to serialize a BigInt"). The composite-FK branch
 * used a raw `JSON.stringify(values)`, so a `belongs_to` with a composite FK
 * carrying a BigInt component threw on the stale-state check. The single-FK
 * branch returns the raw value, so only the composite path was affected.
 * Mirrors the `CollectionAssociation#recordIdentity` fix (fold `bigint` →
 * `.toString()`).
 *
 * `staleState` reads the owner's in-memory FK attributes, so this exercises the
 * path with no database round-trip. The models mirror the canonical
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
    expect(state).toBe(JSON.stringify([1, "9007199254740993"]));
  });

  it("preserves a deterministic key across reads", () => {
    const comment = new BigIntCpkComment({ blog_id: 2, blog_post_id: 9007199254740993n });
    const holder = comment.association("blogPostWithInverse") as unknown as {
      staleState(): unknown;
    };

    expect(holder.staleState()).toBe(holder.staleState());
  });
});
