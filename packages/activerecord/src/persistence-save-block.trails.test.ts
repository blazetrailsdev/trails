/**
 * Trails-only: pins the `save(&block)` yield point.
 *
 * Rails threads the block from `save`/`save!` through `create_or_update` into
 * `_create_record` / `_update_record`, which yield it after the write and
 * *before* the after_create/after_update callbacks
 * (persistence.rb:891-940). `CollectionAssociation#concat_records` depends on
 * that exact moment to capture `@_was_loaded` before a callback can load the
 * association (collection_association.rb:445). Rails covers the yield only
 * indirectly, through the association behaviour it enables; these tests pin the
 * plumbing itself because that is where the port had no block at all.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { resetCallbacks } from "./callbacks.js";
import { Author } from "./test-helpers/models/author.js";
import { Post } from "./test-helpers/models/post.js";

interface CollectionAssociationLike {
  insertRecord(
    record: Post,
    validate?: boolean,
    raise?: boolean,
    block?: (record: Post) => void,
  ): Promise<boolean>;
}

const postsOf = (author: Author): CollectionAssociationLike =>
  (author as unknown as { association(name: string): CollectionAssociationLike }).association(
    "posts",
  );

describe("save block threading (trails)", () => {
  const { authors } = fixtures(["authors", "posts"]);

  beforeAll(() => {
    registerModel(Author);
    registerModel(Post);
  });

  it("save yields the block after the INSERT and before after_create", async () => {
    const seen: string[] = [];
    await resetCallbacks(Post, "create", async () => {
      Post.afterCreate(() => {
        seen.push("after_create");
      });

      const post = Post.new({ title: "yield", body: "after insert" });
      const saved = await post.save({}, (record) => {
        seen.push("block");
        expect(record).toBe(post);
        expect(record.isNewRecord()).toBe(false);
        expect(record.id).not.toBeNull();
      });

      expect(saved).toBe(true);
    });

    expect(seen).toEqual(["block", "after_create"]);
  });

  it("save! yields the block after the INSERT and before after_create", async () => {
    const seen: string[] = [];
    await resetCallbacks(Post, "create", async () => {
      Post.afterCreate(() => {
        seen.push("after_create");
      });

      const post = Post.new({ title: "yield!", body: "after insert" });
      await post.saveBang({}, () => {
        seen.push("block");
      });
    });

    expect(seen).toEqual(["block", "after_create"]);
  });

  it("save yields the block after the UPDATE and before after_update", async () => {
    const seen: string[] = [];
    const post = await Post.create({ title: "updatable", body: "body" });

    await resetCallbacks(Post, "update", async () => {
      Post.afterUpdate(() => {
        seen.push("after_update");
      });

      post.title = "updated";
      await post.save({}, (record) => {
        seen.push("block");
        expect(record).toBe(post);
      });
    });

    expect(seen).toEqual(["block", "after_update"]);
  });

  it("insert_record hands its block to save, so it yields before after_create", async () => {
    const seen: string[] = [];
    const author = await Author.find(authors("david").id);

    await resetCallbacks(Post, "create", async () => {
      Post.afterCreate(() => {
        seen.push("after_create");
      });

      const record = Post.new({ title: "insert_record", body: "block" });
      const inserted = await postsOf(author).insertRecord(record, true, false, () => {
        seen.push("block");
      });

      expect(inserted).toBe(true);
    });

    expect(seen).toEqual(["block", "after_create"]);
  });

  // AC3: Rails' `@_was_loaded` guard. `concat_records` captures `loaded?` in the
  // block it hands to `insert_record` (collection_association.rb:445), which
  // `save` yields before the after_create callbacks (persistence.rb:940). A
  // callback that loads the association therefore cannot make the capture read
  // `true`, and `replace_on_target`'s `elsif @_was_loaded || !loaded?`
  // (collection_association.rb:480) skips the append the load already made.
  it("an after_create callback that loads the collection leaves no duplicate target entry", async () => {
    const author = await Author.find(authors("david").id);

    await resetCallbacks(Post, "create", async () => {
      Post.afterCreate(async () => {
        await author.posts.load();
      });

      const post = Post.new({ title: "dup", body: "check" });
      await author.posts.push(post);

      const target = await author.posts;
      expect(target.filter((p) => p.id === post.id)).toHaveLength(1);
    });
  });
});
