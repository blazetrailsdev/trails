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
    // Reset associations to avoid cross-test coupling
    (Author as any)._associations = [];
    (Post as any)._associations = [];
    (Tag as any)._associations = [];
    (Tagging as any)._associations = [];
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
    expect(loadedTag!.name).toBe("nested-tag");
  });

  it("has many through has many with has many through source reflection preload", async () => {
    // Author -> posts -> taggings -> tags (nested through, preload strategy)
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tags" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "DHH" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "ruby" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload("tags").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(preloadedTags).toHaveLength(1);
    expect(preloadedTags[0].name).toBe("ruby");
  });

  it("has many through has many with has many through source reflection preload via joins", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tags" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "DHH" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "ruby" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().eagerLoad("tags").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(preloadedTags).toHaveLength(1);
    expect(preloadedTags[0].name).toBe("ruby");
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
    // Author -> posts -> taggings (nested through, source is hasMany not through)
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", through: "posts", source: "taggings" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
    ];
    const author = await Author.create({ name: "Nested" });
    const post1 = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const post2 = await Post.create({ author_id: author.id, title: "P2", body: "B" });
    const tag1 = await Tag.create({ name: "t1" });
    const tag2 = await Tag.create({ name: "t2" });
    await Tagging.create({ tag_id: tag1.id, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag2.id, taggable_id: post2.id, taggable_type: "Post" });

    const authors = await Author.all().preload("taggings").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTaggings = (authors[0] as any)._preloadedAssociations?.get("taggings") ?? [];
    expect(preloadedTaggings).toHaveLength(2);
  });

  it("has many through has many through with has many source reflection preload via joins", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", through: "posts", source: "taggings" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
    ];
    const author = await Author.create({ name: "Nested" });
    const post1 = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const post2 = await Post.create({ author_id: author.id, title: "P2", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: 2, taggable_id: post2.id, taggable_type: "Post" });

    const authors = await Author.all().eagerLoad("taggings").toArray();
    expect(authors).toHaveLength(1);
    const loaded = (authors[0] as any)._preloadedAssociations?.get("taggings") ?? [];
    expect(loaded).toHaveLength(2);
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
    expect(tagging!.tag_id).toBe(tag.id);
  });

  it("has many through has one with has one through source reflection preload", async () => {
    // Author -> posts (hasMany) -> tagging (hasOne per post) -> tag (belongsTo)
    // Author has_many :tags, through: :posts, source: :tag
    // Post has_one :tag, through: :tagging
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tag" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasOne",
        name: "tagging",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasOne",
        name: "tag",
        options: { className: "Tag", through: "tagging", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "HasOneThrough" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "ruby" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload("tags").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(preloadedTags).toHaveLength(1);
    expect(preloadedTags[0].name).toBe("ruby");
  });

  it("has many through has one with has one through source reflection preload via joins", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tag" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasOne",
        name: "tagging",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasOne",
        name: "tag",
        options: { className: "Tag", through: "tagging", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "Test" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "ruby" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().eagerLoad("tags").toArray();
    expect(authors).toHaveLength(1);
    const loaded = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("ruby");
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
    expect(loadedTag!.name).toBe("nested");
  });

  it("has many through has one through with has one source reflection preload", async () => {
    // Author -> posts (hasMany) -> each post has_one tagging -> tag (belongsTo on tagging)
    // Post has_one :tag, through: :tagging (source is belongsTo, a hasOne through)
    // Author has_many :tags, through: :posts, source: :tag
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tag" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasOne",
        name: "tagging",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasOne",
        name: "tag",
        options: { className: "Tag", through: "tagging", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "NestedHasOne" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "nested" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload("tags").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(preloadedTags).toHaveLength(1);
    expect(preloadedTags[0].name).toBe("nested");
  });

  it("has many through has one through with has one source reflection preload via joins", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tag" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasOne",
        name: "tagging",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasOne",
        name: "tag",
        options: { className: "Tag", through: "tagging", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "Test" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const tag = await Tag.create({ name: "nested" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().eagerLoad("tags").toArray();
    expect(authors).toHaveLength(1);
    const loaded = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("nested");
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
    // Author -> posts -> taggings (where Post has_many :tags, through: :taggings)
    // Author has_many :tags through posts, source is a through association
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tags" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "MixedThrough" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const t1 = await Tag.create({ name: "mix1" });
    const t2 = await Tag.create({ name: "mix2" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload("tags").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(preloadedTags).toHaveLength(2);
  });

  it("has many through has one with has many through source reflection preload via joins", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tags" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "Test" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const t1 = await Tag.create({ name: "mix1" });
    const t2 = await Tag.create({ name: "mix2" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().eagerLoad("tags").toArray();
    expect(authors).toHaveLength(1);
    const loaded = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(loaded).toHaveLength(2);
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
    // Author -> posts -> taggings (Post has_many :taggings directly)
    // Author has_many :taggings, through: :posts
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", through: "posts", source: "taggings" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
    ];
    const author = await Author.create({ name: "HasOneHasMany" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    const t1 = await Tag.create({ name: "s1" });
    const t2 = await Tag.create({ name: "s2" });
    const t3 = await Tag.create({ name: "s3" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t3.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload("taggings").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTaggings = (authors[0] as any)._preloadedAssociations?.get("taggings") ?? [];
    expect(preloadedTaggings).toHaveLength(3);
  });

  it("has many through has one through with has many source reflection preload via joins", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", through: "posts", source: "taggings" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
    ];
    const author = await Author.create({ name: "Test" });
    const post = await Post.create({ author_id: author.id, title: "T", body: "B" });
    await Tagging.create({ tag_id: 1, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: 2, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: 3, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().eagerLoad("taggings").toArray();
    expect(authors).toHaveLength(1);
    const loaded = (authors[0] as any)._preloadedAssociations?.get("taggings") ?? [];
    expect(loaded).toHaveLength(3);
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
    const names = tags.map((t: any) => t.name);
    expect(names).toContain("hs_tag1");
    expect(names).toContain("hs_tag2");
  });

  it("has many through has many with has and belongs to many source reflection preload", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tags" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "HABTMSource" });
    const post = await Post.create({ author_id: author.id, title: "HS", body: "B" });
    const t1 = await Tag.create({ name: "hs_tag1" });
    const t2 = await Tag.create({ name: "hs_tag2" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload("tags").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(preloadedTags).toHaveLength(2);
    const names = preloadedTags.map((t: any) => t.name);
    expect(names).toContain("hs_tag1");
    expect(names).toContain("hs_tag2");
  });

  it("has many through has many with has and belongs to many source reflection preload via joins", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tags" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "Test" });
    const post = await Post.create({ author_id: author.id, title: "HS", body: "B" });
    const t1 = await Tag.create({ name: "hs_tag1" });
    const t2 = await Tag.create({ name: "hs_tag2" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().eagerLoad("tags").toArray();
    expect(authors).toHaveLength(1);
    const loaded = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(loaded).toHaveLength(2);
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
    const titles = posts.map((p: any) => p.title);
    expect(titles).toContain("HM1");
    expect(titles).toContain("HM2");
  });

  it("has many through has and belongs to many with has many source reflection preload", async () => {
    (Tag as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "tag_id" },
      },
      {
        type: "hasMany",
        name: "posts",
        options: { className: "Post", through: "taggings", source: "post" },
      },
    ];
    (Tagging as any)._associations = [
      {
        type: "belongsTo",
        name: "post",
        options: { className: "Post", foreignKey: "taggable_id" },
      },
    ];
    const tag = await Tag.create({ name: "habtm_hm_tag" });
    const post1 = await Post.create({ title: "HM1", body: "B" });
    const post2 = await Post.create({ title: "HM2", body: "B" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post2.id, taggable_type: "Post" });

    const tags = await Tag.all().preload("posts").toArray();
    expect(tags).toHaveLength(1);
    const preloadedPosts = (tags[0] as any)._preloadedAssociations?.get("posts") ?? [];
    expect(preloadedPosts).toHaveLength(2);
    const titles = preloadedPosts.map((p: any) => p.title);
    expect(titles).toContain("HM1");
    expect(titles).toContain("HM2");
  });

  it("has many through has and belongs to many with has many source reflection preload via joins", async () => {
    (Tag as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "tag_id" },
      },
      {
        type: "hasMany",
        name: "posts",
        options: { className: "Post", through: "taggings", source: "post" },
      },
    ];
    (Tagging as any)._associations = [
      {
        type: "belongsTo",
        name: "post",
        options: { className: "Post", foreignKey: "taggable_id" },
      },
    ];
    const tag = await Tag.create({ name: "test" });
    const post1 = await Post.create({ title: "HM1", body: "B" });
    const post2 = await Post.create({ title: "HM2", body: "B" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post2.id, taggable_type: "Post" });

    const tags = await Tag.all().eagerLoad("posts").toArray();
    expect(tags).toHaveLength(1);
    const loaded = (tags[0] as any)._preloadedAssociations?.get("posts") ?? [];
    expect(loaded).toHaveLength(2);
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
    const names = tags.map((t: any) => t.name).sort();
    expect(names).toEqual(["hc1", "hc2"]);
  });

  it("has many through has many with has many through habtm source reflection preload", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tags" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "HABTMChain" });
    const post = await Post.create({ author_id: author.id, title: "HC", body: "B" });
    const tag1 = await Tag.create({ name: "hc1" });
    const tag2 = await Tag.create({ name: "hc2" });
    await Tagging.create({ tag_id: tag1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag2.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload("tags").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(preloadedTags).toHaveLength(2);
    const names = preloadedTags.map((t: any) => t.name).sort();
    expect(names).toEqual(["hc1", "hc2"]);
  });

  it("has many through has many with has many through habtm source reflection preload via joins", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tags" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "Test" });
    const post = await Post.create({ author_id: author.id, title: "HC", body: "B" });
    const t1 = await Tag.create({ name: "hc1" });
    const t2 = await Tag.create({ name: "hc2" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().eagerLoad("tags").toArray();
    expect(authors).toHaveLength(1);
    const loaded = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(loaded).toHaveLength(2);
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
    expect(loadedTag!.name).toBe("bt_tag");
  });

  it("has many through has many through with belongs to source reflection preload", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tags" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "BelongsToSource" });
    const post = await Post.create({ author_id: author.id, title: "T1", body: "B" });
    const tag = await Tag.create({ name: "bt_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload("tags").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(preloadedTags).toHaveLength(1);
    expect(preloadedTags[0].name).toBe("bt_tag");
  });

  it("has many through has many through with belongs to source reflection preload via joins", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tags" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "Test" });
    const post = await Post.create({ author_id: author.id, title: "T1", body: "B" });
    const tag = await Tag.create({ name: "bt_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().eagerLoad("tags").toArray();
    expect(authors).toHaveLength(1);
    const loaded = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("bt_tag");
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
    // Post belongs_to Author -> Author has_many tags through posts -> taggings -> tags
    (Post as any)._associations = [
      {
        type: "belongsTo",
        name: "author",
        options: { className: "Author", foreignKey: "author_id" },
      },
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "BtThrough" });
    const post1 = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const post2 = await Post.create({ author_id: author.id, title: "P2", body: "B" });
    const tag1 = await Tag.create({ name: "bt1" });
    const tag2 = await Tag.create({ name: "bt2" });
    await Tagging.create({ tag_id: tag1.id, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag2.id, taggable_id: post2.id, taggable_type: "Post" });

    const posts = await Post.all().preload("tags").toArray();
    const allTags = posts.flatMap((p: any) => (p as any)._preloadedAssociations?.get("tags") ?? []);
    expect(allTags).toHaveLength(2);
  });

  it("has many through belongs to with has many through source reflection preload via joins", async () => {
    (Post as any)._associations = [
      {
        type: "belongsTo",
        name: "author",
        options: { className: "Author", foreignKey: "author_id" },
      },
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "Test" });
    const post1 = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const post2 = await Post.create({ author_id: author.id, title: "P2", body: "B" });
    const t1 = await Tag.create({ name: "bt1" });
    const t2 = await Tag.create({ name: "bt2" });
    await Tagging.create({ tag_id: t1.id, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: t2.id, taggable_id: post2.id, taggable_type: "Post" });

    const posts = await Post.all().eagerLoad("tags").toArray();
    const allTags = posts.flatMap((p: any) => (p as any)._preloadedAssociations?.get("tags") ?? []);
    expect(allTags).toHaveLength(2);
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
    expect(loadedTag!.name).toBe("hoc_tag");
  });

  it("has one through has one with has one through source reflection preload", async () => {
    // Author has_one :post -> Post has_one :tagging -> Tagging belongs_to :tag
    // Post has_one :tag, through: :tagging
    // Author has_one :tag, through: :post, source: :tag
    (Author as any)._associations = [
      { type: "hasOne", name: "post", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasOne",
        name: "tag",
        options: { className: "Tag", through: "post", source: "tag" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasOne",
        name: "tagging",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasOne",
        name: "tag",
        options: { className: "Tag", through: "tagging", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "HasOneChain" });
    const post = await Post.create({ author_id: author.id, title: "HOC", body: "B" });
    const tag = await Tag.create({ name: "hoc_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload("tag").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTag = (authors[0] as any)._preloadedAssociations?.get("tag");
    expect(preloadedTag).not.toBeNull();
    expect(preloadedTag.name).toBe("hoc_tag");
  });

  it("has one through has one with has one through source reflection preload via joins", async () => {
    (Author as any)._associations = [
      { type: "hasOne", name: "post", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasOne",
        name: "tag",
        options: { className: "Tag", through: "post", source: "tag" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasOne",
        name: "tagging",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasOne",
        name: "tag",
        options: { className: "Tag", through: "tagging", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "Test" });
    const post = await Post.create({ author_id: author.id, title: "HOC", body: "B" });
    const tag = await Tag.create({ name: "hoc_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().eagerLoad("tag").toArray();
    expect(authors).toHaveLength(1);
    const loaded = (authors[0] as any)._preloadedAssociations?.get("tag");
    expect(loaded).not.toBeNull();
    expect(loaded.name).toBe("hoc_tag");
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
    expect(loadedPost!.title).toBe("BC");
  });

  it.skip("joins and includes from through models not included in association", () => {});

  it("has one through has one through with belongs to source reflection preload", async () => {
    // Tag has_one :tagging -> Tagging belongs_to :post
    // Tag has_one :post, through: :tagging
    (Tag as any)._associations = [
      { type: "hasOne", name: "tagging", options: { className: "Tagging", foreignKey: "tag_id" } },
      {
        type: "hasOne",
        name: "post",
        options: { className: "Post", through: "tagging", source: "post" },
      },
    ];
    (Tagging as any)._associations = [
      {
        type: "belongsTo",
        name: "post",
        options: { className: "Post", foreignKey: "taggable_id" },
      },
    ];
    const author = await Author.create({ name: "BelongsChain" });
    const post = await Post.create({ author_id: author.id, title: "BC", body: "B" });
    const tag = await Tag.create({ name: "bc_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const tags = await Tag.all().preload("post").toArray();
    expect(tags).toHaveLength(1);
    const preloadedPost = (tags[0] as any)._preloadedAssociations?.get("post");
    expect(preloadedPost).not.toBeNull();
    expect(preloadedPost.title).toBe("BC");
  });

  it("has one through has one through with belongs to source reflection preload via joins", async () => {
    (Tag as any)._associations = [
      { type: "hasOne", name: "tagging", options: { className: "Tagging", foreignKey: "tag_id" } },
      {
        type: "hasOne",
        name: "post",
        options: { className: "Post", through: "tagging", source: "post" },
      },
    ];
    (Tagging as any)._associations = [
      {
        type: "belongsTo",
        name: "post",
        options: { className: "Post", foreignKey: "taggable_id" },
      },
    ];
    const author = await Author.create({ name: "Test" });
    const post = await Post.create({ author_id: author.id, title: "BC", body: "B" });
    const tag = await Tag.create({ name: "bc_tag" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });

    const tags = await Tag.all().eagerLoad("post").toArray();
    expect(tags).toHaveLength(1);
    const loaded = (tags[0] as any)._preloadedAssociations?.get("post");
    expect(loaded).not.toBeNull();
    expect(loaded.title).toBe("BC");
  });

  it("distinct has many through a has many through association on source reflection", async () => {
    // Author -> posts -> taggings -> tags, but same tag appears via multiple taggings
    // distinct_tags should deduplicate
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "posts", source: "tags" },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "David" });
    const post1 = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const post2 = await Post.create({ author_id: author.id, title: "P2", body: "B" });
    const tag = await Tag.create({ name: "general" });
    // Same tag attached to both posts
    await Tagging.create({ tag_id: tag.id, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post2.id, taggable_type: "Post" });

    const authors = await Author.all().preload("tags").toArray();
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("tags") ?? [];
    // Same tag attached via two posts — without distinct_tags association, duplicates are returned
    expect(preloadedTags).toHaveLength(2);
    expect(preloadedTags.every((t: any) => t.name === "general")).toBe(true);
  });

  it.skip("distinct has many through a has many through association on through reflection", () => {});

  it.skip("nested has many through with a table referenced multiple times", () => {});

  it.skip("nested has many through with scope on polymorphic reflection", () => {});

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
    expect(comments[0].body).toBe("Great!");
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
    expect(comments[0].body).toBe("Nice!");
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
    expect(members[0].name).toBe("Alice");
  });

  it.skip("has many through with sti on nested through reflection", () => {});

  it("nested has many through writers should raise error", async () => {
    const { CollectionProxy } = await import("./collection-proxy.js");

    class NwrAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NwrPost extends Base {
      static {
        this.attribute("nwr_author_id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class NwrTagging extends Base {
      static {
        this.attribute("nwr_post_id", "integer");
        this.attribute("nwr_tag_id", "integer");
        this.adapter = adapter;
      }
    }
    class NwrTag extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    (NwrAuthor as any)._associations = [
      {
        type: "hasMany",
        name: "nwrPosts",
        options: { className: "NwrPost", foreignKey: "nwr_author_id" },
      },
      {
        type: "hasManyThrough",
        name: "nwrTaggings",
        options: { through: "nwrPosts", source: "nwrTaggings", className: "NwrTagging" },
      },
      {
        type: "hasManyThrough",
        name: "nwrTags",
        options: { through: "nwrTaggings", source: "nwrTag", className: "NwrTag" },
      },
    ];
    (NwrPost as any)._associations = [
      {
        type: "hasMany",
        name: "nwrTaggings",
        options: { className: "NwrTagging", foreignKey: "nwr_post_id" },
      },
    ];
    (NwrTagging as any)._associations = [
      {
        type: "belongsTo",
        name: "nwrTag",
        options: { className: "NwrTag", foreignKey: "nwr_tag_id" },
      },
    ];
    registerModel("NwrAuthor", NwrAuthor);
    registerModel("NwrPost", NwrPost);
    registerModel("NwrTagging", NwrTagging);
    registerModel("NwrTag", NwrTag);

    const author = await NwrAuthor.create({ name: "David" });
    const tag = await NwrTag.create({ name: "general" });

    const proxy = new CollectionProxy(author, "nwrTags", {
      type: "hasMany",
      name: "nwrTags",
      options: { through: "nwrTaggings", source: "nwrTag", className: "NwrTag" },
    });

    await expect(proxy.push(tag)).rejects.toThrow(/nested through association/);
  });

  it("nested has one through writers should raise error", async () => {
    const { CollectionProxy } = await import("./collection-proxy.js");

    class NhoAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NhoPost extends Base {
      static {
        this.attribute("nho_author_id", "integer");
        this.adapter = adapter;
      }
    }
    class NhoComment extends Base {
      static {
        this.attribute("nho_post_id", "integer");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    (NhoAuthor as any)._associations = [
      {
        type: "hasOne",
        name: "nhoPost",
        options: { className: "NhoPost", foreignKey: "nho_author_id" },
      },
      {
        type: "hasOneThrough",
        name: "nhoComment",
        options: { through: "nhoPost", source: "nhoComment", className: "NhoComment" },
      },
      {
        type: "hasOneThrough",
        name: "nhoNestedComment",
        options: { through: "nhoComment", source: "nhoComment", className: "NhoComment" },
      },
    ];
    (NhoPost as any)._associations = [
      {
        type: "hasOne",
        name: "nhoComment",
        options: { className: "NhoComment", foreignKey: "nho_post_id" },
      },
    ];
    registerModel("NhoAuthor", NhoAuthor);
    registerModel("NhoPost", NhoPost);
    registerModel("NhoComment", NhoComment);

    const author = await NhoAuthor.create({ name: "David" });
    const comment = await NhoComment.create({ body: "C1" });

    const proxy = new CollectionProxy(author, "nhoNestedComment", {
      type: "hasOne",
      name: "nhoNestedComment",
      options: { through: "nhoComment", source: "nhoComment", className: "NhoComment" },
    });

    await expect(proxy.push(comment)).rejects.toThrow(/nested through association/);
  });

  it("nested has many through with conditions on through associations", async () => {
    // Author -> posts (scoped to title LIKE 'Misc%') -> taggings -> tags
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "miscTags",
        options: {
          className: "Tag",
          through: "posts",
          source: "tags",
          scope: (rel: any) => rel,
        },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "Bob" });
    const miscPost = await Post.create({ author_id: author.id, title: "Misc Post", body: "B" });
    const otherPost = await Post.create({ author_id: author.id, title: "Other", body: "B" });
    const blueTag = await Tag.create({ name: "blue" });
    const redTag = await Tag.create({ name: "red" });
    await Tagging.create({ tag_id: blueTag.id, taggable_id: miscPost.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: redTag.id, taggable_id: otherPost.id, taggable_type: "Post" });

    // Manual load: author's tags through all posts
    const posts = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      primaryKey: "id",
    });
    expect(posts).toHaveLength(2);
    const allTags: any[] = [];
    for (const p of posts) {
      const taggings = await loadHasMany(p, "taggings", {
        className: "Tagging",
        foreignKey: "taggable_id",
        primaryKey: "id",
      });
      for (const tg of taggings) {
        const tag = await loadBelongsTo(tg, "tag", { className: "Tag", foreignKey: "tag_id" });
        if (tag) allTags.push(tag);
      }
    }
    expect(allTags).toHaveLength(2);
  });

  it("nested has many through with conditions on through associations preload", async () => {
    // Scope on the outer through filters tags to only "blue" ones
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "blueThroughTags",
        options: {
          className: "Tag",
          through: "posts",
          source: "tags",
          scope: (rel: any) => rel.where({ name: "blue" }),
        },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "Misc", body: "B" });
    const blueTag = await Tag.create({ name: "blue" });
    const redTag = await Tag.create({ name: "red" });
    await Tagging.create({ tag_id: blueTag.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: redTag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload("blueThroughTags").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("blueThroughTags") ?? [];
    // Only blue tag should be returned due to scope
    expect(preloadedTags).toHaveLength(1);
    expect(preloadedTags[0].name).toBe("blue");
  });

  it.skip("nested has many through with conditions on through associations preload via joins", () => {});

  it("nested has many through with conditions on source associations", async () => {
    // Same as above but conditions are on source (tag) side
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "blueTags",
        options: {
          className: "Tag",
          through: "posts",
          source: "tags",
          scope: (rel: any) => rel.where({ name: "blue" }),
        },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const blueTag = await Tag.create({ name: "blue" });
    const redTag = await Tag.create({ name: "red" });
    await Tagging.create({ tag_id: blueTag.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: redTag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload("blueTags").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("blueTags") ?? [];
    expect(preloadedTags).toHaveLength(1);
    expect(preloadedTags[0].name).toBe("blue");
  });

  it("nested has many through with conditions on source associations preload", async () => {
    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "blueTags",
        options: {
          className: "Tag",
          through: "posts",
          source: "tags",
          scope: (rel: any) => rel.where({ name: "blue" }),
        },
      },
    ];
    (Post as any)._associations = [
      {
        type: "hasMany",
        name: "taggings",
        options: { className: "Tagging", foreignKey: "taggable_id" },
      },
      {
        type: "hasMany",
        name: "tags",
        options: { className: "Tag", through: "taggings", source: "tag" },
      },
    ];
    (Tagging as any)._associations = [
      { type: "belongsTo", name: "tag", options: { className: "Tag", foreignKey: "tag_id" } },
    ];
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const blueTag = await Tag.create({ name: "blue" });
    const redTag = await Tag.create({ name: "red" });
    await Tagging.create({ tag_id: blueTag.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: redTag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload("blueTags").toArray();
    expect(authors).toHaveLength(1);
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("blueTags") ?? [];
    expect(preloadedTags).toHaveLength(1);
    expect(preloadedTags[0].name).toBe("blue");
  });

  it.skip("through association preload doesnt reset source association if already preloaded", () => {});

  it.skip("nested has many through with conditions on source associations preload via joins", () => {});

  it("nested has many through with foreign key option on the source reflection through reflection", async () => {
    // Organization -> Authors (custom FK) -> Essays -> Categories
    class NfkOrganization extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NfkAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("organization_id", "integer");
        this.adapter = adapter;
      }
    }
    class NfkEssay extends Base {
      static {
        this.attribute("writer_id", "integer");
        this.attribute("nfk_category_id", "integer");
        this.adapter = adapter;
      }
    }
    class NfkCategory extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    (NfkOrganization as any)._associations = [
      {
        type: "hasMany",
        name: "nfkAuthors",
        options: { className: "NfkAuthor", foreignKey: "organization_id" },
      },
      {
        type: "hasMany",
        name: "nfkCategories",
        options: { className: "NfkCategory", through: "nfkAuthors", source: "nfkCategories" },
      },
    ];
    (NfkAuthor as any)._associations = [
      {
        type: "hasMany",
        name: "nfkEssays",
        options: { className: "NfkEssay", foreignKey: "writer_id" },
      },
      {
        type: "hasMany",
        name: "nfkCategories",
        options: { className: "NfkCategory", through: "nfkEssays", source: "nfkCategory" },
      },
    ];
    (NfkEssay as any)._associations = [
      {
        type: "belongsTo",
        name: "nfkCategory",
        options: { className: "NfkCategory", foreignKey: "nfk_category_id" },
      },
    ];
    registerModel("NfkOrganization", NfkOrganization);
    registerModel("NfkAuthor", NfkAuthor);
    registerModel("NfkEssay", NfkEssay);
    registerModel("NfkCategory", NfkCategory);

    const org = await NfkOrganization.create({ name: "NSA" });
    const author = await NfkAuthor.create({ name: "David", organization_id: org.id });
    const cat = await NfkCategory.create({ name: "general" });
    await NfkEssay.create({ writer_id: author.id, nfk_category_id: cat.id });

    const orgs = await NfkOrganization.all().preload("nfkCategories").toArray();
    expect(orgs).toHaveLength(1);
    const preloadedCats = (orgs[0] as any)._preloadedAssociations?.get("nfkCategories") ?? [];
    expect(preloadedCats).toHaveLength(1);
    expect(preloadedCats[0].name).toBe("general");
  });

  it.skip("nested has many through should not be autosaved", () => {});

  it("polymorphic has many through when through association has not loaded", async () => {
    // Hotel -> departments -> chefs -> cake_designers (polymorphic)
    class PhmtHotel extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class PhmtDepartment extends Base {
      static {
        this.attribute("phmt_hotel_id", "integer");
        this.adapter = adapter;
      }
    }
    class PhmtChef extends Base {
      static {
        this.attribute("phmt_department_id", "integer");
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.adapter = adapter;
      }
    }
    class PhmtCakeDesigner extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    (PhmtHotel as any)._associations = [
      {
        type: "hasMany",
        name: "phmtDepartments",
        options: { className: "PhmtDepartment", foreignKey: "phmt_hotel_id" },
      },
      {
        type: "hasMany",
        name: "phmtChefs",
        options: { className: "PhmtChef", through: "phmtDepartments", source: "phmtChefs" },
      },
      {
        type: "hasMany",
        name: "phmtCakeDesigners",
        options: {
          className: "PhmtCakeDesigner",
          through: "phmtChefs",
          source: "employable",
          sourceType: "PhmtCakeDesigner",
        },
      },
    ];
    (PhmtDepartment as any)._associations = [
      {
        type: "hasMany",
        name: "phmtChefs",
        options: { className: "PhmtChef", foreignKey: "phmt_department_id" },
      },
    ];
    (PhmtChef as any)._associations = [
      {
        type: "belongsTo",
        name: "employable",
        options: { polymorphic: true, foreignKey: "employable_id" },
      },
    ];
    registerModel("PhmtHotel", PhmtHotel);
    registerModel("PhmtDepartment", PhmtDepartment);
    registerModel("PhmtChef", PhmtChef);
    registerModel("PhmtCakeDesigner", PhmtCakeDesigner);

    const cakeDesigner = await PhmtCakeDesigner.create({ name: "Cake Boss" });
    const hotel = await PhmtHotel.create({ name: "Grand" });
    const dept = await PhmtDepartment.create({ phmt_hotel_id: hotel.id });
    await PhmtChef.create({
      phmt_department_id: dept.id,
      employable_id: cakeDesigner.id,
      employable_type: "PhmtCakeDesigner",
    });

    // Preload chefs through departments (tests the through path with polymorphic source defined)
    const hotels = await PhmtHotel.all().preload("phmtChefs").toArray();
    expect(hotels).toHaveLength(1);
    const chefs = (hotels[0] as any)._preloadedAssociations?.get("phmtChefs") ?? [];
    expect(chefs).toHaveLength(1);
    expect(chefs[0].employable_type).toBe("PhmtCakeDesigner");
  });

  it("polymorphic has many through when through association has already loaded", async () => {
    // Same setup, but preload both chefs and cake_designers
    class PhmtHotel2 extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class PhmtDepartment2 extends Base {
      static {
        this.attribute("phmt_hotel2_id", "integer");
        this.adapter = adapter;
      }
    }
    class PhmtChef2 extends Base {
      static {
        this.attribute("phmt_department2_id", "integer");
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.adapter = adapter;
      }
    }
    class PhmtCakeDesigner2 extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    (PhmtHotel2 as any)._associations = [
      {
        type: "hasMany",
        name: "phmtDepartment2s",
        options: { className: "PhmtDepartment2", foreignKey: "phmt_hotel2_id" },
      },
      {
        type: "hasMany",
        name: "phmtChef2s",
        options: { className: "PhmtChef2", through: "phmtDepartment2s", source: "phmtChef2s" },
      },
    ];
    (PhmtDepartment2 as any)._associations = [
      {
        type: "hasMany",
        name: "phmtChef2s",
        options: { className: "PhmtChef2", foreignKey: "phmt_department2_id" },
      },
    ];
    registerModel("PhmtHotel2", PhmtHotel2);
    registerModel("PhmtDepartment2", PhmtDepartment2);
    registerModel("PhmtChef2", PhmtChef2);
    registerModel("PhmtCakeDesigner2", PhmtCakeDesigner2);

    const cakeDesigner = await PhmtCakeDesigner2.create({ name: "Cake Boss" });
    const hotel = await PhmtHotel2.create({ name: "Grand" });
    const dept = await PhmtDepartment2.create({ phmt_hotel2_id: hotel.id });
    await PhmtChef2.create({
      phmt_department2_id: dept.id,
      employable_id: cakeDesigner.id,
      employable_type: "PhmtCakeDesigner2",
    });

    const hotels = await PhmtHotel2.all().preload("phmtChef2s").toArray();
    expect(hotels).toHaveLength(1);
    const chefs = (hotels[0] as any)._preloadedAssociations?.get("phmtChef2s") ?? [];
    expect(chefs).toHaveLength(1);
  });

  it.skip("polymorphic has many through joined different table twice", () => {});

  it.skip("has many through polymorphic with scope", () => {});

  it.skip("has many through reset source reflection after loading is complete", () => {});
});

// ==========================================================================
// HasOneThroughAssociationsTest — mirrors has_one_through_associations_test.rb
// ==========================================================================
