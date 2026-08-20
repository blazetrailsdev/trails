/**
 * trails-only pin for the eager JOIN under a CTE (`with_values`) or a FROM
 * override (`from_clause`).
 *
 * `Relation#_eagerLoadBypassesJoinDependency` used to degrade an eager load to
 * a preload whenever either was present — a capability gap with no Rails
 * counterpart: `exec_main_query` (relation.rb:1434-1446) always routes an
 * `eager_loading?` relation through `apply_join_dependency`, and the relation it
 * spawns (`except(:includes, :eager_load, :preload).joins!(join_dependency)`,
 * finder_methods.rb:461) keeps both values, so `build_arel`'s `build_with` and
 * `build_from` (query_methods.rb:1761, 1767) emit them alongside the aliased
 * LEFT OUTER JOIN.
 *
 * The records are identical either way — which is why this pins the SQL: only
 * the JOIN proves the eager load was not silently downgraded.
 */
import { it, expect } from "vitest";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { describeIfSupports } from "../support/supports.js";

describeIfSupports("common_table_expressions", "eager load under a CTE / FROM override", () => {
  fixtures(["posts", "comments"]);

  it("emits the aliased eager JOIN alongside the CTE", async () => {
    const relation = Post.with({
      posts_with_comments: Post.where("legacy_comments_count > 0"),
    }).eagerLoad("comments");

    const sql = relation.toSql();
    expect(sql).toMatch(/WITH\s+/i);
    expect(sql).toMatch(/LEFT OUTER JOIN/i);

    const posts = await relation.order("posts.id");
    expect(posts.length).toBeGreaterThan(0);
  });

  it("emits the aliased eager JOIN alongside a FROM override", async () => {
    const relation = Post.from("posts AS posts").eagerLoad("comments");

    expect(relation.toSql()).toMatch(/LEFT OUTER JOIN/i);

    const posts = await relation.order("posts.id");
    expect(posts.length).toBeGreaterThan(0);
  });
});
