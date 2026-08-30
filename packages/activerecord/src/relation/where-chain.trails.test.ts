import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Author } from "../test-helpers/models/author.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Customer } from "../test-helpers/models/customer.js";
import { Company } from "../test-helpers/models/company.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { Range } from "@blazetrails/activesupport";

registerModel(Post);
registerModel(Categorization);
registerModel(Author);
registerModel(Comment);

const ids = (records: unknown[]): unknown[] => records.map((r) => (r as { id: unknown }).id).sort();

const authorsJoinCount = (sql: string): number =>
  (sql.match(/join\s+["`]?authors["`]?/gi) ?? []).length;
const joinCount = (sql: string): number => (sql.match(/\bjoin\b/gi) ?? []).length;

describe("WhereChain associated join guard (trails)", () => {
  fixtures(["posts", "authors", "authorAddresses", "comments"]);

  it("does not duplicate an inner join already in joins_values", () => {
    const sql = Post.joins(":author").where().associated("author").toSql();
    expect(authorsJoinCount(sql)).toBe(1);
    expect(sql).toMatch(/INNER JOIN/i);
    expect(sql).toMatch(/["`]?authors["`]?\.["`]?id["`]?\s+IS NOT NULL/i);
  });

  it("does not add an inner join when a left outer join is already present", () => {
    const sql = Post.leftOuterJoins(":author").where().associated("author").toSql();
    expect(authorsJoinCount(sql)).toBe(1);
    expect(sql).toMatch(/LEFT OUTER JOIN/i);
    expect(sql).not.toMatch(/INNER JOIN/i);
    expect(sql).toMatch(/["`]?authors["`]?\.["`]?id["`]?\s+IS NOT NULL/i);
  });

  it("does not duplicate a self-join already in joins_values", () => {
    const inner = Comment.joins(":children").where().associated("children").toSql();
    expect(joinCount(inner)).toBe(1);
    expect(inner).toMatch(/["`]?children["`]?\.["`]?id["`]?\s+IS NOT NULL/i);

    const loj = Comment.leftOuterJoins(":children").where().associated("children").toSql();
    expect(joinCount(loj)).toBe(1);
    expect(loj).toMatch(/["`]?children["`]?\.["`]?id["`]?\s+IS NOT NULL/i);
  });
});

describe("WhereChain not inversion shapes (trails)", () => {
  fixtures(["posts", "authors", "authorAddresses", "customers"]);

  it("inverts an array containing null as NOT (IN ... OR IS NULL)", async () => {
    const relation = Post.where().not({
      title: [null, "Welcome to the weblog", "So I was thinking"],
    });
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
    const relation = Customer.where().not({ address: david.address });
    expect(relation.toSql()).toMatch(
      /NOT \(.*address_street.*AND.*address_city.*AND.*address_country.*\)/is,
    );
    expect(relation.toSql()).not.toMatch(/NOT \(\(/);
    const customers = await relation;
    expect(customers.length).toBeGreaterThan(0);
    expect(ids(customers)).not.toContain(1);
  });

  it("inverts an exclusive range as NOT over the positive bound pair", () => {
    const sql = Post.where()
      .not({ id: new Range(1, 5, true) })
      .toSql();
    expect(sql).toMatch(/NOT \(.*id.*>=.*AND.*id.*<.*\)/is);
  });

  it("resolves attribute aliases before inversion like build_where_clause", () => {
    const sql = Company.where().not({ new_name: "37signals" }).toSql();
    expect(sql).toMatch(/["`]name["`]\s*!=/);
    expect(sql).not.toMatch(/new_name/);
  });
});

describe("WhereChain through association (trails)", () => {
  fixtures(["authors", "posts", "comments", "authorAddresses"]);

  it("associated builds the through join and filters present rows", async () => {
    const relation = Author.all().where().associated("comments");
    expect(relation.toSql()).toMatch(
      /INNER JOIN\s+["`]?posts["`]?.*INNER JOIN\s+["`]?comments["`]?.*["`]?comments["`]?\.["`]?id["`]?\s+IS NOT NULL/is,
    );
    const authors = await relation.distinct();
    expect(ids(authors)).toEqual([1, 2]);
  });

  it("missing builds the through outer join and filters absent rows", async () => {
    const relation = Author.all().where().missing("comments");
    expect(relation.toSql()).toMatch(
      /LEFT OUTER JOIN\s+["`]?posts["`]?.*LEFT OUTER JOIN\s+["`]?comments["`]?.*["`]?comments["`]?\.["`]?id["`]?\s+IS NULL/is,
    );
    const authors = await relation.distinct();
    expect(ids(authors)).toContain(3);
  });
});
