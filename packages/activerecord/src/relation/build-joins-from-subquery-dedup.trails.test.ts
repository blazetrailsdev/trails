import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { quoteTableName } from "../support/quote-regex.js";
import { regexpEscape } from "@blazetrails/ruby-compat";

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

  it("emits cross-klass merged left_outer_joins on the live path like the from-subquery path", () => {
    const build = () => Post.leftOuterJoins(":comments").merge(Comment.leftOuterJoins(":post"));
    const liveSql = (build() as unknown as { toSql(): string }).toSql();
    const subSql = (Post.from(build(), "posts") as unknown as { toSql(): string }).toSql();
    expect((liveSql.match(/LEFT OUTER JOIN/g) ?? []).length).toBe(2);
    expect(subSql).toContain(fromClause(liveSql));
  });

  it("keeps a raw join leading when the only joins_values JoinDependency is cross-klass", () => {
    const rel = Post.joins("CROSS JOIN categories")
      .joins(":comments")
      .merge(Comment.joins(":post"));
    const sql = (Post.from(rel, "posts") as unknown as { toSql(): string }).toSql();
    const q = (name: string) => regexpEscape(quoteTableName(name));
    expect(sql).toMatch(
      new RegExp(`FROM ${q("posts")} CROSS JOIN categories INNER JOIN ${q("comments")}`),
    );
  });

  it("routes a leading raw join the same way on the live path and the from-subquery path", () => {
    const q = (name: string) => regexpEscape(quoteTableName(name));
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

  it("appends a raw join that trails a named join instead of leading with it", () => {
    const build = () => Post.joins(":comments").joins("CROSS JOIN categories");
    const q = (name: string) => regexpEscape(quoteTableName(name));
    for (const sql of [
      (Post.from(build(), "posts") as unknown as { toSql(): string }).toSql(),
      (build() as unknown as { toSql(): string }).toSql(),
    ]) {
      expect(sql).toMatch(new RegExp(`FROM ${q("posts")} INNER JOIN ${q("comments")}`));
      expect(sql).toMatch(new RegExp(`INNER JOIN ${q("comments")}[^)]*CROSS JOIN categories`));
    }
  });

  it("dedups an association named in both joins and eager_load", () => {
    const liveSql = (
      Post.joins(":author").eagerLoad(":author") as unknown as { toSql(): string }
    ).toSql();
    expect((liveSql.match(/INNER JOIN/g) ?? []).length).toBe(1);
    expect(liveSql).not.toContain("LEFT OUTER JOIN");
  });

  it("emits the eager and left_outer joins separately when there is no named join to walk against", () => {
    const liveSql = (
      Post.eagerLoad(":author").leftOuterJoins(":author") as unknown as { toSql(): string }
    ).toSql();
    const q = (name: string) => regexpEscape(quoteTableName(name));
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
