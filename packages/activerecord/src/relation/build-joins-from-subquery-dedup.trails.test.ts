/**
 * Regression coverage for the unified `build_joins` emitter
 * (RFC 0022 unify-join-emission-build-joins).
 *
 * The live `toSql`/`arel` path (`buildArel` -> `buildJoins`) and the
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
import "../support/canonical-model-index.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { quoteTableName, escapeRegExp } from "../support/quote-regex.js";

describe("build_joins from(subquery) dedup", () => {
  fixtures([]);

  const fromClause = (sql: string): string => {
    const marker = `FROM ${quoteTableName("posts")}`;
    const at = sql.indexOf(marker);
    expect(at).toBeGreaterThanOrEqual(0);
    return sql.slice(at);
  };

  it("emits a single INNER JOIN (no LEFT OUTER JOIN) through the from-subquery", () => {
    const sub = Post.joins(":author").leftOuterJoins(":author");
    const sql = (Post.from(sub, "posts") as unknown as { toSql(): string }).toSql();
    expect((sql.match(/INNER JOIN/g) ?? []).length).toBe(1);
    expect(sql).not.toContain("LEFT OUTER JOIN");
  });

  // The pure-left-outer live path (`buildJoins`) now mirrors Rails'
  // `if joins_values.empty?` short-circuit (query_methods.rb:1838-1842), routing
  // the association through `named_join`/OuterJoin instead of a stashed
  // JoinDependency — matching the `from(relation)` subquery path shape. Assert
  // the two paths emit identical SQL for `left_outer_joins` with no inner joins.
  it("pure left_outer_joins live path matches the from-subquery path SQL", () => {
    const joinFragment = (sql: string): string => {
      const m = sql.match(/LEFT OUTER JOIN [^)]*/);
      return (m?.[0] ?? "").trim();
    };
    const liveSql = (Post.leftOuterJoins(":author") as unknown as { toSql(): string }).toSql();
    const subSql = (
      Post.from(Post.leftOuterJoins(":author"), "posts") as unknown as { toSql(): string }
    ).toSql();
    expect((liveSql.match(/LEFT OUTER JOIN/g) ?? []).length).toBe(1);
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
    const build = () => Post.leftOuterJoins(":comments").merge(Comment.leftOuterJoins(":post"));
    const liveSql = (build() as unknown as { toSql(): string }).toSql();
    const subSql = (Post.from(build(), "posts") as unknown as { toSql(): string }).toSql();
    expect((liveSql.match(/LEFT OUTER JOIN/g) ?? []).length).toBe(2);
    expect(subSql).toContain(fromClause(liveSql));
  });

  // Rails arms build_join_buckets' raw-join routing on `stashed_eager_load ||
  // stashed_left_joins` (query_methods.rb:1857), and `stashed_eager_load` is only
  // the trailing joins_values JoinDependency whose `base_klass == model`
  // (query_methods.rb:1843-1845). A cross-klass merged JoinDependency (base_klass
  // Comment, not Post) is not it, so with no left-outer values the guard stays
  // off and a raw join node goes to `leading_join` — emitted BEFORE the
  // association joins, not appended after them.
  it("keeps a raw join leading when the only joins_values JoinDependency is cross-klass", () => {
    const rel = Post.joins("CROSS JOIN categories")
      .joins(":comments")
      .merge(Comment.joins(":post"));
    const sql = (Post.from(rel, "posts") as unknown as { toSql(): string }).toSql();
    const q = (name: string) => escapeRegExp(quoteTableName(name));
    expect(sql).toMatch(
      new RegExp(`FROM ${q("posts")} CROSS JOIN categories INNER JOIN ${q("comments")}`),
    );
  });

  // Rails arms the leading-raw-join routing on `stashed_eager_load ||
  // stashed_left_joins` alone (query_methods.rb:1857) — a named inner join is
  // still in `joins` at that point and does not arm it. Both halves of the
  // `build_joins` split must therefore lead with the raw join here.
  it("routes a leading raw join the same way on the live path and the from-subquery path", () => {
    const q = (name: string) => escapeRegExp(quoteTableName(name));
    const leading = new RegExp(
      `FROM ${q("posts")} CROSS JOIN categories INNER JOIN ${q("comments")}`,
    );
    for (const build of [
      () => Post.joins("CROSS JOIN categories").joins(":comments"),
      () => Post.joins("CROSS JOIN categories").joins(":comments").merge(Comment.joins(":post")),
    ]) {
      const liveSql = (build() as unknown as { toSql(): string }).toSql();
      const subSql = (Post.from(build(), "posts") as unknown as { toSql(): string }).toSql();
      expect(liveSql).toMatch(leading);
      expect(subSql).toContain(fromClause(liveSql));
    }
  });

  // Rails only shifts the LEADING run of Arel Join nodes out of `joins`
  // (query_methods.rb:1855-1862); a Join node sitting BEHIND a named join falls
  // through to the `select_named_joins` block, which buckets it as a join_node
  // unconditionally (query_methods.rb:1866-1867) — so it is appended after the
  // association joins even when the leading-loop guard is off.
  it("appends a raw join that trails a named join instead of leading with it", () => {
    const build = () => Post.joins(":comments").joins("CROSS JOIN categories");
    const q = (name: string) => escapeRegExp(quoteTableName(name));
    for (const sql of [
      (Post.from(build(), "posts") as unknown as { toSql(): string }).toSql(),
      (build() as unknown as { toSql(): string }).toSql(),
    ]) {
      expect(sql).toMatch(new RegExp(`FROM ${q("posts")} INNER JOIN ${q("comments")}`));
      expect(sql).toMatch(new RegExp(`INNER JOIN ${q("comments")}[^)]*CROSS JOIN categories`));
    }
  });

  // The live path folds the eager JoinDependency into `joins_values`
  // (`apply_join_dependency`, finder_methods.rb:457-461) exactly as the subquery
  // path does, so an association named in BOTH `joins` and `eager_load` dedups
  // through the single `join_constraints` `walk` fold (join_dependency.rb:
  // `walk(join_root, oj.join_root, …)` when `join_root.match?`) — there is no
  // live-path exclusion filter deciding which value to drop before emission.
  it("dedups an association named in both joins and eager_load", () => {
    const liveSql = (
      Post.joins(":author").eagerLoad(":author") as unknown as { toSql(): string }
    ).toSql();
    expect((liveSql.match(/INNER JOIN/g) ?? []).length).toBe(1);
    expect(liveSql).not.toContain("LEFT OUTER JOIN");
  });

  // Rails walks each stashed JoinDependency against the SAME `join_root`
  // (join_dependency.rb#join_constraints), so a second stash for an association
  // the first stash already joined is `missing` again and emits a second,
  // alias_tracker-aliased join — it is NOT deduped. With no named joins, both the
  // left-outer JD and the eager stash walk an empty join_root, so
  // `eager_load(:x).left_outer_joins(:x)` legitimately emits two joins.
  it("emits the eager and left_outer joins separately when there is no named join to walk against", () => {
    const liveSql = (
      Post.eagerLoad(":author").leftOuterJoins(":author") as unknown as { toSql(): string }
    ).toSql();
    const q = (name: string) => escapeRegExp(quoteTableName(name));
    expect((liveSql.match(/LEFT OUTER JOIN/g) ?? []).length).toBe(2);
    expect(liveSql).toMatch(new RegExp(`LEFT OUTER JOIN ${q("authors")} ${q("authors_posts")}`));
  });

  it("emits the same joins for eager_load + left_outer_joins + a raw join on both paths", () => {
    const build = () =>
      Post.joins("CROSS JOIN categories").eagerLoad(":author").leftOuterJoins(":comments");
    const liveSql = (build() as unknown as { toSql(): string }).toSql();
    const subSql = (Post.from(build(), "posts") as unknown as { toSql(): string }).toSql();
    const liveFrom = fromClause(liveSql);
    expect(liveFrom).toContain("CROSS JOIN categories");
    expect(subSql).toContain(liveFrom);
  });
});
