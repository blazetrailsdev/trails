/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/or_test.rb
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { adapterType } from "../test-adapter.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Author } from "../test-helpers/models/author.js";
import { Post, SpecialPost } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Paragraph } from "../test-helpers/models/paragraph.js";

registerModel([Author, Post, SpecialPost, Comment, Paragraph]);

// Compare via `<`/`>` (not subtraction): PG round-trips `id` as a BigInt and a
// BigInt-returning sort comparator throws "Cannot convert a BigInt value to a
// number" when Array.sort coerces it. `<`/`>` work for both number and BigInt.
const byId = (records: any[]) =>
  [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

describe("OrTest", () => {
  fixtures(["posts", "authors", "authorAddresses"], {
    schema: canonicalSchema,
  });

  it("or with relation", async () => {
    const expected = await Post.where("id = 1 or id = 2");
    expect(await Post.where("id = 1").or(Post.where("id = 2"))).toEqual(expected);
  });

  it("or identity", async () => {
    const expected = await Post.where("id = 1");
    expect(await Post.where("id = 1").or(Post.where("id = 1"))).toEqual(expected);
  });

  it("or with null left", async () => {
    const expected = await Post.where("id = 1");
    expect(await Post.none().or(Post.where("id = 1"))).toEqual(expected);
  });

  it("or with null right", async () => {
    const expected = await Post.where("id = 1");
    expect(await Post.where("id = 1").or(Post.none())).toEqual(expected);
  });

  // 2^63 overflows the int8 column range. QueryAttribute#isUnboundable() fires
  // (query_attribute.rb:46-50) and the Arel equality visitor emits "1=0" for that
  // predicate (to_sql.rb:643-647), so the OR collapses to id=1 only.
  it("or with large number", async () => {
    const expected = await Post.where("id = 1 or id = 9223372036854775808");
    expect(await Post.where({ id: 1 }).or(Post.where({ id: 9223372036854775808n }))).toEqual(
      expected,
    );
  });

  it("or with bind params", async () => {
    const expected = byId((await Post.find([1, 2])) as any[]);
    expect(byId(await Post.where({ id: 1 }).or(Post.where({ id: 2 })))).toEqual(expected);
  });

  it("or with null both", async () => {
    const expected = await Post.none();
    expect(await Post.none().or(Post.none())).toEqual(expected);
  });

  it("or without left where", async () => {
    const expected = await Post.all();
    expect(await Post.or(Post.where("id = 1"))).toEqual(expected);
  });

  it("or without right where", async () => {
    const expected = await Post.all();
    expect(await Post.where("id = 1").or(Post.all())).toEqual(expected);
  });

  it("or preserves other querying methods", async () => {
    const expected = await Post.where("id = 1 or id = 2 or id = 3").order("body asc");
    const partial = Post.order("body asc");
    expect(await partial.where("id = 1").or(partial.where({ id: [2, 3] }))).toEqual(expected);
    expect(
      await Post.order("body asc")
        .where("id = 1")
        .or(Post.order("body asc").where({ id: [2, 3] })),
    ).toEqual(expected);
  });

  it("or with incompatible single value relations", () => {
    expect(() =>
      Post.distinct()
        .where("id = 1")
        .or(Post.where({ id: [2, 3] })),
    ).toThrow(
      "Relation passed to #or must be structurally compatible. Incompatible values: [:distinct]",
    );
  });

  it("or with incompatible multi value relations", () => {
    expect(() =>
      Post.order("body asc")
        .where("id = 1")
        .or(Post.order("id desc").where({ id: [2, 3] })),
    ).toThrow(
      "Relation passed to #or must be structurally compatible. Incompatible values: [:order]",
    );
  });

  it("or with unscope where", async () => {
    const expected = await Post.where("id = 1 or id = 2");
    const partial = Post.where("id = 1 and id != 2");
    expect(await partial.or(partial.unscope("where").where("id = 2"))).toEqual(expected);
  });

  it("or with unscope where column", async () => {
    const expected = await Post.where("id = 1 or id = 2");
    const partial = Post.where({ id: 1 }).whereNot({ id: 2 });
    expect(await partial.or(partial.unscope({ where: "id" }).where("id = 2"))).toEqual(expected);
  });

  it("or with unscope order", async () => {
    const expected = byId(await Post.where("id = 1 or id = 2"));
    expect(
      byId(await Post.order("body asc").where("id = 1").unscope("order").or(Post.where("id = 2"))),
    ).toEqual(expected);
    expect(
      byId(
        await Post.order("id")
          .where("id = 1")
          .or(Post.order("id").where("id = 2").unscope("order")),
      ),
    ).toEqual(expected);
  });

  it("or with incompatible unscope", () => {
    expect(() =>
      Post.order("body asc")
        .where("id = 1")
        .unscope("order")
        .or(Post.order("body asc").where("id = 2")),
    ).toThrow(
      "Relation passed to #or must be structurally compatible. Incompatible values: [:order]",
    );
  });

  it("or when grouping", async () => {
    const groups = Post.where("id < 10").group("body");
    const expected = await groups.having("COUNT(*) > 1 OR body like 'Such%'").count();
    expect(
      await groups.having("COUNT(*) > 1").or(groups.having("body like 'Such%'")).count(),
    ).toEqual(expected);
  });

  it("or with named scope", async () => {
    const expected = await Post.where("id = 1 or body LIKE '%a%'");
    expect(await Post.where("id = 1").or((Post as any).containingTheLetterA())).toEqual(expected);
  });

  it("or inside named scope", async () => {
    const expected = await Post.where("body LIKE '%a%' OR title LIKE ?", "%'%").order("id DESC");
    expect(
      await (Post.order({ id: "desc" }) as any).typographicallyInteresting().toArray(),
    ).toEqual(expected);
  });

  it("or with sti relation", async () => {
    const expected = byId(await Post.where("id = 1 or id = 2"));
    expect(byId(await Post.where({ id: 1 }).or(SpecialPost.all()))).toEqual(expected);
  });

  it("or on loaded relation", async () => {
    const expected = await Post.where("id = 1 or id = 2");
    const p = Post.where("id = 1");
    await p.load();
    expect(p.loaded).toBe(true);
    expect(await p.or(Post.where("id = 2"))).toEqual(expected);
  });

  it("or with non relation object raises error", () => {
    expect(() => Post.where({ id: [1, 2, 3] }).or({ title: "Rails" } as any)).toThrow(
      "You have passed Hash object to #or. Pass an ActiveRecord::Relation object instead.",
    );
  });

  it("or with references inequality", async () => {
    const joined = Post.includes("author");
    const actual = joined
      .where({ authors: { id: 1 } })
      .or(joined.where({ title: "I don't have any comments" }));
    const author = (await Author.find(1)) as any;
    const expected = [
      ...(await author.posts.toArray()),
      ...(await Post.where({ title: "I don't have any comments" })),
    ];
    expect(byId(await actual.toArray()).map((p: any) => p.id)).toEqual(
      byId(expected).map((p: any) => p.id),
    );
  });

  it("or with scope on association", async () => {
    const author = (await Author.first()) as any;
    let threw = false;
    try {
      await author.topPosts.or(author.otherTopPosts).toArray();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("or with annotate", () => {
    const quotedPosts = Post.quotedTableName();
    // Rails anchors each match at `\z`: the annotation comment is the SQL tail.
    const tail = (sql: string) => sql.replace(/\s+/g, " ").trimEnd();
    expect(tail(Post.annotate("foo").or(Post.all()).toSql())).toMatch(
      new RegExp(`${quotedPosts} /\\* foo \\*/$`),
    );
    expect(tail(Post.annotate("foo").or(Post.annotate("foo")).toSql())).toMatch(
      new RegExp(`${quotedPosts} /\\* foo \\*/$`),
    );
    expect(tail(Post.annotate("foo").or(Post.annotate("bar")).toSql())).toMatch(
      new RegExp(`${quotedPosts} /\\* foo \\*/$`),
    );
    expect(tail(Post.annotate("foo", "bar").or(Post.annotate("foo")).toSql())).toMatch(
      new RegExp(`${quotedPosts} /\\* foo \\*/ /\\* bar \\*/$`),
    );
  });

  it("structurally incompatible values", () => {
    // Rails wraps these in `assert_nothing_raised` and never executes them — it
    // only asserts that `#or` doesn't raise on structurally-equal relations.
    // Don't call `.toArray()`: e.g. `Post.group("author_id")` selecting
    // `posts.*` would error on PG ("must appear in GROUP BY"), which Rails never
    // hits because it doesn't run the query.
    let threw = false;
    try {
      Post.includes("author").includes("author").or(Post.includes("author"));
      Post.eagerLoad("author").eagerLoad("author").or(Post.eagerLoad("author"));
      Post.preload("author").preload("author").or(Post.preload("author"));
      Post.group("author_id").group("author_id").or(Post.group("author_id"));
      Post.joins("author").joins("author").or(Post.joins("author"));
      Post.leftOuterJoins("author").leftOuterJoins("author").or(Post.leftOuterJoins("author"));
      Post.from("posts").or(Post.from("posts"));
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

// The maximum expression tree depth is 1000 by default for SQLite3.
// https://www.sqlite.org/limits.html#max_expr_depth
describe("TooManyOrTest", () => {
  fixtures(["paragraphs"], { schema: canonicalSchema });

  it.skipIf(adapterType === "sqlite")("too many or", async () => {
    const paragraphs = Array.from({ length: 1001 }, (_, i) =>
      Paragraph.where({ id: i, book_id: i * i }),
    );
    const combined = paragraphs.reduce((acc, rel) => acc.or(rel));
    expect(await combined.count()).toBe(1001);
  });
});
