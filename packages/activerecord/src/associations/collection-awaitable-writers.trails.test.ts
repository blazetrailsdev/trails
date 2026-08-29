import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, RecordNotFound } from "../index.js";
import { CollectionIdsAssignmentError } from "./errors.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Category } from "../test-helpers/models/category.js";
import { fixtures } from "../test-fixtures.js";

interface CollectionOwner {
  assignAttributes(attrs: Record<string, unknown>): Promise<void> | void;
}

interface PostsProxy {
  replace(records: Post[]): Promise<void>;
  count(): Promise<number>;
  toArray(): Promise<Post[]>;
}

const postsOf = (owner: Author): PostsProxy => (owner as unknown as { posts: PostsProxy }).posts;

const targetOf = (owner: Author): Post[] =>
  (owner as unknown as { association(n: string): { target: Post[] } }).association("posts").target;

const writerOf =
  (owner: Author) =>
  (records: Post[]): Promise<void> =>
    (owner as unknown as { association(n: string): { writer(r: Post[]): Promise<void> } })
      .association("posts")
      .writer(records);

const idsWriterOf =
  (owner: Author) =>
  (ids: unknown[]): Promise<void> =>
    (owner as unknown as { association(n: string): { idsWriter(i: unknown[]): Promise<void> } })
      .association("posts")
      .idsWriter(ids);

describe("CollectionAwaitableWriters", () => {
  fixtures(["authors", "posts", "comments"]);

  beforeAll(() => {
    registerModel(Author);
    registerModel(Post);
    registerModel(Comment);
    registerModel(Category);
  });

  it("no native = setter is generated for the collection", async () => {
    const author = await Author.create({ name: "Bill" });
    const post = await Post.create({ title: "t", body: "b" });
    expect(() => {
      (author as unknown as { posts: unknown }).posts = [post];
    }).toThrow(TypeError);
    expect(postsOf(author)).toBeDefined();
  });

  it("no native ids= setter is generated for the collection", async () => {
    const author = await Author.create({ name: "Bill" });
    expect(() => {
      (author as unknown as { postIds: unknown }).postIds = [1];
    }).toThrow(TypeError);
    expect(await (author as unknown as { postIds: Promise<unknown> }).postIds).toBeDefined();
  });

  it("ids= mass-assignment reaches the association writer on either owner arm", async () => {
    const post = await Post.create({ title: "t", body: "b" });
    const assignOn = (owner: Author): Promise<void> | void =>
      (owner as unknown as CollectionOwner).assignAttributes({ postIds: [post.id] });
    const persisted = await Author.create({ name: "Bill" });

    const built = new Author({ name: "Bill" });
    await assignOn(built);
    expect(targetOf(built).map((p) => p.id)).toEqual([post.id]);

    await assignOn(persisted);
    await persisted.reload();
    expect(await postsOf(persisted).count()).toBe(1);
  });

  it("a bad id is a catchable rejection on the awaitable ids surface", async () => {
    const author = await Author.create({ name: "Bill" });
    await expect(author.update({ postIds: [0] })).rejects.toThrow(RecordNotFound);
  });

  it("update assigns collection ids on a persisted owner", async () => {
    const author = await Author.create({ name: "Bill" });
    const first = await Post.create({ title: "a", body: "a" });
    const second = await Post.create({ title: "b", body: "b" });

    expect(await author.update({ postIds: [first.id, second.id] })).toBeTruthy();
    await author.reload();
    expect(await postsOf(author).count()).toBe(2);

    expect(await author.update({ postIds: [second.id] })).toBeTruthy();
    await author.reload();
    expect((await postsOf(author).toArray()).map((p) => p.title)).toEqual(["b"]);
  });

  it("mass-assignment reaches the association writer on a persisted owner", async () => {
    const author = (await Author.create({ name: "Bill" })) as unknown as CollectionOwner;
    const post = await Post.create({ title: "t", body: "b" });
    await author.assignAttributes({ posts: [post] });
    await (author as unknown as Author).reload();
    expect(await postsOf(author as unknown as Author).count()).toBe(1);
  });

  it("assigns the association key in place, after the keys before it", async () => {
    const author = (await Author.create({ name: "Bill" })) as unknown as CollectionOwner;
    const post = await Post.create({ title: "t", body: "b" });

    await author.assignAttributes({ name: "Bob", posts: [post] });
    expect((author as unknown as { name: string }).name).toBe("Bob");
    await (author as unknown as Author).reload();
    expect(await postsOf(author as unknown as Author).count()).toBe(1);
  });

  it("keeps in-memory assignment on construction", async () => {
    const post = new Post({ title: "t", body: "b" });
    const author = new Author({ name: "Bill", posts: [post] });

    expect(targetOf(author).length).toBe(1);
    await author.save();
    await author.reload();
    expect(await postsOf(author).count()).toBe(1);
  });

  it("constructor-form ids= reaches the association writer", async () => {
    const post = await Post.create({ title: "t", body: "b" });
    expect(() => new Author({ name: "Bill", postIds: [post.id] })).toThrow(
      CollectionIdsAssignmentError,
    );
  });

  it("create with an ids= key reaches the association writer", async () => {
    const post = await Post.create({ title: "t", body: "b" });
    await expect(Author.create({ name: "Bill", postIds: [post.id] })).rejects.toThrow(
      CollectionIdsAssignmentError,
    );
  });

  it("constructor-form habtm ids= reaches the association writer", async () => {
    const post = await Post.create({ title: "t", body: "b" });
    expect(() => new Category({ name: "General", postIds: [post.id] })).toThrow(
      CollectionIdsAssignmentError,
    );
  });

  it("constructor-form ids= does not swallow an unknown Ids key", () => {
    expect(() => new Post({ title: "t", body: "b", widgetIds: [1] } as never)).toThrow(/widgetIds/);
  });

  it("the awaitable writer replaces on a persisted owner", async () => {
    const author = await Author.create({ name: "Bill" });
    const first = await Post.create({ title: "a", body: "a" });
    const second = await Post.create({ title: "b", body: "b" });

    await writerOf(author)([first]);
    expect(await postsOf(author).count()).toBe(1);

    await writerOf(author)([second]);
    await author.reload();
    const titles = (await postsOf(author).toArray()).map((p) => p.title);
    expect(titles).toEqual(["b"]);
  });

  it("the awaitable idsWriter replaces on a persisted owner", async () => {
    const author = await Author.create({ name: "Bill" });
    const first = await Post.create({ title: "a", body: "a" });
    const second = await Post.create({ title: "b", body: "b" });

    await idsWriterOf(author)([first.id, second.id]);
    await author.reload();
    expect(await postsOf(author).count()).toBe(2);
  });
});
