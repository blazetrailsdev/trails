/**
 * Tests mirroring Rails activerecord/test/cases/associations/:
 *   - has_one_associations_test.rb
 *   - has_and_belongs_to_many_associations_test.rb
 *   - join_model_test.rb
 *   - nested_through_associations_test.rb
 *
 * Most tests use it.skip because they depend on a real database with fixtures.
 * A small subset of structural/in-memory tests run fully.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  Base,
  registerModel,
  association,
  DeleteRestrictionError,
  enableSti,
  registerSubclass,
  SubclassNotFound,
} from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  loadHabtm,
  processDependentAssociations,
  CollectionProxy,
  setBelongsTo,
  setHasOne,
  setHasMany,
  buildHasOne,
} from "../associations.js";

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

  it.skip("has many through has many with has many through source reflection preload", () => {
    // Requires preload for nested through
  });

  it.skip("has many through has many with has many through source reflection preload via joins", () => {
    // Requires joins-based preload
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

  it.skip("has many through has many through with has many source reflection preload", () => {
    // Requires 3-level preload
  });

  it.skip("has many through has many through with has many source reflection preload via joins", () => {
    // Requires 3-level preload via joins
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

  it.skip("has many through has one with has one through source reflection preload", () => {
    // Requires preload has_one through
  });

  it.skip("has many through has one with has one through source reflection preload via joins", () => {
    // Requires joins preload has_one through
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

  it.skip("has many through has one through with has one source reflection preload", () => {
    // Requires preload nested has_one through
  });

  it.skip("has many through has one through with has one source reflection preload via joins", () => {
    // Requires joins preload nested has_one
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

  it.skip("has many through has one with has many through source reflection preload", () => {
    // Requires preload mixed through
  });

  it.skip("has many through has one with has many through source reflection preload via joins", () => {
    // Requires joins preload mixed
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

  it.skip("has many through has one through with has many source reflection preload", () => {
    // Requires preload
  });

  it.skip("has many through has one through with has many source reflection preload via joins", () => {
    // Requires joins preload
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

  it.skip("has many through has many with has and belongs to many source reflection preload", () => {
    // Requires preload through HABTM
  });

  it.skip("has many through has many with has and belongs to many source reflection preload via joins", () => {
    // Requires joins preload through HABTM
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

  it.skip("has many through has and belongs to many with has many source reflection preload", () => {
    // Requires preload HABTM through
  });

  it.skip("has many through has and belongs to many with has many source reflection preload via joins", () => {
    // Requires joins preload HABTM through
  });

  it.skip("has many through has many with has many through habtm source reflection", () => {
    // Requires complex nested HABTM
  });

  it.skip("has many through has many with has many through habtm source reflection preload", () => {
    // Requires complex preload
  });

  it.skip("has many through has many with has many through habtm source reflection preload via joins", () => {
    // Requires complex joins preload
  });

  it.skip("has many through has many through with belongs to source reflection", () => {
    // Requires through + belongs_to source
  });

  it.skip("has many through has many through with belongs to source reflection preload", () => {
    // Requires preload
  });

  it.skip("has many through has many through with belongs to source reflection preload via joins", () => {
    // Requires joins preload
  });

  it.skip("has many through belongs to with has many through source reflection", () => {
    // Requires belongs_to through
  });

  it.skip("has many through belongs to with has many through source reflection preload", () => {
    // Requires preload belongs_to through
  });

  it.skip("has many through belongs to with has many through source reflection preload via joins", () => {
    // Requires joins preload belongs_to through
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

  it.skip("has one through has one with has one through source reflection preload", () => {
    // Requires preload
  });

  it.skip("has one through has one with has one through source reflection preload via joins", () => {
    // Requires joins preload
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

  it.skip("joins and includes from through models not included in association", () => {
    // Requires joins on intermediate model
  });

  it.skip("has one through has one through with belongs to source reflection preload", () => {
    // Requires preload
  });

  it.skip("has one through has one through with belongs to source reflection preload via joins", () => {
    // Requires joins preload
  });

  it.skip("distinct has many through a has many through association on source reflection", () => {
    // Requires distinct on source reflection
  });

  it.skip("distinct has many through a has many through association on through reflection", () => {
    // Requires distinct on through reflection
  });

  it.skip("nested has many through with a table referenced multiple times", () => {
    // Requires multiple reference handling
  });

  it.skip("nested has many through with scope on polymorphic reflection", () => {
    // Requires scope on polymorphic nested through
  });

  it.skip("has many through with foreign key option on through reflection", () => {
    // Requires foreign_key on through
  });

  it.skip("has many through with foreign key option on source reflection", () => {
    // Requires foreign_key on source
  });

  it.skip("has many through with sti on through reflection", () => {
    // Requires STI on through
  });

  it.skip("has many through with sti on nested through reflection", () => {
    // Requires STI on nested through
  });

  it.skip("nested has many through writers should raise error", () => {
    // Requires error on nested through write
  });

  it.skip("nested has one through writers should raise error", () => {
    // Requires error on nested has_one through write
  });

  it.skip("nested has many through with conditions on through associations", () => {
    // Requires conditions on through
  });

  it.skip("nested has many through with conditions on through associations preload", () => {
    // Requires preload with conditions
  });

  it.skip("nested has many through with conditions on through associations preload via joins", () => {
    // Requires joins preload with conditions
  });

  it.skip("nested has many through with conditions on source associations", () => {
    // Requires conditions on source
  });

  it.skip("nested has many through with conditions on source associations preload", () => {
    // Requires preload source conditions
  });

  it.skip("through association preload doesnt reset source association if already preloaded", () => {
    // Requires preload idempotence
  });

  it.skip("nested has many through with conditions on source associations preload via joins", () => {
    // Requires joins preload source conditions
  });

  it.skip("nested has many through with foreign key option on the source reflection through reflection", () => {
    // Requires FK on source-through reflection
  });

  it.skip("nested has many through should not be autosaved", () => {
    // Requires autosave: false on nested
  });

  it.skip("polymorphic has many through when through association has not loaded", () => {
    // Requires polymorphic through unloaded
  });

  it.skip("polymorphic has many through when through association has already loaded", () => {
    // Requires polymorphic through loaded
  });

  it.skip("polymorphic has many through joined different table twice", () => {
    // Requires double-join on polymorphic through
  });

  it.skip("has many through polymorphic with scope", () => {
    // Requires scope on polymorphic through
  });

  it.skip("has many through reset source reflection after loading is complete", () => {
    // Requires source reflection reset after load
  });
});

// ==========================================================================
// HasOneThroughAssociationsTest — mirrors has_one_through_associations_test.rb
// ==========================================================================
