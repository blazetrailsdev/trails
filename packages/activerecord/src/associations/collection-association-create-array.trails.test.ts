import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { fixtures } from "../test-fixtures.js";

interface CreatingAssociation {
  create(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<Comment | Comment[] | null>;
}

const commentsOf = (post: Post): CreatingAssociation =>
  (post as unknown as { association(name: string): CreatingAssociation }).association("comments");

describe("CollectionAssociation#_create_record Array arm", () => {
  const { posts } = fixtures(["posts", "comments"]);

  beforeAll(() => {
    registerModel(Post);
    registerModel(Comment);
  });

  it("returns an array of records, one per attribute hash", async () => {
    const post = await Post.find(posts("welcome").id);
    const records = (await commentsOf(post).create([
      { body: "first" },
      { body: "second" },
    ])) as Comment[];

    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBe(2);
    expect(records.map((record) => record.body)).toEqual(["first", "second"]);
    for (const record of records) expect(record.isPersisted()).toBe(true);
  });

  it("moves the in-memory counter cache by the element count exactly once", async () => {
    const post = await Post.find(posts("welcome").id);
    const before = post.comments_count;

    await commentsOf(post).create([{ body: "one" }, { body: "two" }, { body: "three" }]);

    expect(post.comments_count).toBe(before + 3);
  });
});
