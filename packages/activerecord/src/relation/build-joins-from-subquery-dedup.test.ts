/**
 * Regression coverage for the unified `build_joins` emitter
 * (RFC 0022 unify-join-emission-build-joins).
 *
 * The live `toSql`/`toArel` path (`_applyJoinsToManager`) and the
 * `from(relation)` subquery path (`build_from` → `buildArel` → `buildJoins`)
 * now delegate to one shared emitter (`emitJoinPlan`), so the left_outer/joins
 * dedup fold (PR #3501 / #3890) lives in a single place and cannot re-drift.
 * This asserts the fold holds through a from-subquery: an association joined
 * both ways (`joins(:x).left_outer_joins(:x)`) collapses to a single INNER JOIN
 * via `walk`, with no LEFT OUTER JOIN. The subquery path previously had no
 * direct coverage for this regression class.
 *
 * Not a Rails-mirrored test name — this is a TS-internal refactor invariant
 * with no Ruby counterpart.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
// Opt into the canonical-model autoload index so the belongsTo("author") target
// (`Author`) resolves by name during JoinDependency construction — no manual
// `registerModel`.
import "../support/canonical-model-index.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { quoteTableName, escapeRegExp } from "../support/quote-regex.js";

describe("build_joins from(subquery) dedup", () => {
  fixtures([]);

  it("emits a single INNER JOIN (no LEFT OUTER JOIN) through the from-subquery", () => {
    const sub = Post.joins("author").leftOuterJoins("author");
    const sql = (Post.from(sub, "posts") as unknown as { toSql(): string }).toSql();
    expect((sql.match(/INNER JOIN/g) ?? []).length).toBe(1);
    expect(sql).not.toContain("LEFT OUTER JOIN");
  });

  // The pure-left-outer live path (`_applyJoinsToManager`) now mirrors Rails'
  // `if joins_values.empty?` short-circuit (query_methods.rb:1838-1842), routing
  // the association through `named_join`/OuterJoin instead of a stashed
  // JoinDependency — matching the `from(relation)` subquery path shape. Assert
  // the two paths emit identical SQL for `left_outer_joins` with no inner joins.
  it("pure left_outer_joins live path matches the from-subquery path SQL", () => {
    const joinFragment = (sql: string): string => {
      const m = sql.match(/LEFT OUTER JOIN [^)]*/);
      return (m?.[0] ?? "").trim();
    };
    const liveSql = (Post.leftOuterJoins("author") as unknown as { toSql(): string }).toSql();
    const subSql = (
      Post.from(Post.leftOuterJoins("author"), "posts") as unknown as { toSql(): string }
    ).toSql();
    expect((liveSql.match(/LEFT OUTER JOIN/g) ?? []).length).toBe(1);
    // The short-circuited live path emits the exact same LEFT OUTER JOIN clause
    // as the subquery `from(relation)` path — not just a coincidentally-similar one.
    expect(joinFragment(liveSql)).not.toBe("");
    expect(joinFragment(liveSql)).toBe(joinFragment(subSql));
  });

  // Exercise the conditions the `pureLeftOuter` guard adds beyond a naive
  // "left-outer only" check: a cross-klass `.merge` pushes an OuterJoin
  // JoinDependency into `leftOuterJoinsValues` (merger.rb merge_outer_joins),
  // where `selectNamedJoins` stashes it like any other. The short-circuit must
  // still emit BOTH the base left-outer join AND the merged one, identically to
  // the subquery path.
  it("emits cross-klass merged left_outer_joins on the live path like the from-subquery path", () => {
    const build = () => Post.leftOuterJoins("comments").merge(Comment.leftOuterJoins("post"));
    const liveSql = (build() as unknown as { toSql(): string }).toSql();
    const subSql = (Post.from(build(), "posts") as unknown as { toSql(): string }).toSql();
    // Base `comments` join + the merged cross-klass `post` JoinDependency.
    expect((liveSql.match(/LEFT OUTER JOIN/g) ?? []).length).toBe(2);
    // The whole FROM…joins structure of the live path is the subquery's inner query.
    expect(subSql).toContain(liveSql.slice(liveSql.indexOf('FROM "posts"')));
  });

  // Rails arms build_join_buckets' raw-join routing on `stashed_eager_load ||
  // stashed_left_joins` (query_methods.rb:1857), and `stashed_eager_load` is only
  // the trailing joins_values JoinDependency whose `base_klass == model`
  // (query_methods.rb:1843-1845). A cross-klass merged JoinDependency (base_klass
  // Comment, not Post) is not it, so with no left-outer values the guard stays
  // off and a raw join node goes to `leading_join` — emitted BEFORE the
  // association joins, not appended after them.
  it("keeps a raw join leading when the only joins_values JoinDependency is cross-klass", () => {
    const rel = Post.joins("CROSS JOIN categories").joins("comments").merge(Comment.joins("post"));
    const sql = (Post.from(rel, "posts") as unknown as { toSql(): string }).toSql();
    const q = (name: string) => escapeRegExp(quoteTableName(name));
    expect(sql).toMatch(
      new RegExp(`FROM ${q("posts")} CROSS JOIN categories INNER JOIN ${q("comments")}`),
    );
  });
});
