import { describe, it, expect } from "vitest";
import { registerModel } from "./index.js";

import { Author } from "./test-helpers/models/author.js";
import { Post } from "./test-helpers/models/post.js";
import { Comment } from "./test-helpers/models/comment.js";
import { Tag } from "./test-helpers/models/tag.js";
import { Tagging } from "./test-helpers/models/tagging.js";

import { fixtures } from "./test-helpers/use-fixtures.js";
import "./associations/collection-proxy.js";
import "./association-relation.js";

registerModel(Author);
registerModel(Post);
registerModel(Comment);
registerModel(Tag);
registerModel(Tagging);

describe("JSON serialization with an include: is sync or awaited", () => {
  fixtures(["authors", "authorAddresses", "posts", "comments", "tags", "taggings"]);

  it("raises when including an unloaded has_many (sync serialization cannot query)", async () => {
    const post = await Post.find(1);
    expect(() => post.asJson({ include: "comments" }).comments).toThrow(/not loaded/);
    expect(() => JSON.stringify(post.asJson({ include: "comments" }))).toThrow(/not loaded/);
    expect(() => post.asJson({ include: "comments" }).title).toThrow(/not loaded/);
  });

  it("without an include the hash is plain (no awaitable contract)", async () => {
    const post = await Post.find(1);
    expect((post.asJson() as { then?: unknown }).then).toBeUndefined();
    expect((post.serializableHash() as { then?: unknown }).then).toBeUndefined();
  });

  it("awaiting loads an unloaded belongs_to and serializes the row", async () => {
    const comment = await Comment.find(1);
    const json = await comment.asJson({ only: ["body"], include: "post" });
    expect((json.post as Record<string, unknown>).title).toBe("Welcome to the weblog");

    Comment.includeRootInJson = true;
    try {
      const rooted = await comment.asJson({ only: ["body"], include: "post" });
      const rootKey = Object.keys(rooted)[0];
      expect(Object.keys(rooted).length).toBe(1);
      expect((rooted[rootKey] as { post: { title: string } }).post.title).toBe(
        "Welcome to the weblog",
      );
    } finally {
      Comment.includeRootInJson = false;
    }
  });

  it("awaiting loads unloaded has_many and nested includes", async () => {
    const post = await Post.find(1);
    const json = await post.asJson({
      include: { comments: { only: ["id", "body"], include: { children: { only: ["body"] } } } },
    });
    const comments = json.comments as Array<Record<string, unknown>>;
    const greetings = comments.find((c) => Number(c.id) === 1)!;
    expect(greetings.body).toBe("Thank you for the welcome");
    const children = greetings.children as Array<Record<string, unknown>>;
    expect(children[0].body).toBe("Thank you again for the welcome");
    expect(typeof JSON.stringify(json)).toBe("string");
  });
});
