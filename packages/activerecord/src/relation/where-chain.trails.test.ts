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
import { Customer } from "../test-helpers/models/customer.js";
import { Company } from "../test-helpers/models/company.js";
import { Range } from "../connection-adapters/postgresql/oid/range.js";

registerModel(Post);
registerModel(Author);
registerModel(Comment);

const ids = (records: unknown[]): unknown[] => records.map((r) => (r as { id: unknown }).id).sort();

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

  // Self-join (Comment#children): routing the join through JoinDependency
  // (`joins!`) unions the pending join-value with the where-join, so there is
  // still exactly one join. The `:class_name` self-join predicate is keyed by
  // the association name (`self.not(children => …)`), so it resolves to the
  // same aliased join table (`children`) rather than the owner PK.
  it("does not duplicate a self-join already in joins_values", () => {
    const inner = Comment.joins("children").where().associated("children").toSql();
    expect(joinCount(inner)).toBe(1);
    expect(inner).toMatch(/["`]?children["`]?\.["`]?id["`]?\s+IS NOT NULL/i);

    const loj = Comment.leftOuterJoins("children").where().associated("children").toSql();
    expect(joinCount(loj)).toBe(1);
    expect(loj).toMatch(/["`]?children["`]?\.["`]?id["`]?\s+IS NOT NULL/i);
  });
});

// `where.not` is a single WhereClause#invert over the positively-built clause
// (query_methods.rb:49, where_clause.rb:85-92) — never per-branch negation
// threaded through the predicate builder. These pin the inversion shapes the
// old threading got structurally different (Rails-shape SQL + row semantics).
describe("WhereChain not inversion shapes (trails)", () => {
  fixtures(["posts", "authors", "authorAddresses", "customers"]);

  it("inverts an array containing null as NOT (IN ... OR IS NULL)", async () => {
    const relation = Post.whereNot({
      title: [null, "Welcome to the weblog", "So I was thinking"],
    });
    // Positive ArrayHandler shape `(title IN (...) OR title IS NULL)`, inverted
    // once at the clause level — not the threaded `NOT IN ... AND IS NOT NULL`.
    expect(relation.toSql()).toMatch(/NOT \(.*IN \(.*\).*OR.*IS NULL\)/is);
    const posts = await relation;
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      expect(post.title).not.toBeNull();
      expect(post.title).not.toBe("Welcome to the weblog");
    }
  });

  it("inverts a multi-column aggregate group as one NOT over the AND group", async () => {
    const david = await Customer.find(1);
    const relation = Customer.whereNot({ address: david.address });
    // expand_from_hash builds the three mapped-column equalities positively;
    // WhereClause#invert wraps them in a single NOT(...) group.
    expect(relation.toSql()).toMatch(
      /NOT \(.*address_street.*AND.*address_city.*AND.*address_country.*\)/is,
    );
    // The flat positive predicates invert via NOT(ast) — no per-branch
    // Grouping double-wrap (`NOT ((...))`) like the old negation threading.
    expect(relation.toSql()).not.toMatch(/NOT \(\(/);
    const customers = await relation;
    expect(customers.length).toBeGreaterThan(0);
    expect(ids(customers)).not.toContain(1);
  });

  it("inverts an exclusive range as NOT over the positive bound pair", () => {
    // Arel builds `gteq(begin) AND lt(end)`; And has no invert override, so
    // Node#invert yields `NOT (id >= 1 AND id < 5)` — not a re-derived
    // `(id < 1 OR id >= 5)`.
    const sql = Post.whereNot({ id: new Range(1, 5, true) }).toSql();
    expect(sql).toMatch(/NOT \(.*id.*>=.*AND.*id.*<.*\)/is);
  });

  it("resolves attribute aliases before inversion like build_where_clause", () => {
    // Rails WhereChain#not routes through build_where_clause (query_methods.rb:49),
    // which resolves alias_attribute keys before expand_from_hash — so
    // `where.not(newName: ...)` lands on the real `name` column, inverted.
    const sql = Company.whereNot({ newName: "37signals" }).toSql();
    expect(sql).toMatch(/["`]name["`]\s*!=/);
    expect(sql).not.toMatch(/newName/);
  });
});

// Routing the join through JoinDependency (`joins!` / `left_outer_joins!`) makes
// through-association shapes work for free — the bespoke resolver threw for them.
// `Author has_many :comments, through: :posts` emits both intermediate joins.
describe("WhereChain through association (trails)", () => {
  fixtures(["authors", "posts", "comments", "authorAddresses"]);

  it("associated builds the through join and filters present rows", async () => {
    const relation = Author.all().where().associated("comments");
    expect(relation.toSql()).toMatch(
      /INNER JOIN\s+["`]?posts["`]?.*INNER JOIN\s+["`]?comments["`]?.*["`]?comments["`]?\.["`]?id["`]?\s+IS NOT NULL/is,
    );
    // Authors 1 and 2 have comments through their posts; author 3 has none.
    const authors = await relation.distinct();
    expect(ids(authors)).toEqual([1, 2]);
  });

  it("missing builds the through outer join and filters absent rows", async () => {
    const relation = Author.all().where().missing("comments");
    expect(relation.toSql()).toMatch(
      /LEFT OUTER JOIN\s+["`]?posts["`]?.*LEFT OUTER JOIN\s+["`]?comments["`]?.*["`]?comments["`]?\.["`]?id["`]?\s+IS NULL/is,
    );
    // Author 3 has no comments through posts, so it is reported missing.
    const authors = await relation.distinct();
    expect(ids(authors)).toContain(3);
  });
});
