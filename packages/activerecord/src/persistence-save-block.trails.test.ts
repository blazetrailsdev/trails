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
