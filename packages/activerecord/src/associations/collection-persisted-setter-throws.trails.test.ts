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
 *
 * The `#{singular}Ids=` setter goes further and throws on BOTH owner arms
 * (`CollectionIdsAssignmentError`): `ids_writer` resolves the ids to records
 * with a query before replacing (collection_association.rb:61-83), so even the
 * new-record arm is DB I/O. The awaitable surfaces are
 * `await owner.update({ itemIds: [...] })` and
 * `await owner.association(name).idsWriter([...])`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, AssociationTypeMismatch, RecordNotFound } from "../index.js";
import { CollectionIdsAssignmentError, CollectionPersistedAssignmentError } from "./errors.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Category } from "../test-helpers/models/category.js";
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

// The `#{singular}Ids=` setter can't await, so the id→record resolution it
// starts is still in flight when the constructor returns (the shape
// `queueIdsWrite` documents). Settle it before asserting on the target.
const settleTarget = async (target: () => unknown[]): Promise<void> => {
  for (let i = 0; i < 50 && target().length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

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
    registerModel(Category);
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
    }).toThrow(CollectionIdsAssignmentError);
    // The message names the awaitable replacements.
    expect(() => {
      author.postIds = [post.id];
    }).toThrow(/await owner\.update\(\{ postIds: \[\.\.\.\] \}\)/);
  });

  it("ids= setter throws on an unpersisted owner too", () => {
    // Unlike the record writer, whose unpersisted arm is pure in-memory work,
    // `ids_writer` queries to resolve the ids even for a new record. Returning
    // that promise from the sync setter made a bad id an unhandled rejection
    // and let an immediate `save()` race the in-flight replace, so this arm
    // throws rather than floating a promise.
    const author = new Author({ name: "Bill" });
    expect(() => {
      (author as unknown as CollectionOwner).postIds = [1];
    }).toThrow(CollectionIdsAssignmentError);
  });

  it("ids= mass-assignment throws on both owner arms", async () => {
    // Mass-assignment shares the setter, so it raises through
    // `_assign_attributes`' rescue — the deviation is the `cause`, as in the
    // record-writer case below.
    const post = await Post.create({ title: "t", body: "b" });
    const causeOf = (owner: Author): unknown => {
      try {
        (owner as unknown as CollectionOwner).assignAttributes({ postIds: [post.id] });
      } catch (e) {
        return (e as { cause?: unknown }).cause;
      }
      return undefined;
    };

    expect(causeOf(new Author({ name: "Bill" }))).toBeInstanceOf(CollectionIdsAssignmentError);
    expect(causeOf(await Author.create({ name: "Bill" }))).toBeInstanceOf(
      CollectionIdsAssignmentError,
    );
  });

  it("a bad id is a catchable rejection on the awaitable ids surface", async () => {
    // The hazard this replaces: through the setter, an id that doesn't resolve
    // surfaced as an unhandled rejection. Through `update` it is catchable.
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
    const post = await Post.create({ title: "t", body: "b" });
    let author: Author | undefined;
    expect(() => {
      author = new Author({ name: "Bill", postIds: [post.id] });
    }).not.toThrow();
    await settleTarget(() => targetOf(author!));
    expect(targetOf(author!).map((p) => p.id)).toEqual([post.id]);
  });

  it("create with an ids= key reaches the association writer", async () => {
    const post = await Post.create({ title: "t", body: "b" });
    const author = await Author.create({ name: "Bill", postIds: [post.id] });
    expect(author.isPersisted()).toBe(true);
  });

  it("constructor-form habtm ids= reaches the association writer", async () => {
    const post = await Post.create({ title: "t", body: "b" });
    let category: Category | undefined;
    expect(() => {
      category = new Category({ name: "General", postIds: [post.id] });
    }).not.toThrow();
    const habtmTarget = (): unknown[] =>
      (category as unknown as { association(n: string): { target: unknown[] } }).association(
        "posts",
      ).target;
    await settleTarget(habtmTarget);
    expect(habtmTarget().length).toBe(1);
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
});
