/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/or_test.rb
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { adapterType } from "../test-adapter.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Author } from "../test-helpers/models/author.js";
import { Post, SpecialPost } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Paragraph } from "../test-helpers/models/paragraph.js";

registerModel([Author, Post, SpecialPost, Comment, Paragraph]);

const byId = (records: any[]) => [...records].sort((a, b) => a.id - b.id);

describe("OrTest", () => {
  useHandlerFixtures(["posts", "authors", "authorAddresses"], {
    schema: canonicalSchema,
  });

  it("test_or_with_relation", async () => {
    const expected = await Post.where("id = 1 or id = 2").toArray();
    expect(await Post.where("id = 1").or(Post.where("id = 2")).toArray()).toEqual(expected);
  });

  it("test_or_identity", async () => {
    const expected = await Post.where("id = 1").toArray();
    expect(await Post.where("id = 1").or(Post.where("id = 1")).toArray()).toEqual(expected);
  });

  it("test_or_with_null_left", async () => {
    const expected = await Post.where("id = 1").toArray();
    expect(await Post.none().or(Post.where("id = 1")).toArray()).toEqual(expected);
  });

  it("test_or_with_null_right", async () => {
    const expected = await Post.where("id = 1").toArray();
    expect(await Post.where("id = 1").or(Post.none()).toArray()).toEqual(expected);
  });

  it("test_or_with_large_number", async () => {
    const expected = await Post.where("id = 1 or id = 9223372036854775808").toArray();
    expect(
      await Post.where({ id: 1 })
        .or(Post.where({ id: 9223372036854775808n }))
        .toArray(),
    ).toEqual(expected);
  });

  it("test_or_with_bind_params", async () => {
    const expected = byId((await Post.find([1, 2])) as any[]);
    expect(
      byId(
        await Post.where({ id: 1 })
          .or(Post.where({ id: 2 }))
          .toArray(),
      ),
    ).toEqual(expected);
  });

  it("test_or_with_null_both", async () => {
    const expected = await Post.none().toArray();
    expect(await Post.none().or(Post.none()).toArray()).toEqual(expected);
  });

  it("test_or_without_left_where", async () => {
    const expected = await Post.all().toArray();
    expect(await Post.or(Post.where("id = 1")).toArray()).toEqual(expected);
  });

  it("test_or_without_right_where", async () => {
    const expected = await Post.all().toArray();
    expect(await Post.where("id = 1").or(Post.all()).toArray()).toEqual(expected);
  });

  it("test_or_preserves_other_querying_methods", async () => {
    const expected = await Post.where("id = 1 or id = 2 or id = 3").order("body asc").toArray();
    const partial = Post.order("body asc");
    expect(
      await partial
        .where("id = 1")
        .or(partial.where({ id: [2, 3] }))
        .toArray(),
    ).toEqual(expected);
    expect(
      await Post.order("body asc")
        .where("id = 1")
        .or(Post.order("body asc").where({ id: [2, 3] }))
        .toArray(),
    ).toEqual(expected);
  });

  it("test_or_with_incompatible_single_value_relations", () => {
    expect(() =>
      Post.distinct()
        .where("id = 1")
        .or(Post.where({ id: [2, 3] })),
    ).toThrow(
      "Relation passed to #or must be structurally compatible. Incompatible values: [:distinct]",
    );
  });

  it("test_or_with_incompatible_multi_value_relations", () => {
    expect(() =>
      Post.order("body asc")
        .where("id = 1")
        .or(Post.order("id desc").where({ id: [2, 3] })),
    ).toThrow(
      "Relation passed to #or must be structurally compatible. Incompatible values: [:order]",
    );
  });

  it("test_or_with_unscope_where", async () => {
    const expected = await Post.where("id = 1 or id = 2").toArray();
    const partial = Post.where("id = 1 and id != 2");
    expect(await partial.or(partial.unscope("where").where("id = 2")).toArray()).toEqual(expected);
  });

  it("test_or_with_unscope_where_column", async () => {
    const expected = await Post.where("id = 1 or id = 2").toArray();
    const partial = Post.where({ id: 1 }).whereNot({ id: 2 });
    expect(await partial.or(partial.unscope({ where: "id" }).where("id = 2")).toArray()).toEqual(
      expected,
    );
  });

  it("test_or_with_unscope_order", async () => {
    const expected = byId(await Post.where("id = 1 or id = 2").toArray());
    expect(
      byId(
        await Post.order("body asc")
          .where("id = 1")
          .unscope("order")
          .or(Post.where("id = 2"))
          .toArray(),
      ),
    ).toEqual(expected);
    expect(
      byId(
        await Post.order("id")
          .where("id = 1")
          .or(Post.order("id").where("id = 2").unscope("order"))
          .toArray(),
      ),
    ).toEqual(expected);
  });

  it("test_or_with_incompatible_unscope", () => {
    expect(() =>
      Post.order("body asc")
        .where("id = 1")
        .unscope("order")
        .or(Post.order("body asc").where("id = 2")),
    ).toThrow(
      "Relation passed to #or must be structurally compatible. Incompatible values: [:order]",
    );
  });

  it("test_or_when_grouping", async () => {
    const groups = Post.where("id < 10").group("body");
    const expected = await groups.having("COUNT(*) > 1 OR body like 'Such%'").count();
    expect(
      await groups.having("COUNT(*) > 1").or(groups.having("body like 'Such%'")).count(),
    ).toEqual(expected);
  });

  it("test_or_with_named_scope", async () => {
    const expected = await Post.where("id = 1 or body LIKE '%a%'").toArray();
    expect(
      await Post.where("id = 1")
        .or((Post as any).containingTheLetterA())
        .toArray(),
    ).toEqual(expected);
  });

  it("test_or_inside_named_scope", async () => {
    const expected = await Post.where("body LIKE '%a%' OR title LIKE ?", "%'%")
      .order("id DESC")
      .toArray();
    expect(
      await (Post.order({ id: "desc" }) as any).typographicallyInteresting().toArray(),
    ).toEqual(expected);
  });

  it("test_or_with_sti_relation", async () => {
    const expected = byId(await Post.where("id = 1 or id = 2").toArray());
    expect(byId(await Post.where({ id: 1 }).or(SpecialPost.all()).toArray())).toEqual(expected);
  });

  it("test_or_on_loaded_relation", async () => {
    const expected = await Post.where("id = 1 or id = 2").toArray();
    const p = Post.where("id = 1");
    await p.load();
    expect(p.loaded).toBe(true);
    expect(await p.or(Post.where("id = 2")).toArray()).toEqual(expected);
  });

  it("test_or_with_non_relation_object_raises_error", () => {
    expect(() => Post.where({ id: [1, 2, 3] }).or({ title: "Rails" } as any)).toThrow(
      "You have passed Hash object to #or. Pass an ActiveRecord::Relation object instead.",
    );
  });

  it("test_or_with_references_inequality", async () => {
    const joined = Post.includes("author");
    const actual = joined
      .where({ authors: { id: 1 } })
      .or(joined.where({ title: "I don't have any comments" }));
    const author = (await Author.find(1)) as any;
    const expected = [
      ...(await author.posts.toArray()),
      ...(await Post.where({ title: "I don't have any comments" }).toArray()),
    ];
    expect(byId(await actual.toArray()).map((p: any) => p.id)).toEqual(
      byId(expected).map((p: any) => p.id),
    );
  });

  it("test_or_with_scope_on_association", async () => {
    const author = (await Author.first()) as any;
    let threw = false;
    try {
      await author.topPosts.or(author.otherTopPosts).toArray();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("test_or_with_annotate", () => {
    const quotedPosts = Post.quotedTableName();
    const tail = (sql: string) => sql.replace(/\s+/g, " ");
    expect(tail(Post.annotate("foo").or(Post.all()).toSql())).toContain(`${quotedPosts} /* foo */`);
    expect(tail(Post.annotate("foo").or(Post.annotate("foo")).toSql())).toContain(
      `${quotedPosts} /* foo */`,
    );
    expect(tail(Post.annotate("foo").or(Post.annotate("bar")).toSql())).toContain(
      `${quotedPosts} /* foo */`,
    );
    expect(tail(Post.annotate("foo", "bar").or(Post.annotate("foo")).toSql())).toContain(
      `${quotedPosts} /* foo */ /* bar */`,
    );
  });

  it("test_structurally_incompatible_values", async () => {
    let threw = false;
    try {
      await Post.includes("author").includes("author").or(Post.includes("author")).toArray();
      await Post.eagerLoad("author").eagerLoad("author").or(Post.eagerLoad("author")).toArray();
      await Post.preload("author").preload("author").or(Post.preload("author")).toArray();
      await Post.group("author_id").group("author_id").or(Post.group("author_id")).toArray();
      await Post.joins("author").joins("author").or(Post.joins("author")).toArray();
      await Post.leftOuterJoins("author")
        .leftOuterJoins("author")
        .or(Post.leftOuterJoins("author"))
        .toArray();
      await Post.from("posts").or(Post.from("posts")).toArray();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

// The maximum expression tree depth is 1000 by default for SQLite3.
// https://www.sqlite.org/limits.html#max_expr_depth
describe("TooManyOrTest", () => {
  useHandlerFixtures(["paragraphs"], { schema: canonicalSchema });

  it.skipIf(adapterType === "sqlite")("test_too_many_or", async () => {
    const paragraphs = Array.from({ length: 1001 }, (_, i) =>
      Paragraph.where({ id: i, book_id: i * i }),
    );
    const combined = paragraphs.reduce((acc, rel) => acc.or(rel));
    expect(await combined.count()).toBe(1001);
  });
});
