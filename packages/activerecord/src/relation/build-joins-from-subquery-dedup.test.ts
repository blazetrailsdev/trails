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
import { fixtures } from "../test-helpers/fixtures.js";
// Opt into the canonical-model autoload index so the belongsTo("author") target
// (`Author`) resolves by name during JoinDependency construction — no manual
// `registerModel`.
import "../test-helpers/canonical-model-index.js";
import { Post } from "../test-helpers/models/post.js";

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
    const rel = Post.leftOuterJoins("author");
    const liveSql = (rel as unknown as { toSql(): string }).toSql();
    const subSql = (
      Post.from(Post.leftOuterJoins("author"), "posts") as unknown as { toSql(): string }
    ).toSql();
    expect(liveSql).toContain("LEFT OUTER JOIN");
    expect((liveSql.match(/LEFT OUTER JOIN/g) ?? []).length).toBe(1);
    expect(subSql).toContain(liveSql.slice(liveSql.indexOf("LEFT OUTER JOIN")));
  });
});
