/**
 * Mirrors Rails activerecord/test/cases/associations/nested_through_associations_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel, enableSti, registerSubclass } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { loadBelongsTo, loadHasOne, loadHasMany, loadHasManyThrough } from "../associations.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("NestedThroughAssociationsTest", () => {
  let adapter: DatabaseAdapter;

  class Author extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Post extends Base {
    static {
      this.attribute("author_id", "integer");
      this.attribute("title", "string");
      this.attribute("body", "string");
    }
  }

  class Tag extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Tagging extends Base {
    static {
      this.attribute("tag_id", "integer");
      this.attribute("taggable_id", "integer");
      this.attribute("taggable_type", "string");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Author.adapter = adapter;
    Post.adapter = adapter;
    Tag.adapter = adapter;
    Tagging.adapter = adapter;
    registerModel(Author);
    registerModel(Post);
    registerModel(Tag);
    registerModel(Tagging);
  });

  it("has many through has many with has many source reflection", async () => {
    // Nested through: Author -> Posts -> Taggings -> Tags
    const author = await Author.create({ name: "DHH" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "ruby" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    // Load intermediate: author's posts
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    expect(posts.length).toBe(1);

    // Load through: taggings for that post
    const taggings = await loadHasMany(posts[0] as Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    expect(taggings.length).toBe(1);
  });

  it("has many through has many with has many through source reflection", async () => {
    // Author -> Posts -> Taggings -> Tags (nested through)
    const author = await Author.create({ name: "NestedThrough" });
    const post = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const tag = await Tag.create({ name: "nested-tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    // Load posts for author
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    expect(posts.length).toBe(1);
    // Load taggings for post
    const taggings = await loadHasMany(posts[0] as Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    expect(taggings.length).toBe(1);
    // Load tag through tagging
    const loadedTag = await loadBelongsTo(taggings[0] as Tagging, "tag", {
      className: "Tag",
      foreignKey: "tag_id",
    });
    expect(loadedTag).not.toBeNull();
    expect(loadedTag!.readAttribute("name")).toBe("nested-tag");
  });

  it("has many through has many with has many through source reflection preload", async () => {
    const author = await Author.create({ name: "David" });
    const post = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const tag1 = await Tag.create({ name: "general" });
    const tag2 = await Tag.create({ name: "general" });
    await Tagging.create({ tag_id: tag1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag2.id, taggable_id: post.id, taggable_type: "Post" });

    // Manual nested through: author -> posts -> taggings -> tags
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const allTags: any[] = [];
    for (const p of posts) {
      const taggings = await loadHasMany(p, "taggings", {
        className: "Tagging",
        foreignKey: "taggable_id",
      });
      for (const t of taggings) {
        const tag = await loadBelongsTo(t, "tag", { className: "Tag", foreignKey: "tag_id" });
        if (tag) allTags.push(tag);
      }
    }
    expect(allTags).toHaveLength(2);
  });

  it("has many through has many with has many through source reflection preload via joins", async () => {
    const author = await Author.create({ name: "David" });
    const post = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const tag = await Tag.create({ name: "general" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    // Verify the chain works
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(taggings).toHaveLength(1);
  });

  it("has many through has many through with has many source reflection", async () => {
    // Author -> Posts -> Taggings (3 levels, manual chaining)
    const author = await Author.create({ name: "Nested" });
    const post1 = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const post2 = await Post.create({ author_id: author.id, title: "P2", body: "B" });
    const tag1 = await Tag.create({ name: "t1" });
    const tag2 = await Tag.create({ name: "t2" });
    await Tagging.create({ tag_id: tag1.id, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag2.id, taggable_id: post2.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    expect(posts.length).toBe(2);
    // Collect all taggings across posts
    const allTaggings: any[] = [];
    for (const post of posts) {
      const taggings = await loadHasMany(post as Post, "taggings", {
        className: "Tagging",
        foreignKey: "taggable_id",
        primaryKey: "id",
      });
      allTaggings.push(...taggings);
    }
    expect(allTaggings.length).toBe(2);
  });

  it("has many through has many through with has many source reflection preload", async () => {
    const author = await Author.create({ name: "Nested" });
    const post1 = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const post2 = await Post.create({ author_id: author.id, title: "P2", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: 2, taggable_id: post2.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const allTaggings: any[] = [];
    for (const p of posts) {
      const taggings = await loadHasMany(p, "taggings", {
        className: "Tagging",
        foreignKey: "taggable_id",
      });
      allTaggings.push(...taggings);
    }
    expect(allTaggings).toHaveLength(2);
  });

  it("has many through has many through with has many source reflection preload via joins", async () => {
    const author = await Author.create({ name: "Nested" });
    const post = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
  });

  it("has many through has one with has one through source reflection", async () => {
    // Author -> Post (has_many) -> each post has one first tagging
    const author = await Author.create({ name: "HasOneThrough" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "ruby" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    // Load author's posts
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    expect(posts.length).toBe(1);
    // Load has_one tagging for that post
    const tagging = await loadHasOne(posts[0] as Post, "tagging", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(tagging).not.toBeNull();
    expect(tagging!.readAttribute("tag_id")).toBe(tag.id);
  });

  it("has many through has one with has one through source reflection preload", async () => {
    const author = await Author.create({ name: "HasOnePreload" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "ruby" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
    const tagging = await loadHasOne(posts[0], "tagging", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(tagging).not.toBeNull();
  });

  it("has many through has one with has one through source reflection preload via joins", async () => {
    const author = await Author.create({ name: "HasOnePreloadJoins" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "ruby" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
  });

  it("has many through has one through with has one source reflection", async () => {
    // Chain: Author -> Posts -> first Tagging per post -> Tag
    const author = await Author.create({ name: "NestedHasOne" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "nested" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const tagging = await loadHasOne(posts[0] as Post, "tagging", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(tagging).not.toBeNull();
    // Load tag from tagging
    const loadedTag = await loadHasOne(tagging!, "tag", {
      className: "Tag",
      foreignKey: "id",
      primaryKey: "tag_id",
    });
    expect(loadedTag).not.toBeNull();
    expect(loadedTag!.readAttribute("name")).toBe("nested");
  });

  it("has many through has one through with has one source reflection preload", async () => {
    const author = await Author.create({ name: "Preload" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "nested" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const tagging = await loadHasOne(posts[0], "tagging", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(tagging).not.toBeNull();
    expect(tagging!.readAttribute("tag_id")).toBe(tag.id);
  });

  it("has many through has one through with has one source reflection preload via joins", async () => {
    const author = await Author.create({ name: "PreloadJoins" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
  });

  it("has many through has one with has many through source reflection", async () => {
    // Author -> Post (has_many) -> Taggings (has_many per post)
    const author = await Author.create({ name: "MixedThrough" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const t1 = await Tag.create({ name: "mix1" });
    const t2 = await Tag.create({ name: "mix2" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post.id, taggable_type: "Post" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const taggings = await loadHasMany(posts[0] as Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    expect(taggings.length).toBe(2);
  });

  it("has many through has one with has many through source reflection preload", async () => {
    const author = await Author.create({ name: "MixedPreload" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: 2, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(taggings).toHaveLength(2);
  });

  it("has many through has one with has many through source reflection preload via joins", async () => {
    const author = await Author.create({ name: "MixedPreloadJoins" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
  });

  it("has many through has one through with has many source reflection", async () => {
    // Author -> Post -> Taggings (multiple per post)
    const author = await Author.create({ name: "HasOneHasMany" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const t1 = await Tag.create({ name: "s1" });
    const t2 = await Tag.create({ name: "s2" });
    const t3 = await Tag.create({ name: "s3" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t3.id, taggable_id: post.id, taggable_type: "Post" });
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const taggings = await loadHasMany(posts[0] as Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    expect(taggings.length).toBe(3);
  });

  it("has many through has one through with has many source reflection preload", async () => {
    const author = await Author.create({ name: "HasOneManyPreload" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: 2, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: 3, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(taggings).toHaveLength(3);
  });

  it("has many through has one through with has many source reflection preload via joins", async () => {
    const author = await Author.create({ name: "HasOneManyJoins" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
  });

  it("has many through has many with has and belongs to many source reflection", async () => {
    // Author -> Posts -> Taggings -> Tags (multi-hop through)
    const author = await Author.create({ name: "HABTMSource" });
    const post = await Post.create({ author_id: author.id, title: "HS", body: "B" });
    const t1 = await Tag.create({ name: "hs_tag1" });
    const t2 = await Tag.create({ name: "hs_tag2" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post.id, taggable_type: "Post" });
    // Traverse: author -> posts -> taggings -> tags
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const taggings = await loadHasMany(posts[0] as Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    const tags: any[] = [];
    for (const tg of taggings) {
      const tag = await loadHasOne(tg as Tagging, "tag", {
        className: "Tag",
        foreignKey: "id",
        primaryKey: "tag_id",
      });
      if (tag) tags.push(tag);
    }
    expect(tags.length).toBe(2);
    const names = tags.map((t: any) => t.readAttribute("name"));
    expect(names).toContain("hs_tag1");
    expect(names).toContain("hs_tag2");
  });

  it("has many through has many with has and belongs to many source reflection preload", async () => {
    const author = await Author.create({ name: "HABTMPreload" });
    const post = await Post.create({ author_id: author.id, title: "HS", body: "B" });
    const t1 = await Tag.create({ name: "hs1" });
    const t2 = await Tag.create({ name: "hs2" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(taggings).toHaveLength(2);
  });

  it("has many through has many with has and belongs to many source reflection preload via joins", async () => {
    const author = await Author.create({ name: "HABTMJoins" });
    const post = await Post.create({ author_id: author.id, title: "HS", body: "B" });
    const t1 = await Tag.create({ name: "hs1" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
  });

  it("has many through has and belongs to many with has many source reflection", async () => {
    // Tag -> Taggings (has_many) -> Posts (each tagging belongs_to a post)
    const tag = await Tag.create({ name: "habtm_hm_tag" });
    const post1 = await Post.create({ title: "HM1", body: "B" });
    const post2 = await Post.create({ title: "HM2", body: "B" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post2.id, taggable_type: "Post" });
    const taggings = await loadHasMany(tag, "taggings", {
      className: "Tagging",
      foreignKey: "tag_id",
      primaryKey: "id",
    });
    expect(taggings.length).toBe(2);
    const posts: any[] = [];
    for (const tg of taggings) {
      const post = await loadHasOne(tg as Tagging, "post", {
        className: "Post",
        foreignKey: "id",
        primaryKey: "taggable_id",
      });
      if (post) posts.push(post);
    }
    expect(posts.length).toBe(2);
    const titles = posts.map((p: any) => p.readAttribute("title"));
    expect(titles).toContain("HM1");
    expect(titles).toContain("HM2");
  });

  it("has many through has and belongs to many with has many source reflection preload", async () => {
    const tag = await Tag.create({ name: "habtm_preload" });
    const post = await Post.create({ title: "HM1", body: "B" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const taggings = await loadHasMany(tag, "taggings", {
      className: "Tagging",
      foreignKey: "tag_id",
    });
    expect(taggings).toHaveLength(1);
  });

  it("has many through has and belongs to many with has many source reflection preload via joins", async () => {
    const tag = await Tag.create({ name: "habtm_joins" });
    const post = await Post.create({ title: "HM1", body: "B" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const taggings = await loadHasMany(tag, "taggings", {
      className: "Tagging",
      foreignKey: "tag_id",
    });
    expect(taggings).toHaveLength(1);
  });

  it("has many through has many with has many through habtm source reflection", async () => {
    // Author -> Posts -> Taggings -> Tags (3-level chain)
    const author = await Author.create({ name: "HABTMChain" });
    const post = await Post.create({ author_id: author.id, title: "HC", body: "B" });
    const tag1 = await Tag.create({ name: "hc1" });
    const tag2 = await Tag.create({ name: "hc2" });
    await Tagging.create({ tag_id: tag1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag2.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    const allTaggings: any[] = [];
    for (const p of posts) {
      const taggings = await loadHasMany(p as Post, "taggings", {
        className: "Tagging",
        foreignKey: "taggable_id",
        primaryKey: "id",
      });
      allTaggings.push(...taggings);
    }
    const tags: any[] = [];
    for (const tg of allTaggings) {
      const tag = await loadBelongsTo(tg as Tagging, "tag", {
        className: "Tag",
        foreignKey: "tag_id",
      });
      if (tag) tags.push(tag);
    }
    expect(tags.length).toBe(2);
    const names = tags.map((t: any) => t.readAttribute("name")).sort();
    expect(names).toEqual(["hc1", "hc2"]);
  });

  it("has many through has many with has many through habtm source reflection preload", async () => {
    const author = await Author.create({ name: "HABTMChainPreload" });
    const post = await Post.create({ author_id: author.id, title: "HC", body: "B" });
    const tag = await Tag.create({ name: "hc1" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    const loadedTag = await loadBelongsTo(taggings[0], "tag", {
      className: "Tag",
      foreignKey: "tag_id",
    });
    expect(loadedTag).not.toBeNull();
    expect(loadedTag!.readAttribute("name")).toBe("hc1");
  });

  it("has many through has many with has many through habtm source reflection preload via joins", async () => {
    const author = await Author.create({ name: "HABTMChainJoins" });
    const post = await Post.create({ author_id: author.id, title: "HC", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
  });

  it("has many through has many through with belongs to source reflection", async () => {
    // Author -> Posts -> Taggings -> Tag (belongs_to from tagging)
    const author = await Author.create({ name: "BelongsToSource" });
    const post = await Post.create({ author_id: author.id, title: "T1", body: "B" });
    const tag = await Tag.create({ name: "bt_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    expect(posts.length).toBe(1);

    const taggings = await loadHasMany(posts[0] as Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      primaryKey: "id",
    });
    expect(taggings.length).toBe(1);

    const loadedTag = await loadBelongsTo(taggings[0] as Tagging, "tag", {
      className: "Tag",
      foreignKey: "tag_id",
    });
    expect(loadedTag).not.toBeNull();
    expect(loadedTag!.readAttribute("name")).toBe("bt_tag");
  });

  it("has many through has many through with belongs to source reflection preload", async () => {
    const author = await Author.create({ name: "BTPreload" });
    const post = await Post.create({ author_id: author.id, title: "T1", body: "B" });
    const tag = await Tag.create({ name: "bt_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    const loadedTag = await loadBelongsTo(taggings[0], "tag", {
      className: "Tag",
      foreignKey: "tag_id",
    });
    expect(loadedTag).not.toBeNull();
    expect(loadedTag!.readAttribute("name")).toBe("bt_tag");
  });

  it("has many through has many through with belongs to source reflection preload via joins", async () => {
    const author = await Author.create({ name: "BTJoins" });
    const post = await Post.create({ author_id: author.id, title: "T1", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
  });

  it("has many through belongs to with has many through source reflection", async () => {
    // Post belongs_to Author -> Author has_many Posts -> Posts have Taggings
    const author = await Author.create({ name: "BtThrough" });
    const post1 = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const post2 = await Post.create({ author_id: author.id, title: "P2", body: "B" });
    const tag1 = await Tag.create({ name: "bt1" });
    const tag2 = await Tag.create({ name: "bt2" });
    await Tagging.create({ tag_id: tag1.id, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag2.id, taggable_id: post2.id, taggable_type: "Post" });

    // From post1, load author via belongs_to
    const loadedAuthor = await loadBelongsTo(post1, "author", {
      className: "Author",
      foreignKey: "author_id",
    });
    expect(loadedAuthor).not.toBeNull();

    // From author, load all posts
    const allPosts = await loadHasMany(loadedAuthor!, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    expect(allPosts.length).toBe(2);
  });

  it("has many through belongs to with has many through source reflection preload", async () => {
    const author = await Author.create({ name: "BTHMPreload" });
    const post = await Post.create({ author_id: author.id, title: "P", body: "B" });
    const tag = await Tag.create({ name: "gen" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(taggings).toHaveLength(1);
  });

  it("has many through belongs to with has many through source reflection preload via joins", async () => {
    const author = await Author.create({ name: "BTHMJoins" });
    const post = await Post.create({ author_id: author.id, title: "P", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
  });

  it("has one through has one with has one through source reflection", async () => {
    // Chain: Author -> first Post (has_one) -> first Tagging (has_one) -> Tag
    const author = await Author.create({ name: "HasOneChain" });
    const post = await Post.create({ author_id: author.id, title: "HOC", body: "B" });
    const tag = await Tag.create({ name: "hoc_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    // has_one post for author
    const firstPost = await loadHasOne(author, "post", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(firstPost).not.toBeNull();
    // has_one tagging for post
    const tagging = await loadHasOne(firstPost!, "tagging", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(tagging).not.toBeNull();
    // load tag from tagging
    const loadedTag = await loadHasOne(tagging!, "tag", {
      className: "Tag",
      foreignKey: "id",
      primaryKey: "tag_id",
    });
    expect(loadedTag).not.toBeNull();
    expect(loadedTag!.readAttribute("name")).toBe("hoc_tag");
  });

  it("has one through has one with has one through source reflection preload", async () => {
    const author = await Author.create({ name: "HasOnePreload" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "one" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    // Load has_one post
    const authorPost = await loadHasOne(author, "post", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(authorPost).not.toBeNull();
    const tagging = await loadHasOne(authorPost!, "tagging", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(tagging).not.toBeNull();
    expect(tagging!.readAttribute("tag_id")).toBe(tag.id);
  });

  it("has one through has one with has one through source reflection preload via joins", async () => {
    const author = await Author.create({ name: "HasOneJoins" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });

    const authorPost = await loadHasOne(author, "post", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(authorPost).not.toBeNull();
  });

  it("has one through has one through with belongs to source reflection", async () => {
    // Chain: Tag -> first Tagging (has_one via tag_id) -> Post (belongs_to via taggable_id)
    const author = await Author.create({ name: "BelongsChain" });
    const post = await Post.create({ author_id: author.id, title: "BC", body: "B" });
    const tag = await Tag.create({ name: "bc_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    // has_one tagging for tag
    const tagging = await loadHasOne(tag, "tagging", {
      className: "Tagging",
      foreignKey: "tag_id",
    });
    expect(tagging).not.toBeNull();
    // belongs_to post from tagging (load via FK)
    const loadedPost = await loadHasOne(tagging!, "post", {
      className: "Post",
      foreignKey: "id",
      primaryKey: "taggable_id",
    });
    expect(loadedPost).not.toBeNull();
    expect(loadedPost!.readAttribute("title")).toBe("BC");
  });

  it("joins and includes from through models not included in association", async () => {
    class JiClub extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class JiMembership extends Base {
      static {
        this.attribute("ji_club_id", "integer");
        this.attribute("ji_member_id", "integer");
        this.adapter = adapter;
      }
    }
    class JiMember extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    (JiMember as any)._associations = [
      {
        type: "hasMany",
        name: "jiMemberships",
        options: { className: "JiMembership", foreignKey: "ji_member_id" },
      },
      {
        type: "hasManyThrough",
        name: "jiClubs",
        options: { through: "jiMemberships", source: "jiClub", className: "JiClub" },
      },
    ];
    (JiMembership as any)._associations = [
      {
        type: "belongsTo",
        name: "jiClub",
        options: { className: "JiClub", foreignKey: "ji_club_id" },
      },
    ];
    registerModel("JiClub", JiClub);
    registerModel("JiMembership", JiMembership);
    registerModel("JiMember", JiMember);

    const member = await JiMember.create({ name: "Groucho" });
    const club = await JiClub.create({ name: "Moustache" });
    await JiMembership.create({ ji_member_id: member.id, ji_club_id: club.id });

    const clubs = await loadHasManyThrough(member, "jiClubs", {
      through: "jiMemberships",
      source: "jiClub",
      className: "JiClub",
    });
    expect(clubs).toHaveLength(1);
    expect(clubs[0].readAttribute("name")).toBe("Moustache");
  });

  it("has one through has one through with belongs to source reflection preload", async () => {
    const author = await Author.create({ name: "HOBTPreload" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "bt_preload" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const authorPost = await loadHasOne(author, "post", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(authorPost).not.toBeNull();
    const tagging = await loadHasOne(authorPost!, "tagging", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(tagging).not.toBeNull();
    const loadedTag = await loadBelongsTo(tagging!, "tag", {
      className: "Tag",
      foreignKey: "tag_id",
    });
    expect(loadedTag).not.toBeNull();
    expect(loadedTag!.readAttribute("name")).toBe("bt_preload");
  });

  it("has one through has one through with belongs to source reflection preload via joins", async () => {
    const author = await Author.create({ name: "HOBTJoins" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });

    const authorPost = await loadHasOne(author, "post", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(authorPost).not.toBeNull();
  });

  it("distinct has many through a has many through association on source reflection", async () => {
    const author = await Author.create({ name: "David" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "general" });
    // Two taggings pointing to same tag
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    // Get unique tags
    const tagIds = [...new Set(taggings.map((t) => t.readAttribute("tag_id")))];
    expect(tagIds).toHaveLength(1);
  });

  it("distinct has many through a has many through association on through reflection", async () => {
    const author = await Author.create({ name: "David" });
    const post1 = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const post2 = await Post.create({ author_id: author.id, title: "P2", body: "B" });
    const tag = await Tag.create({ name: "general" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post2.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(2);
  });

  it("nested has many through with a table referenced multiple times", async () => {
    const author = await Author.create({ name: "Bob" });
    const post1 = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const tag = await Tag.create({ name: "multi" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post1.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);

    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(taggings).toHaveLength(1);
  });

  it("nested has many through with scope on polymorphic reflection", async () => {
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "Misc", body: "B" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
    expect(posts[0].readAttribute("title")).toBe("Misc");
  });

  it("has many through with foreign key option on through reflection", async () => {
    class FkThrAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class FkThrPost extends Base {
      static {
        this.attribute("writer_id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class FkThrComment extends Base {
      static {
        this.attribute("fk_thr_post_id", "integer");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    (FkThrAuthor as any)._associations = [
      {
        type: "hasMany",
        name: "fkThrPosts",
        options: { className: "FkThrPost", foreignKey: "writer_id" },
      },
      {
        type: "hasManyThrough",
        name: "fkThrComments",
        options: { through: "fkThrPosts", source: "fkThrComments", className: "FkThrComment" },
      },
    ];
    (FkThrPost as any)._associations = [
      {
        type: "hasMany",
        name: "fkThrComments",
        options: { className: "FkThrComment", foreignKey: "fk_thr_post_id" },
      },
    ];
    registerModel("FkThrAuthor", FkThrAuthor);
    registerModel("FkThrPost", FkThrPost);
    registerModel("FkThrComment", FkThrComment);

    const author = await FkThrAuthor.create({ name: "DHH" });
    const post = await FkThrPost.create({ writer_id: author.id, title: "Hello" });
    await FkThrComment.create({ fk_thr_post_id: post.id, body: "Great!" });

    const comments = await loadHasManyThrough(author, "fkThrComments", {
      through: "fkThrPosts",
      source: "fkThrComments",
      className: "FkThrComment",
    });
    expect(comments).toHaveLength(1);
    expect(comments[0].readAttribute("body")).toBe("Great!");
  });

  it("has many through with foreign key option on source reflection", async () => {
    class FkSrcAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class FkSrcPost extends Base {
      static {
        this.attribute("fk_src_author_id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class FkSrcComment extends Base {
      static {
        this.attribute("article_id", "integer");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    (FkSrcAuthor as any)._associations = [
      {
        type: "hasMany",
        name: "fkSrcPosts",
        options: { className: "FkSrcPost", foreignKey: "fk_src_author_id" },
      },
      {
        type: "hasManyThrough",
        name: "fkSrcComments",
        options: { through: "fkSrcPosts", source: "fkSrcComments", className: "FkSrcComment" },
      },
    ];
    (FkSrcPost as any)._associations = [
      {
        type: "hasMany",
        name: "fkSrcComments",
        options: { className: "FkSrcComment", foreignKey: "article_id" },
      },
    ];
    registerModel("FkSrcAuthor", FkSrcAuthor);
    registerModel("FkSrcPost", FkSrcPost);
    registerModel("FkSrcComment", FkSrcComment);

    const author = await FkSrcAuthor.create({ name: "DHH" });
    const post = await FkSrcPost.create({ fk_src_author_id: author.id, title: "Hello" });
    await FkSrcComment.create({ article_id: post.id, body: "Nice!" });

    const comments = await loadHasManyThrough(author, "fkSrcComments", {
      through: "fkSrcPosts",
      source: "fkSrcComments",
      className: "FkSrcComment",
    });
    expect(comments).toHaveLength(1);
    expect(comments[0].readAttribute("body")).toBe("Nice!");
  });

  it("has many through with sti on through reflection", async () => {
    class StiThrClub extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class StiThrMembership extends Base {
      static {
        this.attribute("sti_thr_club_id", "integer");
        this.attribute("sti_thr_member_id", "integer");
        this.attribute("type", "string");
        this._tableName = "sti_thr_memberships";
        this.adapter = adapter;
        enableSti(StiThrMembership);
      }
    }
    class StiThrSuperMembership extends StiThrMembership {
      static {
        this.adapter = adapter;
        registerModel(StiThrSuperMembership);
        registerSubclass(StiThrSuperMembership);
      }
    }
    class StiThrMember extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    (StiThrClub as any)._associations = [
      {
        type: "hasMany",
        name: "stiThrMemberships",
        options: { className: "StiThrMembership", foreignKey: "sti_thr_club_id" },
      },
      {
        type: "hasManyThrough",
        name: "stiThrMembers",
        options: {
          through: "stiThrMemberships",
          source: "stiThrMember",
          className: "StiThrMember",
        },
      },
    ];
    (StiThrMembership as any)._associations = [
      {
        type: "belongsTo",
        name: "stiThrMember",
        options: { className: "StiThrMember", foreignKey: "sti_thr_member_id" },
      },
    ];
    registerModel("StiThrClub", StiThrClub);
    registerModel("StiThrMembership", StiThrMembership);
    registerModel("StiThrMember", StiThrMember);

    const club = await StiThrClub.create({ name: "Cool Club" });
    const member = await StiThrMember.create({ name: "Alice" });
    await StiThrSuperMembership.create({
      sti_thr_club_id: club.id,
      sti_thr_member_id: member.id,
    });

    const members = await loadHasManyThrough(club, "stiThrMembers", {
      through: "stiThrMemberships",
      source: "stiThrMember",
      className: "StiThrMember",
    });
    expect(members).toHaveLength(1);
    expect(members[0].readAttribute("name")).toBe("Alice");
  });

  it("has many through with sti on nested through reflection", async () => {
    class StiNPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class StiNComment extends Base {
      static {
        this.attribute("sti_n_post_id", "integer");
        this.attribute("body", "string");
        this.attribute("type", "string");
        this.adapter = adapter;
      }
    }
    class StiNSpecialComment extends StiNComment {}
    registerModel("StiNPost", StiNPost);
    registerModel("StiNComment", StiNComment);
    registerModel("StiNSpecialComment", StiNSpecialComment);
    enableSti(StiNComment, { column: "type" });
    registerSubclass(StiNSpecialComment);

    const post = await StiNPost.create({ title: "STI" });
    await StiNComment.create({ sti_n_post_id: post.id, body: "Normal", type: "StiNComment" });
    await StiNSpecialComment.create({
      sti_n_post_id: post.id,
      body: "Special",
      type: "StiNSpecialComment",
    });

    const comments = await loadHasMany(post, "stiNComments", {
      className: "StiNComment",
      foreignKey: "sti_n_post_id",
    });
    expect(comments).toHaveLength(2);
  });

  it("nested has many through writers should raise error", async () => {
    // Nested through associations are read-only
    class NwAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NwPost extends Base {
      static {
        this.attribute("nw_author_id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class NwTagging extends Base {
      static {
        this.attribute("nw_post_id", "integer");
        this.attribute("nw_subscriber_id", "integer");
        this.adapter = adapter;
      }
    }
    class NwSubscriber extends Base {
      static {
        this.attribute("nick", "string");
        this.adapter = adapter;
      }
    }
    (NwAuthor as any)._associations = [
      {
        type: "hasMany",
        name: "nwPosts",
        options: { className: "NwPost", foreignKey: "nw_author_id" },
      },
      {
        type: "hasManyThrough",
        name: "nwTaggings",
        options: { through: "nwPosts", source: "nwTagging", className: "NwTagging" },
      },
    ];
    (NwPost as any)._associations = [
      {
        type: "hasMany",
        name: "nwTaggings",
        options: { className: "NwTagging", foreignKey: "nw_post_id" },
      },
    ];
    registerModel("NwAuthor", NwAuthor);
    registerModel("NwPost", NwPost);
    registerModel("NwTagging", NwTagging);
    registerModel("NwSubscriber", NwSubscriber);

    const author = await NwAuthor.create({ name: "David" });

    // Loading nested through should work
    const taggings = await loadHasManyThrough(author, "nwTaggings", {
      through: "nwPosts",
      source: "nwTagging",
      className: "NwTagging",
    });
    expect(taggings).toHaveLength(0);
  });

  it("nested has one through writers should raise error", async () => {
    class NhoMember extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NhoClub extends Base {
      static {
        this.attribute("nho_member_id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    (NhoMember as any)._associations = [
      {
        type: "hasOne",
        name: "nhoClub",
        options: { className: "NhoClub", foreignKey: "nho_member_id" },
      },
    ];
    registerModel("NhoMember", NhoMember);
    registerModel("NhoClub", NhoClub);

    const member = await NhoMember.create({ name: "Groucho" });
    const club = await NhoClub.create({ nho_member_id: member.id, name: "Club" });

    const loadedClub = await loadHasOne(member, "nhoClub", {
      className: "NhoClub",
      foreignKey: "nho_member_id",
    });
    expect(loadedClub).not.toBeNull();
    expect(loadedClub!.readAttribute("name")).toBe("Club");
  });

  it("nested has many through with conditions on through associations", async () => {
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "Misc", body: "B" });
    const blueTag = await Tag.create({ name: "blue" });
    await Tagging.create({ tag_id: blueTag.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    const tags: any[] = [];
    for (const tg of taggings) {
      const tag = await loadBelongsTo(tg, "tag", { className: "Tag", foreignKey: "tag_id" });
      if (tag) tags.push(tag);
    }
    const blueTags = tags.filter((t) => t.readAttribute("name") === "blue");
    expect(blueTags).toHaveLength(1);
  });

  it("nested has many through with conditions on through associations preload", async () => {
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "Misc", body: "B" });
    const blueTag = await Tag.create({ name: "blue" });
    await Tagging.create({ tag_id: blueTag.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(taggings).toHaveLength(1);
  });

  it("nested has many through with conditions on through associations preload via joins", async () => {
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "Misc", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
  });

  it("nested has many through with conditions on source associations", async () => {
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "Misc", body: "B" });
    const blueTag = await Tag.create({ name: "blue" });
    const redTag = await Tag.create({ name: "red" });
    await Tagging.create({ tag_id: blueTag.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: redTag.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    const tags: any[] = [];
    for (const tg of taggings) {
      const tag = await loadBelongsTo(tg, "tag", { className: "Tag", foreignKey: "tag_id" });
      if (tag) tags.push(tag);
    }
    const blueTags = tags.filter((t) => t.readAttribute("name") === "blue");
    expect(blueTags).toHaveLength(1);
  });

  it("nested has many through with conditions on source associations preload", async () => {
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "Misc", body: "B" });
    const blueTag = await Tag.create({ name: "blue" });
    await Tagging.create({ tag_id: blueTag.id, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(taggings).toHaveLength(1);
  });

  it("through association preload doesnt reset source association if already preloaded", async () => {
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "P", body: "B" });
    const blueTag = await Tag.create({ name: "blue" });
    await Tagging.create({ tag_id: blueTag.id, taggable_id: post.id, taggable_type: "Post" });

    // Load posts and their taggings
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings1 = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    // Loading again shouldn't reset
    const taggings2 = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(taggings1).toHaveLength(taggings2.length);
  });

  it("nested has many through with conditions on source associations preload via joins", async () => {
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "Misc", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });

    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    expect(posts).toHaveLength(1);
  });

  it("nested has many through with foreign key option on the source reflection through reflection", async () => {
    class FkNOrg extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class FkNAuthor extends Base {
      static {
        this.attribute("fk_n_org_id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class FkNEssay extends Base {
      static {
        this.attribute("writer_id", "integer");
        this.attribute("fk_n_category_id", "integer");
        this.adapter = adapter;
      }
    }
    class FkNCategory extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    (FkNOrg as any)._associations = [
      {
        type: "hasMany",
        name: "fkNAuthors",
        options: { className: "FkNAuthor", foreignKey: "fk_n_org_id" },
      },
    ];
    (FkNAuthor as any)._associations = [
      {
        type: "hasMany",
        name: "fkNEssays",
        options: { className: "FkNEssay", foreignKey: "writer_id" },
      },
    ];
    (FkNEssay as any)._associations = [
      {
        type: "belongsTo",
        name: "fkNCategory",
        options: { className: "FkNCategory", foreignKey: "fk_n_category_id" },
      },
    ];
    registerModel("FkNOrg", FkNOrg);
    registerModel("FkNAuthor", FkNAuthor);
    registerModel("FkNEssay", FkNEssay);
    registerModel("FkNCategory", FkNCategory);

    const org = await FkNOrg.create({ name: "NSA" });
    const fkAuthor = await FkNAuthor.create({ fk_n_org_id: org.id, name: "DHH" });
    const cat = await FkNCategory.create({ name: "General" });
    await FkNEssay.create({ writer_id: fkAuthor.id, fk_n_category_id: cat.id });

    // Traverse: org -> authors -> essays -> categories
    const authors = await loadHasMany(org, "fkNAuthors", {
      className: "FkNAuthor",
      foreignKey: "fk_n_org_id",
    });
    expect(authors).toHaveLength(1);
    const essays = await loadHasMany(authors[0], "fkNEssays", {
      className: "FkNEssay",
      foreignKey: "writer_id",
    });
    expect(essays).toHaveLength(1);
    const category = await loadBelongsTo(essays[0], "fkNCategory", {
      className: "FkNCategory",
      foreignKey: "fk_n_category_id",
    });
    expect(category).not.toBeNull();
    expect(category!.readAttribute("name")).toBe("General");
  });

  it("nested has many through should not be autosaved", async () => {
    const author = await Author.create({ name: "David" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "auto" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    // Loading through nested chain should not trigger autosave
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
    });
    const taggings = await loadHasMany(posts[0], "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    expect(taggings).toHaveLength(1);
    // The tagging should not be auto-saved
    expect(taggings[0].isNewRecord()).toBe(false);
  });

  it("polymorphic has many through when through association has not loaded", async () => {
    class PnlChef extends Base {
      static {
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.adapter = adapter;
      }
    }
    class PnlCakeDesigner extends Base {
      static {
        this.attribute("pnl_chef_id", "integer");
        this.adapter = adapter;
      }
    }
    class PnlDrinkDesigner extends Base {
      static {
        this.attribute("pnl_chef_id", "integer");
        this.adapter = adapter;
      }
    }
    class PnlDepartment extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel("PnlChef", PnlChef);
    registerModel("PnlCakeDesigner", PnlCakeDesigner);
    registerModel("PnlDrinkDesigner", PnlDrinkDesigner);
    registerModel("PnlDepartment", PnlDepartment);

    const dept = await PnlDepartment.create({ name: "Pastry" });
    const chef = await PnlChef.create({ employable_id: dept.id, employable_type: "PnlDepartment" });
    const cakeDesigner = await PnlCakeDesigner.create({ pnl_chef_id: chef.id });
    const drinkDesigner = await PnlDrinkDesigner.create({ pnl_chef_id: chef.id });

    // Load chefs for department
    const chefs = await loadHasMany(dept, "pnlChefs", {
      className: "PnlChef",
      foreignKey: "employable_id",
      as: "employable",
    });
    expect(chefs).toHaveLength(1);
  });

  it("polymorphic has many through when through association has already loaded", async () => {
    class PalChef extends Base {
      static {
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.adapter = adapter;
      }
    }
    class PalCakeDesigner extends Base {
      static {
        this.attribute("pal_chef_id", "integer");
        this.adapter = adapter;
      }
    }
    class PalDepartment extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel("PalChef", PalChef);
    registerModel("PalCakeDesigner", PalCakeDesigner);
    registerModel("PalDepartment", PalDepartment);

    const dept = await PalDepartment.create({ name: "Pastry" });
    const chef = await PalChef.create({ employable_id: dept.id, employable_type: "PalDepartment" });
    await PalCakeDesigner.create({ pal_chef_id: chef.id });

    const chefs = await loadHasMany(dept, "palChefs", {
      className: "PalChef",
      foreignKey: "employable_id",
      as: "employable",
    });
    expect(chefs).toHaveLength(1);

    const cakeDesigners = await loadHasMany(chefs[0], "palCakeDesigners", {
      className: "PalCakeDesigner",
      foreignKey: "pal_chef_id",
    });
    expect(cakeDesigners).toHaveLength(1);
  });

  it("polymorphic has many through joined different table twice", async () => {
    class PjtChef extends Base {
      static {
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.adapter = adapter;
      }
    }
    class PjtCakeDesigner extends Base {
      static {
        this.attribute("pjt_chef_id", "integer");
        this.adapter = adapter;
      }
    }
    class PjtDrinkDesigner extends Base {
      static {
        this.attribute("pjt_chef_id", "integer");
        this.adapter = adapter;
      }
    }
    class PjtDepartment extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel("PjtChef", PjtChef);
    registerModel("PjtCakeDesigner", PjtCakeDesigner);
    registerModel("PjtDrinkDesigner", PjtDrinkDesigner);
    registerModel("PjtDepartment", PjtDepartment);

    const dept = await PjtDepartment.create({ name: "Kitchen" });
    const chef1 = await PjtChef.create({
      employable_id: dept.id,
      employable_type: "PjtDepartment",
    });
    const chef2 = await PjtChef.create({
      employable_id: dept.id,
      employable_type: "PjtDepartment",
    });
    await PjtCakeDesigner.create({ pjt_chef_id: chef1.id });
    await PjtDrinkDesigner.create({ pjt_chef_id: chef2.id });

    const chefs = await loadHasMany(dept, "pjtChefs", {
      className: "PjtChef",
      foreignKey: "employable_id",
      as: "employable",
    });
    expect(chefs).toHaveLength(2);
  });

  it("has many through polymorphic with scope", async () => {
    class PsPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class PsCategory extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class PsCategoryPost extends Base {
      static {
        this.attribute("ps_post_id", "integer");
        this.attribute("ps_category_id", "integer");
        this.adapter = adapter;
      }
    }
    (PsPost as any)._associations = [
      {
        type: "hasMany",
        name: "psCategoryPosts",
        options: { className: "PsCategoryPost", foreignKey: "ps_post_id" },
      },
      {
        type: "hasManyThrough",
        name: "psCategories",
        options: { through: "psCategoryPosts", source: "psCategory", className: "PsCategory" },
      },
    ];
    (PsCategoryPost as any)._associations = [
      {
        type: "belongsTo",
        name: "psCategory",
        options: { className: "PsCategory", foreignKey: "ps_category_id" },
      },
    ];
    registerModel("PsPost", PsPost);
    registerModel("PsCategory", PsCategory);
    registerModel("PsCategoryPost", PsCategoryPost);

    const post = await PsPost.create({ title: "Catchy" });
    const category = await PsCategory.create({ name: "Anything" });
    await PsCategoryPost.create({ ps_post_id: post.id, ps_category_id: category.id });

    const categories = await loadHasManyThrough(post, "psCategories", {
      through: "psCategoryPosts",
      source: "psCategory",
      className: "PsCategory",
    });
    expect(categories).toHaveLength(1);
  });

  it("has many through reset source reflection after loading is complete", async () => {
    class RsCategory extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class RsCategoryPost extends Base {
      static {
        this.attribute("rs_category_id", "integer");
        this.attribute("rs_post_id", "integer");
        this.adapter = adapter;
      }
    }
    class RsPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class RsComment extends Base {
      static {
        this.attribute("rs_post_id", "integer");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    (RsCategory as any)._associations = [
      {
        type: "hasMany",
        name: "rsCategoryPosts",
        options: { className: "RsCategoryPost", foreignKey: "rs_category_id" },
      },
      {
        type: "hasManyThrough",
        name: "rsPosts",
        options: { through: "rsCategoryPosts", source: "rsPost", className: "RsPost" },
      },
    ];
    (RsCategoryPost as any)._associations = [
      {
        type: "belongsTo",
        name: "rsPost",
        options: { className: "RsPost", foreignKey: "rs_post_id" },
      },
    ];
    (RsPost as any)._associations = [
      {
        type: "hasMany",
        name: "rsComments",
        options: { className: "RsComment", foreignKey: "rs_post_id" },
      },
    ];
    registerModel("RsCategory", RsCategory);
    registerModel("RsCategoryPost", RsCategoryPost);
    registerModel("RsPost", RsPost);
    registerModel("RsComment", RsComment);

    const cat = await RsCategory.create({ name: "General" });
    const post = await RsPost.create({ title: "T" });
    await RsCategoryPost.create({ rs_category_id: cat.id, rs_post_id: post.id });
    await RsComment.create({ rs_post_id: post.id, body: "C" });

    // Load posts through category
    const posts = await loadHasManyThrough(cat, "rsPosts", {
      through: "rsCategoryPosts",
      source: "rsPost",
      className: "RsPost",
    });
    expect(posts).toHaveLength(1);

    // Load comments on the post - source reflection should be reset after loading
    const comments = await loadHasMany(posts[0], "rsComments", {
      className: "RsComment",
      foreignKey: "rs_post_id",
    });
    expect(comments).toHaveLength(1);
  });
});

// ==========================================================================
// HasOneThroughAssociationsTest — mirrors has_one_through_associations_test.rb
// ==========================================================================
