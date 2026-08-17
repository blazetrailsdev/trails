/**
 * Trails-only surface: `Association#extensions`
 * (activerecord/lib/active_record/associations/association.rb:169-177) has no
 * live trails caller yet — `CollectionProxy#initialize` reads the macro
 * record's `extend:` option directly — so nothing else exercises the getter.
 * Cover it here, because the reflection an `Association` is constructed with is
 * the lightweight macro record, which carries neither `extensions` nor
 * `scope_for`: the getter has to resolve the rich reflection the way
 * `Association#klass` does, and a body reading them off the macro record throws.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";

describe("Association#extensions", () => {
  fixtures(["posts", "comments"]);

  it("unions the class default extensions with the reflection's", async () => {
    const post = (await Post.first()) as Post;
    const defaultExtensions = Comment.defaultExtensions();

    expect(post.association("commentsWithExtend").extensions).toEqual([
      ...defaultExtensions,
      Post.namedExtension,
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
