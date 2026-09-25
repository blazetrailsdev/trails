import { describe, it, expect } from "vitest";
import { Base, registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { collectionProxyFor as association } from "./associations.js";
import { assertQueriesCount } from "./testing/query-assertions.js";
import { Author, AuthorAddress } from "./test-helpers/models/author.js";
import { Post } from "./test-helpers/models/post.js";
import { Comment } from "./test-helpers/models/comment.js";
import { ShardedBlogPost, ShardedBlogPostTag, ShardedTag } from "./test-helpers/models/sharded.js";

describe("AssociationsTest", () => {
  registerModel([ShardedBlogPost, ShardedTag, ShardedBlogPostTag]);
  const { shardedBlogs, shardedBlogPosts } = fixtures([
    "shardedBlogs",
    "shardedBlogPosts",
    "shardedTags",
    "shardedBlogPostsTags",
  ]);

  it("appending to a composite has many through ignores join rows from another blog", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one");
    const tag = await ShardedTag.create({ name: "Ruby on Rails", blog_id: blogPost.blog_id });

    const otherBlogId = shardedBlogs("sharded_blog_two").id;
    const noiseTag = await ShardedTag.create({ name: "Other Blog Tag", blog_id: otherBlogId });
    await ShardedBlogPostTag.create({
      blog_id: otherBlogId,
      blog_post_id: blogPost.id,
      tag_id: noiseTag.id,
    });

    await blogPost.tags.push(tag);

    await blogPost.reload();
    const ids = (await blogPost.tags).map((t: Base) => t.id);
    expect(ids).toContainEqual(tag.id);
    expect(ids).not.toContainEqual(noiseTag.id);
  });
});

describe("collectionProxyFor", () => {
  registerModel([Author, AuthorAddress, Post, Comment]);
  const { authors } = fixtures(["posts", "authors", "comments", "authorAddresses"]);

  it("resets the proxy scope on every read, as CollectionAssociation#reader does", async () => {
    const author = authors("mary");
    await author.posts.create({ title: "title", body: "body" });

    await assertQueriesCount(2, false, async () => {
      await association(author, "noJoinsComments").count();
    });
    await assertQueriesCount(2, false, async () => {
      await association(author, "noJoinsComments").count();
    });
  });
});
