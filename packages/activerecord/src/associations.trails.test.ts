import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base, registerModel } from "./index.js";
import type { CollectionAssociation } from "./associations/collection-association.js";
import { Preloader } from "./associations/preloader.js";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { assertQueriesCount } from "./testing/query-assertions.js";
import { captureSql } from "./testing/sql-capture.js";
import {
  CpkOrder,
  CpkBook,
  CpkOrderAgreement,
  CpkOrderWithPrimaryKeyAssociatedBook,
} from "./test-helpers/models/cpk.js";
import { ShardedComment } from "./test-helpers/models/sharded/comment.js";
import { Author, AuthorAddress } from "./test-helpers/models/author.js";
import { Post, FirstPost } from "./test-helpers/models/post.js";
import { Comment } from "./test-helpers/models/comment.js";
import { ShardedBlogPost } from "./test-helpers/models/sharded/blog-post.js";
import { ShardedBlogPostTag } from "./test-helpers/models/sharded/blog-post-tag.js";
import { ShardedTag } from "./test-helpers/models/sharded/tag.js";

describe("AssociationsTest", () => {
  registerModel([
    ShardedBlogPost,
    ShardedComment,
    ShardedTag,
    ShardedBlogPostTag,
    CpkOrder,
    CpkBook,
    CpkOrderAgreement,
    CpkOrderWithPrimaryKeyAssociatedBook,
  ]);
  const { shardedBlogs, shardedBlogPosts } = fixtures([
    "shardedBlogs",
    "shardedBlogPosts",
    "shardedComments",
    "shardedTags",
    "shardedBlogPostsTags",
    "cpkOrders",
    "cpkBooks",
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

  it("query constraints that dont include a composite primary key raise", async () => {
    const klass = ShardedBlogPost as unknown as {
      _queryConstraintsList: string[] | null | undefined;
      _hasQueryConstraints: boolean;
    };
    const originalList = klass._queryConstraintsList;
    const originalPk = ShardedBlogPost.primaryKey;
    const originalReflections = { ...(ShardedBlogPost._reflections ?? {}) };
    try {
      ShardedBlogPost.primaryKey = ["blog_id", "id"];
      klass._queryConstraintsList = ["blog_id", "id"];
      klass._hasQueryConstraints = true;
      ShardedBlogPost.hasMany("commentsWithCompositePkOwner", {
        primaryKey: ["blog_id", "id"],
        className: "Sharded::Comment",
      });
      const blogPost = shardedBlogPosts("great_post_blog_one");
      let error: unknown;
      try {
        await (blogPost.association("commentsWithCompositePkOwner") as CollectionAssociation)
          .reader;
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ArgumentError);
      expect((error as Error).message).toContain("does not include the primary key");
    } finally {
      klass._queryConstraintsList = originalList;
      ShardedBlogPost.primaryKey = originalPk;
      ShardedBlogPost._reflections = originalReflections;
    }
  });

  it("has many loads via inline fallback resolving composite owner key from query constraints", async () => {
    const post = await ShardedBlogPost.create({ blog_id: 1, title: "Post" });
    await ShardedComment.create({ blog_id: 1, blog_post_id: post.id, body: "A" });
    await ShardedComment.create({ blog_id: 1, blog_post_id: post.id, body: "B" });
    await ShardedComment.create({ blog_id: 2, blog_post_id: post.id, body: "Other" });
    const comments = await post.comments;
    expect(comments).toHaveLength(2);
    expect(comments.map((c) => c.body).sort()).toEqual(["A", "B"]);
  });

  it("has many loads via inline fallback resolving composite owner key as id attribute", async () => {
    const order = await CpkOrder.create({ shop_id: 1 });
    const [, orderId] = order.id as [number, number];
    await CpkOrderAgreement.create({ order_id: orderId, signature: "abc" });
    await CpkOrderAgreement.create({ order_id: orderId, signature: "def" });
    const agreements = await order.orderAgreements;
    expect(agreements).toHaveLength(2);
    expect(agreements.map((a) => a.signature).sort()).toEqual(["abc", "def"]);
  });

  it("has one loads through a declared reflection with a composite foreign key", async () => {
    const order = await CpkOrder.create({ shop_id: 1 });
    await CpkBook.create({ id: [1, 90001], order, title: "Only" });
    expect((await order.book)?.title).toBe("Only");
  });

  it("has one loads through a declared reflection with a scalar foreign key on a composite primary key owner", async () => {
    const order = await CpkOrderWithPrimaryKeyAssociatedBook.create({ shop_id: 1 });
    const [, orderId] = order.id as [number, number];
    await CpkBook.create({ id: [1, 90002], order_id: orderId, title: "Only" });
    expect((await order.book)?.title).toBe("Only");
  });

  it("has many loads via inline fallback ignoring enclosing current_scope", async () => {
    const order = await CpkOrder.create({ shop_id: 1 });
    const [, orderId] = order.id as [number, number];
    await CpkOrderAgreement.create({ order_id: orderId, signature: "abc" });
    await CpkOrderAgreement.create({ order_id: orderId, signature: "def" });
    await CpkOrderAgreement.where("1=0").scoping(async () => {
      const agreements = await order.orderAgreements;
      expect(agreements).toHaveLength(2);
      expect(agreements.map((a) => a.signature).sort()).toEqual(["abc", "def"]);
    });
  });

  it("delete single composite has many through join row", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one");
    const tag = await ShardedTag.create({ name: "shared", blog_id: blogPost.blog_id });
    await ShardedBlogPostTag.create({
      blog_id: blogPost.blog_id,
      blog_post_id: blogPost.id,
      tag_id: tag.id,
    });

    const otherBlogId = shardedBlogs("sharded_blog_two").id;
    await ShardedBlogPostTag.create({
      blog_id: otherBlogId,
      blog_post_id: blogPost.id,
      tag_id: tag.id,
    });

    await (blogPost.association("tags") as CollectionAssociation).reader.delete(tag);

    expect(
      await ShardedBlogPostTag.where({
        blog_id: blogPost.blog_id,
        blog_post_id: blogPost.id,
        tag_id: tag.id,
      }),
    ).toHaveLength(0);
    expect(
      await ShardedBlogPostTag.where({
        blog_id: otherBlogId,
        blog_post_id: blogPost.id,
        tag_id: tag.id,
      }),
    ).toHaveLength(1);
    expect(await ShardedTag.where({ id: tag.id })).not.toHaveLength(0);
  });
});

describe("AssociationProxyTest (trails)", () => {
  registerModel([Author, Post, FirstPost]);
  const { authors } = fixtures(["authorAddresses", "authors", "posts"]);

  it("last! works on loaded associations", async () => {
    const david = authors("david");
    const expected = await david.firstPosts.last();
    await david.firstPosts.reload();
    const sqls = await captureSql(async () => {
      const last = await david.firstPosts.lastBang();
      expect(last.id).toBe(expected!.id);
    });
    expect(sqls).toHaveLength(0);
    expect(david.firstPosts.loaded).toBe(true);
  });

  it("take! works on loaded associations", async () => {
    const david = authors("david");
    const expected = await david.firstPosts.take();
    await david.firstPosts.reload();
    const sqls = await captureSql(async () => {
      const taken = await david.firstPosts.takeBang();
      expect(taken.id).toBe(expected!.id);
    });
    expect(sqls).toHaveLength(0);
    expect(david.firstPosts.loaded).toBe(true);
  });

  it("load preserves in-memory instances added via push", async () => {
    const david = authors("david");
    const post = await Post.create({ title: "original", body: "b" });
    await david.posts.push(post);
    post.title = "mutated";
    const loaded: Post[] = await (await david.posts.load()).records();
    const found = loaded.find((r) => r.readAttribute("id") === post.id);
    expect(found).toBe(post);
    expect(found!.title).toBe("mutated");
  });
});

describe("PreloaderTest (trails)", () => {
  registerModel([Author, Post, Comment]);
  const { posts, authors } = fixtures(["posts", "comments", "authors"]);

  it("isEmpty materializes an empty relation and reports true", async () => {
    const relation = (Post as typeof Base).where({ id: -1 });
    const preloader = new Preloader({ records: relation, associations: "comments" });
    expect(await preloader.isEmpty()).toBe(true);
    const sqls = await captureSql(async () => {
      await preloader.call();
    });
    expect(sqls).toHaveLength(0);
  });

  it("isEmpty reports false for a non-empty relation", async () => {
    const relation = (Post as typeof Base).where({ id: posts("welcome").id });
    const preloader = new Preloader({ records: relation, associations: "comments" });
    expect(await preloader.isEmpty()).toBe(false);
  });

  it("preload marks belongs_to association loaded on owner", async () => {
    const welcome = posts("welcome");
    const loaded = await Post.where({ id: welcome.id }).includes(":author");
    expect(loaded).toHaveLength(1);
    const assoc = loaded[0].association("author");
    expect(assoc.isLoaded()).toBe(true);
    expect((assoc.target as Base | null)?.id).toBe(authors("david").id);
  });

  it("preload sets has_many association target on owner", async () => {
    const david = authors("david");
    const owners = await Author.where({ id: david.id }).includes(":posts");
    const assoc = owners[0].association("posts");
    expect(assoc.isLoaded()).toBe(true);
    const ids = (assoc.target as Base[]).map((r) => r.id);
    expect(ids).toContain(posts("welcome").id);
  });
});

describe("association(name).reader", () => {
  registerModel([Author, AuthorAddress, Post, Comment]);
  const { authors } = fixtures(["posts", "authors", "comments", "authorAddresses"]);

  it("resets the proxy scope on every read, as CollectionAssociation#reader does", async () => {
    const author = authors("mary");
    await author.posts.create({ title: "title", body: "body" });

    await assertQueriesCount(2, false, async () => {
      await author.noJoinsComments.count();
    });
    await assertQueriesCount(2, false, async () => {
      await author.noJoinsComments.count();
    });
  });
});
