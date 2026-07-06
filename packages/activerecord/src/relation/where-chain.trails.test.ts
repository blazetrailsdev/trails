/**
 * trails-only extras for WhereChain that assert SQL shape rather than result
 * membership. Rails' `where.associated` guards against re-joining an
 * association already present in `joins_values` / `left_outer_joins_values`
 * (query_methods.rb:91); the Rails-named coverage in where-chain.test.ts only
 * asserts membership, so these SQL-shape tests pin the no-duplicate-join guard.
 */
import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Author } from "../test-helpers/models/author.js";
import { Comment } from "../test-helpers/models/comment.js";

registerModel(Post);
registerModel(Author);
registerModel(Comment);

const authorsJoinCount = (sql: string): number =>
  (sql.match(/join\s+["`]?authors["`]?/gi) ?? []).length;
const joinCount = (sql: string): number => (sql.match(/\bjoin\b/gi) ?? []).length;

describe("WhereChain associated join guard (trails)", () => {
  fixtures(["posts", "authors", "authorAddresses", "comments"]);

  it("does not duplicate an inner join already in joins_values", () => {
    const sql = Post.joins("author").where().associated("author").toSql();
    expect(authorsJoinCount(sql)).toBe(1);
    expect(sql).toMatch(/INNER JOIN/i);
    // The IS NOT NULL predicate still lands on the (unaliased) target table.
    expect(sql).toMatch(/["`]?authors["`]?\.["`]?id["`]?\s+IS NOT NULL/i);
  });

  it("does not add an inner join when a left outer join is already present", () => {
    const sql = Post.leftOuterJoins("author").where().associated("author").toSql();
    expect(authorsJoinCount(sql)).toBe(1);
    expect(sql).toMatch(/LEFT OUTER JOIN/i);
    expect(sql).not.toMatch(/INNER JOIN/i);
    expect(sql).toMatch(/["`]?authors["`]?\.["`]?id["`]?\s+IS NOT NULL/i);
  });

  // Self-join (Comment#children): trails converges the pending join-value and
  // the where-join onto one aliased `children_comments` join via the alias
  // tracker (not via the skip path, which self-joins are exempt from), so there
  // is still exactly one join and the predicate lands on the alias.
  it("does not duplicate a self-join already in joins_values", () => {
    const inner = Comment.joins("children").where().associated("children").toSql();
    expect(joinCount(inner)).toBe(1);
    expect(inner).toMatch(/["`]?children_comments["`]?\.["`]?id["`]?\s+IS NOT NULL/i);

    const loj = Comment.leftOuterJoins("children").where().associated("children").toSql();
    expect(joinCount(loj)).toBe(1);
    expect(loj).toMatch(/["`]?children_comments["`]?\.["`]?id["`]?\s+IS NOT NULL/i);
  });
});
