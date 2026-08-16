/**
 * trails-only coverage for the `with_values` store, which holds Rails' raw
 * `{ name => query }` hashes (query_methods.rb:500-528). No Rails counterpart:
 * these pin JS-side hazards in the `|=` union and the array reduction that
 * Ruby's own semantics make unreachable.
 */
import { it, expect } from "vitest";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { describeIfSupports } from "../support/supports.js";

describeIfSupports("common_table_expressions", "WithTest (trails)", () => {
  fixtures(["posts"]);

  it("with keeps both entries when the same name is given two different relations", () => {
    // Ruby's `with_values |= args` dedups by `Hash#eql?`, which compares values
    // with `eql?`. `Relation` defines only `==` (relation.rb:1253) and inherits
    // `Object#eql?`, so two distinct relations are never eql? and both survive.
    const relation = Post.with({ a: Post.where("tags_count > 0") }).with({
      a: Post.where("legacy_comments_count > 0"),
    });

    expect((relation.values()["with"] as unknown[]).length).toBe(2);
  });

  it("with dedups a repeated entry the way Array#| does", () => {
    const cte = Post.where("tags_count > 0");
    const relation = Post.with({ a: cte }).with({ a: cte });

    expect((relation.values()["with"] as unknown[]).length).toBe(1);
  });

  it("with when an empty array is passed reduces to a nil relation", async () => {
    // Ruby's `reduce` with no initial value answers nil on an empty collection,
    // so Rails builds a `TableAlias` over nil and fails in the visitor rather
    // than raising `TypeError: Reduce of empty array` at the reduction.
    await expect(Post.with({ empty_cte: [] }).load()).rejects.toThrow();
  });
});
