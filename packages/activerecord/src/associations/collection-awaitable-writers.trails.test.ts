/**
 * Trails-only: collection associations have NO native `=` writers. Rails
 * generates `#{name}=` and `#{name.singularize}_ids=`
 * (vendor/rails/activerecord/lib/active_record/associations/builder/collection_association.rb:67-74),
 * but both do DB I/O at assignment time — `writer` → `replace` diffs the
 * loaded target and runs the deletes + inserts in a transaction
 * (collection_association.rb:46-48, :242), and `ids_writer` resolves the ids
 * with a query first (:61-83). A JS property setter cannot `await` either, so
 * RFC 0087 §1 deletes them: the awaitable ports on the association —
 * `writer` / `replace` / `idsWriter` — are the only collection-mutation
 * surface. There is no Rails test for this deviation.
 *
 * Mass assignment reaches the collection keys as Rails does (`assign_attributes`
 * → `public_send("#{k}=")`, attribute_assignment.rb:67-69): `_assignAttribute`
 * resolves the association-level writer for the key and sends it, so
 * `assign_attributes` answers a promise for the I/O the send owes and an awaited
 * caller gets Rails' inline timing.
 */
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
    // The reader survives; only the writer half of the property is gone.
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
    // `_assign_attribute` sends (attribute_assignment.rb:67-69), so
    // `#{singular}Ids` reaches Rails' generated `post_ids=`
    // (builder/collection_association.rb:67-74) and its resolving query. That
    // query is the reason `assign_attributes` answers a promise here, and an
    // awaited caller gets Rails' timing on both owner arms.
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
    // Rails' `replace` (collection_association.rb:46-48) runs its diffed
    // deletes+inserts inline at assignment; `assign_attributes` answers a promise
    // for exactly that I/O.
    const author = (await Author.create({ name: "Bill" })) as unknown as CollectionOwner;
    const post = await Post.create({ title: "t", body: "b" });
    await author.assignAttributes({ posts: [post] });
    await (author as unknown as Author).reload();
    expect(await postsOf(author as unknown as Author).count()).toBe(1);
  });

  it("assigns the association key in place, after the keys before it", async () => {
    // Rails' `_assign_attributes` is a plain `each_pair`
    // (activemodel/attribute_assignment.rb:60-64): each send finishes before the
    // loop moves on, so `posts` is written with `name` already assigned — the
    // order the chained sends here have to keep.
    const author = (await Author.create({ name: "Bill" })) as unknown as CollectionOwner;
    const post = await Post.create({ title: "t", body: "b" });

    await author.assignAttributes({ name: "Bob", posts: [post] });
    expect((author as unknown as { name: string }).name).toBe("Bob");
    // `replace` persisted the collection; `name` is assigned but unsaved, as in
    // Rails — `assign_attributes` never saves the owner.
    await (author as unknown as Author).reload();
    expect(await postsOf(author as unknown as Author).count()).toBe(1);
  });

  it("keeps in-memory assignment on construction", async () => {
    // Rails defers here too (`replace_records` without a save — the FK isn't
    // known yet), so the constructor's in-memory arm is faithful and autosave
    // persists at the owner's first `save()`.
    const post = new Post({ title: "t", body: "b" });
    const author = new Author({ name: "Bill", posts: [post] });

    expect(targetOf(author).length).toBe(1);
    await author.save();
    await author.reload();
    expect(await postsOf(author).count()).toBe(1);
  });

  it("constructor-form ids= reaches the association writer", async () => {
    // The throw IS the assertion: without the deferral past `super()` these
    // die with a `TypeError` on an undefined `_associationInstances`, never
    // reaching the writer that raises the deviation.
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
