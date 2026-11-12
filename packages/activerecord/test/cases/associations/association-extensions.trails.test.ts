import { describe, it, expect } from "vitest";
import { fixtures } from "../../support/use-fixtures.js";
import { Post } from "../../models/post.js";
import { Comment } from "../../models/comment.js";

describe("Association#extensions", () => {
  fixtures(["posts", "comments"]);

  it("unions the class default extensions with the reflection's", async () => {
    const post = (await Post.first()) as Post;
    const defaultExtensions = Comment.defaultExtensions();

    expect(post.association("commentsWithExtend").extensions).toEqual([
      ...defaultExtensions,
      Post.namedExtension,
      Post.CommentsWithExtendAssociationExtension,
    ]);
    expect(post.association("commentsWithExtend_2").extensions).toEqual([
      ...defaultExtensions,
      Post.namedExtension,
      Post.namedExtension2,
    ]);
  });

  it("picks up the extensions a scoped association's scope extends with", async () => {
    const post = (await Post.first()) as Post;

    expect(post.association("commentsWithExtending").extensions).toContain(Post.namedExtension);
  });
});
