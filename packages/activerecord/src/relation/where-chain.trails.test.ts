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

registerModel(Post);
registerModel(Author);

const authorsJoinCount = (sql: string): number =>
  (sql.match(/join\s+["`]?authors["`]?/gi) ?? []).length;

describe("WhereChain associated join guard (trails)", () => {
  fixtures(["posts", "authors", "authorAddresses"]);

  it("does not duplicate an inner join already in joins_values", () => {
    const sql = Post.joins("author").where().associated("author").toSql();
    expect(authorsJoinCount(sql)).toBe(1);
    expect(sql).toMatch(/INNER JOIN/i);
  });

  it("does not add an inner join when a left outer join is already present", () => {
    const sql = Post.leftOuterJoins("author").where().associated("author").toSql();
    expect(authorsJoinCount(sql)).toBe(1);
    expect(sql).toMatch(/LEFT OUTER JOIN/i);
    expect(sql).not.toMatch(/INNER JOIN/i);
  });
});
