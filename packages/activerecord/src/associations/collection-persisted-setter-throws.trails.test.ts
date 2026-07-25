/**
 * Trails-only: the native `=` collection setter (`owner.items = [...]`, the
 * `#{singular}Ids=` setter, and the mass-assignment hasMany/HABTM arm)
 * deviates from Rails on a *persisted* owner. Rails'
 * `CollectionAssociation#writer` → `replace`
 * (vendor/rails/activerecord/lib/active_record/associations/collection_association.rb:46-48,
 * :242) diffs against the loaded target and runs the deletes + inserts inline
 * in a transaction (`replace_records`) — synchronous DB I/O JS cannot do from
 * a property setter. Rather than silently deferring the writes to the owner's
 * next `save()` (where a deferred delete can race an interim insert), the
 * setter THROWS and names the awaitable Rails-named replacement
 * (`await owner.items.replace([...])`). On an *unpersisted* owner Rails does
 * no I/O either, so the in-memory replace is faithful and kept. There is no
 * Rails test for this deviation.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, AssociationTypeMismatch } from "../index.js";
import { CollectionPersistedAssignmentError } from "./errors.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { fixtures } from "../test-helpers/fixtures.js";

interface CollectionOwner {
  posts?: unknown;
  postIds?: unknown;
  assignAttributes(attrs: Record<string, unknown>): void;
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

describe("CollectionPersistedSetterThrows", () => {
  fixtures(["authors", "posts", "comments"]);

  beforeAll(() => {
    registerModel(Author);
    registerModel(Post);
    registerModel(Comment);
  });

  it("native = setter throws on a persisted owner", async () => {
    const author = (await Author.create({ name: "Bill" })) as unknown as CollectionOwner;
    const post = await Post.create({ title: "t", body: "b" });
    expect(() => {
      author.posts = [post];
    }).toThrow(CollectionPersistedAssignmentError);
    // The message names the awaitable Rails-named replacement.
    expect(() => {
      author.posts = [post];
    }).toThrow(/await owner\.posts\.replace\(\[\.\.\.\]\)/);
  });

  it("native = setter raises the type mismatch before the persisted-owner throw", async () => {
    // Rails' `replace` raises `AssociationTypeMismatch` for every element as
    // its first statement (collection_association.rb:242), before any other
    // work — the sync guard is preserved ahead of the persisted-owner throw.
    const author = (await Author.create({ name: "Bill" })) as unknown as CollectionOwner;
    expect(() => {
      author.posts = [1];
    }).toThrow(AssociationTypeMismatch);
  });

  it("ids= setter throws on a persisted owner", async () => {
    const author = (await Author.create({ name: "Bill" })) as unknown as CollectionOwner;
    const post = await Post.create({ title: "t", body: "b" });
    expect(() => {
      author.postIds = [post.id];
    }).toThrow(CollectionPersistedAssignmentError);
  });

  it("mass-assignment throws on a persisted owner", async () => {
    const author = (await Author.create({ name: "Bill" })) as unknown as CollectionOwner;
    const post = await Post.create({ title: "t", body: "b" });
    // Mass-assignment wraps a failing setter in `AttributeAssignmentError`
    // (Rails' `_assign_attributes` rescue), so the deviation surfaces as the
    // `cause`.
    let raised: unknown;
    try {
      author.assignAttributes({ posts: [post] });
    } catch (e) {
      raised = e;
    }
    expect((raised as { cause?: unknown })?.cause).toBeInstanceOf(
      CollectionPersistedAssignmentError,
    );
  });

  it("keeps in-memory assignment on an unpersisted owner", async () => {
    // Rails defers here too (`replace_records` without a save — the FK isn't
    // known yet), so the sync setter is faithful and autosave persists at the
    // owner's first `save()`.
    const author = new Author({ name: "Bill" });
    const post = new Post({ title: "t", body: "b" });
    (author as unknown as CollectionOwner).posts = [post];

    expect(targetOf(author).length).toBe(1);
    await author.save();
    await author.reload();
    expect(await postsOf(author).count()).toBe(1);
  });

  it("constructor-form ids= reaches the association writer", async () => {
    // `new Author({postIds: [...]})` used to die with an opaque
    // `TypeError: Cannot read properties of undefined (reading 'get')`: the
    // ids key matched no association NAME, so it stayed in the bag super()
    // assigns, and the generated writer reached `this.association("posts")`
    // before the association cache field existed. Rails has no such split
    // (`Author.new(post_ids: [...])` runs `ids_writer` normally,
    // collection_association.rb:61-83).
    const post = await Post.create({ title: "t", body: "b" });
    let author: Author | undefined;
    expect(() => {
      author = new Author({ name: "Bill", postIds: [post.id] });
    }).not.toThrow();
    // The generated setter can't await, so the id→record resolution it kicks
    // off is still in flight when the constructor returns (the pre-existing
    // shape documented on `queueIdsWrite`). Settle it before asserting.
    for (let i = 0; i < 50 && targetOf(author!).length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(targetOf(author!).map((p) => p.id)).toEqual([post.id]);
  });

  it("constructor-form ids= does not swallow an unknown Ids key", async () => {
    // Only a key that is a real generated collection writer is deferred — a
    // model without the matching association still reports the key as unknown
    // rather than having it silently rerouted.
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
});
