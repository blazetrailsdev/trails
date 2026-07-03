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
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { setupFixtures } from "../test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Author } from "../test-helpers/models/author.js";

describe("build_joins from(subquery) dedup", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    // Register the belongsTo("author") target so `joins("author")` resolves
    // during JoinDependency construction.
    registerModel("Post", Post);
    registerModel("Author", Author);
  });

  it("emits a single INNER JOIN (no LEFT OUTER JOIN) through the from-subquery", () => {
    const sub = Post.joins("author").leftOuterJoins("author");
    const sql = (Post.from(sub, "posts") as unknown as { toSql(): string }).toSql();
    expect((sql.match(/INNER JOIN/g) ?? []).length).toBe(1);
    expect(sql).not.toContain("LEFT OUTER JOIN");
  });
});
