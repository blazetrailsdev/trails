import { describe, it, expect } from "vitest";
import "../index.js";
import { Range } from "../index.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { isBlank as blank } from "@blazetrails/activesupport";
import { Nodes } from "@blazetrails/arel";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Author } from "../test-helpers/models/author.js";
import { Book } from "../test-helpers/models/book.js";
import { Human } from "../test-helpers/models/human.js";
import { Essay } from "../test-helpers/models/essay.js";
import { CpkAuthor, CpkBook } from "../test-helpers/models/cpk.js";
import "../support/canonical-model-index.js";

registerModel(Post);
registerModel(Comment);
registerModel(Author);
registerModel(Book);
registerModel(Human);
registerModel(Essay);
registerModel(CpkAuthor);
registerModel(CpkBook);

const ids = (records: unknown[]): unknown[] => records.map((r) => (r as any).id);

describe("WhereChainTest", () => {
  const { posts, comments, authors, humans } = fixtures([
    "posts",
    "comments",
    "authors",
    "humans",
    "essays",
    "authorAddresses",
    "books",
  ]);

  const davidPostsCount = async (): Promise<number> =>
    (await ((await Author.find(1)) as any).posts.toArray()).length;

  it("associated with association", async () => {
    const relation = await Post.all().where().associated("author");
    expect(relation).toContainEqual(posts("welcome"));
    expect(relation).toContainEqual(posts("sti_habtm"));
    expect(relation).not.toContainEqual(posts("authorless"));
  });

  it("associated with child association", async () => {
    const relation = await Comment.all().where().associated("children");
    expect(relation).toContainEqual(comments("greetings"));
    expect(relation).not.toContainEqual(comments("more_greetings"));
  });

  it("associated with multiple associations", async () => {
    const relation = await Post.all().where().associated("author", "comments");
    expect(relation).toContainEqual(posts("welcome"));
    expect(relation).not.toContainEqual(posts("sti_habtm"));
    expect(relation).not.toContainEqual(posts("authorless"));
  });

  it("associated with invalid association name", async () => {
    const run = async () => Post.all().where().associated("cars");
    const e = await run().then(
      () => undefined,
      (err: Error) => err,
    );
    expect(() => {
      throw e;
    }).toThrow(ArgumentError);
    expect((e as Error).message).toMatch(
      /An association named `:cars` does not exist on the model `Post`\./,
    );
  });

  it("associated merged with scope on association", async () => {
    expect(
      await Post.all()
        .where()
        .associated("author")
        .merge(Author.where({ id: 1 }))
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("associated unscoped merged with scope on association", async () => {
    expect(
      await Post.unscope(":where")
        .where()
        .associated("author")
        .merge(Author.where({ id: 1 }))
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("associated unscoped merged joined with scope on association", async () => {
    expect(
      await Post.joins(":author")
        .unscope(":where")
        .where()
        .associated("author")
        .merge(Author.where({ id: 1 }))
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("associated unscoped merged joined extended early with scope on association", async () => {
    expect(
      await Post.extending(Post.namedExtension)
        .joins(":author")
        .unscope(":where")
        .where()
        .associated("author")
        .merge(Author.where({ id: 1 }))
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("associated unscoped merged joined extended late with scope on association", async () => {
    expect(
      await Post.joins(":author")
        .unscope(":where")
        .where()
        .associated("author")
        .merge(Author.where({ id: 1 }))
        .extending(Post.namedExtension)
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("associated ordered merged with scope on association", async () => {
    expect(
      await Post.order({ created_at: "desc" })
        .where()
        .associated("author")
        .merge(Author.where({ id: 1 }))
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("associated ordered merged joined with scope on association", async () => {
    expect(
      await Post.joins(":author")
        .order({ created_at: "desc" })
        .where()
        .associated("author")
        .merge(Author.where({ id: 1 }))
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("associated with enum", async () => {
    const first = await Author.joins(":readingListing")
      .where()
      .associated("readingListing")
      .first();
    expect((first as any).id).toBe(((await Author.find(2)) as any).id);
  });

  it("associated with enum ordered", async () => {
    const first = await Author.order({ id: "desc" })
      .joins(":readingListing")
      .where()
      .associated("readingListing")
      .first();
    expect((first as any).id).toBe(((await Author.find(2)) as any).id);
  });

  it("associated with enum unscoped", async () => {
    const first = await Author.unscope(":where")
      .joins(":readingListing")
      .where()
      .associated("readingListing")
      .first();
    expect((first as any).id).toBe(((await Author.find(2)) as any).id);
  });

  it("associated with enum extended early", async () => {
    const first = await Author.extending(Author.namedExtension)
      .order({ id: "desc" })
      .joins(":readingListing")
      .where()
      .associated("readingListing")
      .first();
    expect((first as any).id).toBe(((await Author.find(2)) as any).id);
  });

  it("associated with enum extended late", async () => {
    const first = await Author.order({ id: "desc" })
      .joins(":readingListing")
      .where()
      .associated("readingListing")
      .extending(Author.namedExtension)
      .first();
    expect((first as any).id).toBe(((await Author.find(2)) as any).id);
  });

  it("associated with add joins before", async () => {
    const relation = await Comment.joins(":children").where().associated("children");
    expect(relation).toContainEqual(comments("greetings"));
    expect(relation).not.toContainEqual(comments("more_greetings"));
  });

  it("associated with add left joins before", async () => {
    const relation = await Comment.leftJoins(":children").where().associated("children");
    expect(relation).toContainEqual(comments("greetings"));
    expect(relation).not.toContainEqual(comments("more_greetings"));
  });

  it("associated with add left outer joins before", async () => {
    const relation = await Comment.leftOuterJoins(":children").where().associated("children");
    expect(relation).toContainEqual(comments("greetings"));
    expect(relation).not.toContainEqual(comments("more_greetings"));
  });

  it("associated with composite primary key", async () => {
    const author = await CpkAuthor.create({ name: "Cpk" });
    await CpkBook.create({ id: [(author as any).id, 2] });
    expect(await CpkAuthor.all().where().associated("books").isAny()).toBeTruthy();
  });

  it("missing with association", async () => {
    expect(blank(await (posts("authorless") as any).author)).toBeTruthy();
    const relation = await Post.all().where().missing("author");
    expect(ids(relation)).toEqual([posts("authorless").id]);
  });

  it("missing with child association", async () => {
    const relation = await Comment.all().where().missing("children");
    expect(relation).toContainEqual(comments("more_greetings"));
    expect(relation).not.toContainEqual(comments("greetings"));
  });

  it("missing with invalid association name", async () => {
    const run = async () => Post.all().where().missing("cars");
    const e = await run().then(
      () => undefined,
      (err: Error) => err,
    );
    expect(() => {
      throw e;
    }).toThrow(ArgumentError);
    expect((e as Error).message).toMatch(
      /An association named `:cars` does not exist on the model `Post`\./,
    );
  });

  it("missing with multiple association", async () => {
    expect(await (posts("authorless") as any).comments.isEmpty()).toBeTruthy();
    const relation = await Post.all().where().missing("author", "comments");
    expect(ids(relation)).toEqual([posts("authorless").id]);
  });

  it("missing merged with scope on association", async () => {
    expect(
      await Post.all()
        .where()
        .missing("author")
        .merge(Author.where({ id: 1 }))
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("missing unscoped merged with scope on association", async () => {
    expect(
      await Post.joins(":author")
        .unscope(":where")
        .where()
        .missing("author")
        .merge(Author.where({ id: 1 }))
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("missing unscoped merged joined with scope on association", async () => {
    expect(
      await Post.unscope(":where")
        .where()
        .missing("author")
        .merge(Author.where({ id: 1 }))
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("missing ordered merged with scope on association", async () => {
    expect(
      await Post.order({ created_at: "desc" })
        .where()
        .missing("author")
        .merge(Author.where({ id: 1 }))
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("missing ordered merged joined with scope on association", async () => {
    expect(
      await Post.joins(":author")
        .order({ created_at: "desc" })
        .where()
        .missing("author")
        .merge(Author.where({ id: 1 }))
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("missing unscoped merged joined extended early with scope on association", async () => {
    expect(
      await Post.extending(Post.namedExtension)
        .joins(":author")
        .unscope(":where")
        .where()
        .missing("author")
        .merge(Author.where({ id: 1 }))
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("missing unscoped merged joined extended late with scope on association", async () => {
    expect(
      await Post.joins(":author")
        .unscope(":where")
        .where()
        .missing("author")
        .merge(Author.where({ id: 1 }))
        .extending(Post.namedExtension)
        .count(),
    ).toBe(await davidPostsCount());
  });

  it("missing with enum", async () => {
    const first = await Author.joins(":readingListing").where().missing("unreadListing").first();
    expect((first as any).id).toBe(((await Author.find(2)) as any).id);
  });

  it("missing with enum ordered", async () => {
    const first = await Author.order({ id: "desc" })
      .joins(":readingListing")
      .where()
      .missing("unreadListing")
      .first();
    expect((first as any).id).toBe(((await Author.find(2)) as any).id);
  });

  it("missing with enum unscoped", async () => {
    const first = await Author.unscope(":where")
      .joins(":readingListing")
      .where()
      .missing("unreadListing")
      .first();
    expect((first as any).id).toBe(((await Author.find(2)) as any).id);
  });

  it("missing with enum extended early", async () => {
    const first = await Author.extending(Author.namedExtension)
      .order({ id: "desc" })
      .joins(":readingListing")
      .where()
      .missing("unreadListing")
      .first();
    expect((first as any).id).toBe(((await Author.find(2)) as any).id);
  });

  it("missing with enum extended late", async () => {
    const first = await Author.order({ id: "desc" })
      .joins(":readingListing")
      .where()
      .missing("unreadListing")
      .extending(Author.namedExtension)
      .first();
    expect((first as any).id).toBe(((await Author.find(2)) as any).id);
  });

  it("missing with composite primary key", async () => {
    await CpkBook.create({ id: [1, 2] });
    expect(await CpkBook.all().where().missing("author").isAny()).toBeTruthy();
  });

  it("not inverts where clause", () => {
    const relation = Post.all().where().not({ title: "hello" });
    const expected = Post.where({ title: "hello" }).invertWhere();
    expect(relation.toSql()).toBe(expected.toSql());
  });

  it("not with nil", () => {
    expect(() =>
      Post.all()
        .where()
        .not(null as any),
    ).toThrow();
  });

  it("association not eq", () => {
    const expected = (Comment as any).arelTable.get("title").notEq(new Nodes.BindParam(1));
    const relation = Post.joins(":comments")
      .where()
      .not({ comments: { title: "hello" } });
    expect(relation.whereClause.ast.toSql()).toEqual(expected.toSql());
  });

  it("not eq with preceding where", () => {
    const relation = Post.where({ title: "hello" }).where().not({ title: "world" });
    const expectedWhereClause = Post.where({ title: "hello" }).whereClause.plus(
      Post.where({ title: "world" }).whereClause.invert(),
    );
    expect(relation.whereClause).toEqual(expectedWhereClause);
  });

  it("not eq with succeeding where", () => {
    const relation = Post.all().where().not({ title: "hello" }).where({ title: "world" });
    const expectedWhereClause = Post.where({ title: "hello" })
      .whereClause.invert()
      .plus(Post.where({ title: "world" }).whereClause);
    expect(relation.whereClause).toEqual(expectedWhereClause);
  });

  it("chaining multiple", () => {
    const relation = Post.all()
      .where()
      .not({ author_id: [1, 2] })
      .where()
      .not({ title: "ruby on rails" });
    const expectedWhereClause = Post.where({ author_id: [1, 2] })
      .whereClause.invert()
      .plus(Post.where({ title: "ruby on rails" }).whereClause.invert());
    expect(relation.whereClause).toEqual(expectedWhereClause);
  });

  it("rewhere with one condition", async () => {
    const relation = Post.where({ body: "hello" })
      .where({ body: "world" })
      .rewhere({ body: "hullo" });
    const expected = Post.where({ body: "hullo" });
    expect(ids(await relation)).toEqual(ids(await expected));
  });

  it("rewhere with multiple overwriting conditions", async () => {
    const relation = Post.where({ body: "hello" })
      .where({ type: "StiPost" })
      .rewhere({ body: "hullo", type: "Post" });
    const expected = Post.where({ body: "hullo", type: "Post" });
    expect(ids(await relation)).toEqual(ids(await expected));
  });

  it("rewhere with one overwriting condition and one unrelated", async () => {
    const relation = Post.where({ body: "hello" })
      .where({ type: "Post" })
      .rewhere({ body: "hullo" });
    const expected = Post.where({ body: "hullo", type: "Post" });
    expect(ids(await relation)).toEqual(ids(await expected));
  });

  it("rewhere with alias condition", async () => {
    const relation = Post.where({ text: "hello" })
      .where({ text: "world" })
      .rewhere({ text: "hullo" });
    const expected = Post.where({ text: "hullo" });
    expect(ids(await relation)).toEqual(ids(await expected));
  });

  it("rewhere with nested condition", async () => {
    const relation = Post.all()
      .where()
      .missing("comments")
      .rewhere({ "comments.id": comments("does_it_hurt").id });
    const expected = Post.leftJoins(":comments").where({
      "comments.id": comments("does_it_hurt").id,
    });
    expect(ids(await relation)).toEqual(ids(await expected));
  });

  it("rewhere with polymorphic association", async () => {
    const relation = Essay.where({ writer: authors("david") }).rewhere({ writer: humans("steve") });
    const expected = Essay.where({ writer: humans("steve") });
    expect(ids(await relation)).toEqual(ids(await expected));
  });

  it("rewhere with range", async () => {
    const relation = Post.where({ comments_count: new Range(1, 3) }).rewhere({
      comments_count: new Range(3, 5),
    });
    const expected = Post.where({ comments_count: new Range(3, 5) });
    expect(ids(await relation)).toEqual(ids(await expected));
  });

  it("rewhere with infinite upper bound range", async () => {
    const relation = Post.where({ comments_count: new Range(1, Infinity) }).rewhere({
      comments_count: new Range(3, 5),
    });
    const expected = Post.where({ comments_count: new Range(3, 5) });
    expect(ids(await relation)).toEqual(ids(await expected));
  });

  it("rewhere with infinite lower bound range", async () => {
    const relation = Post.where({ comments_count: new Range(-Infinity, 1) }).rewhere({
      comments_count: new Range(3, 5),
    });
    const expected = Post.where({ comments_count: new Range(3, 5) });
    expect(ids(await relation)).toEqual(ids(await expected));
  });

  it("rewhere with infinite range", async () => {
    const relation = Post.where({ comments_count: new Range(-Infinity, Infinity) }).rewhere({
      comments_count: new Range(3, 5),
    });
    const expected = Post.where({ comments_count: new Range(3, 5) });
    expect(ids(await relation)).toEqual(ids(await expected));
  });

  it("rewhere with nil", async () => {
    const relation = Post.where({ comments_count: 16 }).rewhere(null);
    const expected = Post.all();
    expect(ids(await relation)).toEqual(ids(await expected));
  });
});
