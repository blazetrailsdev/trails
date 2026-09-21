import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";

registerModel(Post);
registerModel(Comment);

describe("NamedScopingTest (trails)", () => {
  const { posts } = fixtures(["posts", "comments"]);

  it("destroyAll / deleteAll through association(:comments) remove the rows", async () => {
    const post = await Post.find(posts("welcome").id);
    for (const method of ["destroyAll", "reset", "deleteAll"] as const) {
      await (post.association("comments") as unknown as Record<string, () => Promise<unknown>>)[
        method
      ]();
    }
    expect(await Comment.where({ post_id: post.id }).count()).toBe(0);
  });
});
