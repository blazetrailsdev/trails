/**
 * Regression coverage for threading the single shared `build_joins`
 * AliasTracker through the eager-SELECT preview paths
 * (RFC 0027 thread-shared-tracker-through-eager-select-paths).
 *
 * Rails `build_joins` shares ONE `alias_tracker` across the eager-load
 * JoinDependency and the explicit `joins` it folds in (query_methods.rb
 * `build_joins`; join_dependency.rb), so an eager `includes(:x).references(:x)`
 * that lands on a table an explicit `.joins` already claimed collides and is
 * re-aliased to its `alias_candidate` at emit-time (`make_constraints`). Before
 * this change `_buildEagerJoinManager` / `_buildEagerIdSubquery` passed a FRESH
 * per-emit tracker (seeded only with the base table) to `jd.joinConstraints`,
 * so the eager JD and the manual join's tracker never saw each other and the
 * eager OUTER JOIN emitted unaliased — silently duplicating the table name.
 *
 * Not a Rails-mirrored test name — this is a TS-internal threading invariant
 * with no single Ruby counterpart.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Post } from "../test-helpers/models/post.js";
import { Author } from "../test-helpers/models/author.js";

describe("eager build_joins shared AliasTracker", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    registerModel("Post", Post);
    registerModel("Author", Author);
    await defineSchema({ posts: canonicalSchema.posts, authors: canonicalSchema.authors });
  });

  it("aliases the eager OUTER JOIN when an explicit joins already claims the table", () => {
    const rel = Post.includes("author")
      .references("author")
      .joins("INNER JOIN authors ON authors.id = posts.author_id");
    const sql = (rel as unknown as { toSql(): string }).toSql();

    // The manual join keeps the real `authors` name; the eager OUTER JOIN
    // collides against the shared tracker's seed and re-aliases to its
    // `alias_candidate` (`authors_posts`).
    expect(sql).toContain('LEFT OUTER JOIN "authors" "authors_posts"');
    // Its column-alias projection reads the now-aliased table, not bare `authors`.
    expect(sql).toContain('"authors_posts"."id" AS t1_r0');
    expect(sql).toContain("INNER JOIN authors ON authors.id = posts.author_id");
  });
});
