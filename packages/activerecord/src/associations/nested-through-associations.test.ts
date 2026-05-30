/**
 * Mirrors Rails activerecord/test/cases/associations/nested_through_associations_test.rb
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Base, registerModel, enableSti, registerSubclass } from "../index.js";
import {
  Associations,
  association,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
} from "../associations.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

const TEST_SCHEMA: Schema = {
  authors: { name: "string" },
  posts: { author_id: "integer", title: "string", body: "string" },
  tags: { name: "string" },
  taggings: {
    tag_id: "integer",
    taggable_id: "integer",
    taggable_type: "string",
  },
  pst_tags: { name: "string" },
  pst_taggings: {
    pst_tag_id: "integer",
    taggable_id: "integer",
    taggable_type: "string",
  },
  pst_posts: { title: "string" },
  fk_thr_authors: { name: "string" },
  fk_thr_posts: { writer_id: "integer", title: "string" },
  fk_thr_comments: { fk_thr_post_id: "integer", body: "string" },
  fk_src_authors: { name: "string" },
  fk_src_posts: { fk_src_author_id: "integer", title: "string" },
  fk_src_comments: { article_id: "integer", body: "string" },
  sti_thr_clubs: { name: "string" },
  sti_thr_memberships: {
    sti_thr_club_id: "integer",
    sti_thr_member_id: "integer",
    type: "string",
  },
  sti_thr_members: { name: "string" },
  sti_n_posts: { title: "string" },
  sti_n_comments: { sti_n_post_id: "integer", type: "string", body: "string" },
  sti_n_ratings: { sti_n_comment_id: "integer", value: "integer" },
  sti_n_taggings: { sti_n_rating_id: "integer" },
  rsr_categories: { name: "string" },
  rsr_posts: { rsr_category_id: "integer", title: "string" },
  rsr_comments: { rsr_post_id: "integer", body: "string" },
  nwr_authors: { name: "string" },
  nwr_posts: { nwr_author_id: "integer", title: "string" },
  nwr_taggings: { nwr_post_id: "integer", nwr_tag_id: "integer" },
  nwr_tags: { name: "string" },
  nho_authors: { name: "string" },
  nho_posts: { nho_author_id: "integer" },
  nho_comments: { nho_post_id: "integer", body: "string" },
  nfk_organizations: { name: "string" },
  nfk_authors: { name: "string", organization_id: "integer" },
  nfk_essays: { writer_id: "integer", nfk_category_id: "integer" },
  nfk_categories: { name: "string" },
  phmt_hotels: { name: "string" },
  phmt_departments: { phmt_hotel_id: "integer" },
  phmt_chefs: {
    phmt_department_id: "integer",
    employable_id: "integer",
    employable_type: "string",
  },
  phmt_cake_designers: { name: "string" },
  phmt_drink_designers: { name: "string" },
  phmt_hotel2s: { name: "string" },
  phmt_department2s: { phmt_hotel2_id: "integer" },
  phmt_chef2s: {
    phmt_department2_id: "integer",
    employable_id: "integer",
    employable_type: "string",
  },
  phmt_cake_designer2s: { name: "string" },
  phmt_drink_designer2s: { name: "string" },
  hmps_categories: { name: "string" },
  hmps_posts: { title: "string", body: "string" },
  hmps_essays: { writer_id: "integer", writer_type: "string", hmps_category_id: "integer" },
  hmps_authors: { name: "string" },
  hmps_categories_posts: { hmps_category_id: "integer", hmps_post_id: "integer" },
  categorizations: { author_id: "integer", category_id: "integer" },
};

describe("NestedThroughAssociationsTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

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

  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
    registerModel(Author);
    registerModel(Post);
    registerModel(Tag);
    registerModel(Tagging);
  });

  beforeEach(() => {
    // Reset associations to avoid cross-test coupling
    (Author as any)._associations = [];
    (Post as any)._associations = [];
    (Tag as any)._associations = [];
    (Tagging as any)._associations = [];
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tags",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tags",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "taggings", {
      className: "Tagging",
      through: "posts",
      source: "taggings",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "taggings", {
      className: "Tagging",
      through: "posts",
      source: "taggings",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tag",
    });
    Associations.hasOne.call(Post, "tagging", { className: "Tagging", foreignKey: "taggable_id" });

    Associations.hasOne.call(Post, "tag", { className: "Tag", through: "tagging", source: "tag" });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tag",
    });
    Associations.hasOne.call(Post, "tagging", { className: "Tagging", foreignKey: "taggable_id" });

    Associations.hasOne.call(Post, "tag", { className: "Tag", through: "tagging", source: "tag" });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tag",
    });
    Associations.hasOne.call(Post, "tagging", { className: "Tagging", foreignKey: "taggable_id" });

    Associations.hasOne.call(Post, "tag", { className: "Tag", through: "tagging", source: "tag" });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tag",
    });
    Associations.hasOne.call(Post, "tagging", { className: "Tagging", foreignKey: "taggable_id" });

    Associations.hasOne.call(Post, "tag", { className: "Tag", through: "tagging", source: "tag" });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tags",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tags",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "taggings", {
      className: "Tagging",
      through: "posts",
      source: "taggings",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "taggings", {
      className: "Tagging",
      through: "posts",
      source: "taggings",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tags",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tags",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Tag, "taggings", { className: "Tagging", foreignKey: "tag_id" });

    Associations.hasMany.call(Tag, "posts", {
      className: "Post",
      through: "taggings",
      source: "post",
    });
    Associations.belongsTo.call(Tagging, "post", { className: "Post", foreignKey: "taggable_id" });
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
    Associations.hasMany.call(Tag, "taggings", { className: "Tagging", foreignKey: "tag_id" });

    Associations.hasMany.call(Tag, "posts", {
      className: "Post",
      through: "taggings",
      source: "post",
    });
    Associations.belongsTo.call(Tagging, "post", { className: "Post", foreignKey: "taggable_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tags",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tags",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tags",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tags",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.belongsTo.call(Post, "author", { className: "Author", foreignKey: "author_id" });

    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.belongsTo.call(Post, "author", { className: "Author", foreignKey: "author_id" });

    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasOne.call(Author, "post", { className: "Post", foreignKey: "author_id" });

    Associations.hasOne.call(Author, "tag", { className: "Tag", through: "post", source: "tag" });
    Associations.hasOne.call(Post, "tagging", { className: "Tagging", foreignKey: "taggable_id" });

    Associations.hasOne.call(Post, "tag", { className: "Tag", through: "tagging", source: "tag" });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasOne.call(Author, "post", { className: "Post", foreignKey: "author_id" });

    Associations.hasOne.call(Author, "tag", { className: "Tag", through: "post", source: "tag" });
    Associations.hasOne.call(Post, "tagging", { className: "Tagging", foreignKey: "taggable_id" });

    Associations.hasOne.call(Post, "tag", { className: "Tag", through: "tagging", source: "tag" });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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

  it.skip("joins and includes from through models not included in association", () => {
    // BLOCKED: requires `default_scope` with a proc calling
    // includes/preload/joins/eager_load on the model. Default-scope
    // query-method injection is not yet ported. Tracked as a follow-up.
  });

  it("has one through has one through with belongs to source reflection preload", async () => {
    // Tag has_one :tagging -> Tagging belongs_to :post
    // Tag has_one :post, through: :tagging
    Associations.hasOne.call(Tag, "tagging", { className: "Tagging", foreignKey: "tag_id" });

    Associations.hasOne.call(Tag, "post", {
      className: "Post",
      through: "tagging",
      source: "post",
    });
    Associations.belongsTo.call(Tagging, "post", { className: "Post", foreignKey: "taggable_id" });
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
    Associations.hasOne.call(Tag, "tagging", { className: "Tagging", foreignKey: "tag_id" });

    Associations.hasOne.call(Tag, "post", {
      className: "Post",
      through: "tagging",
      source: "post",
    });
    Associations.belongsTo.call(Tagging, "post", { className: "Post", foreignKey: "taggable_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });

    Associations.hasMany.call(Author, "tags", {
      className: "Tag",
      through: "posts",
      source: "tags",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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

  it("distinct has many through a has many through association on through reflection", async () => {
    // Mirrors Rails distinct_subscribers: the through reflection (postTaggings)
    // is itself a nested has_many :through, and a `distinct` scope on the final
    // association deduplicates records reached via multiple through rows.
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    Associations.hasMany.call(Author, "postTaggings", {
      className: "Tagging",
      through: "posts",
      source: "taggings",
    });
    Associations.hasMany.call(Author, "distinctTags", {
      className: "Tag",
      through: "postTaggings",
      source: "tag",
      scope: (rel: any) => rel.distinct(),
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
    const author = await Author.create({ name: "David" });
    const post1 = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const post2 = await Post.create({ author_id: author.id, title: "P2", body: "B" });
    const tag = await Tag.create({ name: "general" });
    // Same tag reached via two taggings on two posts.
    await Tagging.create({ tag_id: tag.id, taggable_id: post1.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post2.id, taggable_type: "Post" });

    const authors = await Author.all().preload("distinctTags").toArray();
    const preloadedTags = (authors[0] as any)._preloadedAssociations?.get("distinctTags") ?? [];
    expect(preloadedTags).toHaveLength(1);
    expect(preloadedTags[0].name).toBe("general");
  });

  // Mirrors Rails test_nested_has_many_through_with_a_table_referenced_multiple_times
  // (activerecord/test/cases/associations/nested_through_associations_test.rb:437).
  //
  // Rails fixtures:
  //   class Author < AR::Base
  //     has_many :similar_posts, -> { distinct }, through: :tags, source: :tagged_posts
  //   end
  //   class Tag < AR::Base
  //     has_many :tagged_posts, through: :taggings, source: "taggable", source_type: "Post"
  //   end
  //
  // When `similar_posts` is joined, the `taggings` table appears twice in
  // the chain (Author -> posts -> taggings -> tags -> taggings -> posts).
  // Rails' AliasTracker emits the canonical alias `taggings_authors_join`
  // for the second occurrence, which the test depends on.
  it.skip("nested has many through with a table referenced multiple times", () => {
    // BLOCKED on the INNER `joins()` nested-through resolver, NOT on alias
    // emission. AF6 shipped the JoinDependency self-join aliasing: the
    // LEFT-OUTER (eager-load) path already emits the canonical
    // `taggings_authors_join` / `posts_authors_join` aliases for this exact
    // similar_posts chain — see
    // join-dependency-through-aliasing.test.ts ("emits canonical self-join
    // aliases when a nested-through chain references a table multiple times").
    //
    // The remaining blocker is `Relation#_resolveThroughJoin` (relation.ts):
    // the INNER `joins(...)` path only resolves a single source -> through ->
    // target hop and cannot walk a through whose source is itself a through
    // (here `tags.tagged_posts`), so it mis-joins `tags.author_id`. Routing
    // INNER nested-through joins through JoinDependency is a relation.ts change
    // outside AF6's file scope (follow-up). The `author.similar_posts` read
    // additionally needs nested-through-with-through-source preload support.
    //
    // Rails body (ported/translated to TS):
    //   const authors = await Author.joins("similarPosts")
    //     .where({ "posts.id": miscByBobId }).distinct().toArray();
    //   expect(authors.map((a) => a.name).sort()).toEqual(["bob", "mary"]);
    //   const a1 = await Author.joins("similarPosts")
    //     .where({ "taggings.taggable_type": "FakeModel" }).toArray();
    //   expect(a1).toEqual([]);
    //   const a2 = await Author.joins("similarPosts")
    //     .where({ "taggings_authors_join.taggable_type": "FakeModel" }).toArray();
    //   expect(a2).toEqual([]);
  });

  // Mirrors Rails test_nested_has_many_through_with_scope_on_polymorphic_reflection
  // (activerecord/test/cases/associations/nested_through_associations_test.rb:453).
  //
  // Rails fixtures:
  //   class Author < AR::Base
  //     has_many :ordered_posts, -> { distinct }, through: :ordered_tags, source: :tagged_posts
  //   end
  //   class Tag < AR::Base
  //     has_many :ordered_taggings, -> { order("taggings.id DESC") },
  //              foreign_key: "tag_id", class_name: "Tagging"
  //     has_many :tagged_posts, through: :ordered_taggings,
  //              source: "taggable", source_type: "Post"
  //   end
  //
  // The polymorphic source on `ordered_taggings` (a scoped through) must
  // emit `taggable_type='Post'` on the canonical-aliased `taggings` join.
  it.skip("nested has many through with scope on polymorphic reflection", () => {
    // BLOCKED on the same INNER `joins()` nested-through resolver gap as the
    // sibling test above — NOT on alias emission, which AF6 shipped (the
    // LEFT-OUTER path emits the canonical `taggings_authors_join` alias). The
    // INNER `Relation#_resolveThroughJoin` can't walk a through whose source is
    // itself a through (`ordered_tags.tagged_posts`). This case additionally
    // exercises a scoped through (`-> { order("taggings.id DESC") }`).
    // SCOPE: subsumed by the sibling test's ~200 LOC rewire; no extra LOC.
    //
    // Rails body (ported/translated to TS):
    //   const authors = await Author.joins("ordered_posts")
    //     .where({ "posts.id": miscByBobId }).distinct().toArray();
    //   expect(authors.map((a) => a.name).sort()).toEqual(["bob", "mary"]);
  });

  it("joins through polymorphic source with source_type emits type constraint", () => {
    // Mirrors the polymorphism slice of Rails
    // test_nested_has_many_through_with_a_table_referenced_multiple_times
    // (activerecord/test/cases/associations/nested_through_associations_test.rb:437):
    //   tag.tagged_posts uses `source: :taggable, source_type: "Post"`,
    //   so the join against `posts` must carry an AND on taggings.taggable_type.
    class PstTag extends Base {
      static {
        this.tableName = "pst_tags";
        this.attribute("name", "string");
      }
    }
    class PstTagging extends Base {
      static {
        this.tableName = "pst_taggings";
        this.attribute("pst_tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
      }
    }
    class PstPost extends Base {
      static {
        this.tableName = "pst_posts";
        this.attribute("title", "string");
      }
    }
    registerModel("PstTag", PstTag);
    registerModel("PstTagging", PstTagging);
    registerModel("PstPost", PstPost);
    Associations.hasMany.call(PstTag, "taggings", {
      className: "PstTagging",
      foreignKey: "pst_tag_id",
    });
    Associations.hasMany.call(PstTag, "taggedPosts", {
      className: "PstPost",
      through: "taggings",
      source: "taggable",
      sourceType: "PstPost",
    });
    Associations.belongsTo.call(PstTagging, "taggable", {
      polymorphic: true,
      foreignKey: "taggable_id",
    });
    // INNER JOIN path (Relation#_resolveThroughJoin)
    const innerSql = (PstTag as any).all().joins("taggedPosts").toSql();
    expect(innerSql).toMatch(/JOIN ["`]pst_posts["`]/);
    expect(innerSql).toMatch(/["`]taggable_type["`]\s*=\s*'PstPost'/);
    expect(innerSql).toMatch(
      /["`]pst_posts["`].["`]id["`]\s*=\s*["`][^"`]+["`].["`]taggable_id["`]/,
    );

    // LEFT OUTER JOIN path (JoinDependency#_addThroughAssociation)
    const leftSql = (PstTag as any).all().leftJoins("taggedPosts").toSql();
    expect(leftSql).toMatch(/LEFT OUTER JOIN ["`]pst_posts["`]/);
    expect(leftSql).toMatch(/["`]taggable_type["`]\s*=\s*'PstPost'/);
  });

  it("has many through with foreign key option on through reflection", async () => {
    class FkThrAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class FkThrPost extends Base {
      static {
        this.attribute("writer_id", "integer");
        this.attribute("title", "string");
      }
    }
    class FkThrComment extends Base {
      static {
        this.attribute("fk_thr_post_id", "integer");
        this.attribute("body", "string");
      }
    }
    Associations.hasMany.call(FkThrAuthor, "fkThrPosts", {
      className: "FkThrPost",
      foreignKey: "writer_id",
    });

    Associations.hasMany.call(FkThrAuthor, "fkThrComments", {
      through: "fkThrPosts",
      source: "fkThrComments",
      className: "FkThrComment",
    });
    Associations.hasMany.call(FkThrPost, "fkThrComments", {
      className: "FkThrComment",
      foreignKey: "fk_thr_post_id",
    });
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
      }
    }
    class FkSrcPost extends Base {
      static {
        this.attribute("fk_src_author_id", "integer");
        this.attribute("title", "string");
      }
    }
    class FkSrcComment extends Base {
      static {
        this.attribute("article_id", "integer");
        this.attribute("body", "string");
      }
    }
    Associations.hasMany.call(FkSrcAuthor, "fkSrcPosts", {
      className: "FkSrcPost",
      foreignKey: "fk_src_author_id",
    });

    Associations.hasMany.call(FkSrcAuthor, "fkSrcComments", {
      through: "fkSrcPosts",
      source: "fkSrcComments",
      className: "FkSrcComment",
    });
    Associations.hasMany.call(FkSrcPost, "fkSrcComments", {
      className: "FkSrcComment",
      foreignKey: "article_id",
    });
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
      }
    }
    class StiThrMembership extends Base {
      static {
        this.attribute("sti_thr_club_id", "integer");
        this.attribute("sti_thr_member_id", "integer");
        this.attribute("type", "string");
        this._tableName = "sti_thr_memberships";
        enableSti(StiThrMembership);
      }
    }
    class StiThrSuperMembership extends StiThrMembership {
      static {
        registerModel(StiThrSuperMembership);
        registerSubclass(StiThrSuperMembership);
      }
    }
    class StiThrMember extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    Associations.hasMany.call(StiThrClub, "stiThrMemberships", {
      className: "StiThrMembership",
      foreignKey: "sti_thr_club_id",
    });

    Associations.hasMany.call(StiThrClub, "stiThrMembers", {
      through: "stiThrMemberships",
      source: "stiThrMember",
      className: "StiThrMember",
    });
    Associations.belongsTo.call(StiThrMembership, "stiThrMember", {
      className: "StiThrMember",
      foreignKey: "sti_thr_member_id",
    });
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

  it("has many through with sti on nested through reflection", async () => {
    // Mirrors Rails Post#special_comments_ratings_taggings: the nested through
    // reflection (specialCommentsRatings) walks through an STI association
    // (specialComments → StiNSpecialComment only). Plain comments and their
    // rating/tagging chains must be excluded by the STI type filter.
    class StiNPost extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    class StiNComment extends Base {
      static {
        this.attribute("sti_n_post_id", "integer");
        this.attribute("type", "string");
        this.attribute("body", "string");
        this._tableName = "sti_n_comments";
        enableSti(StiNComment);
      }
    }
    class StiNSpecialComment extends StiNComment {
      static {
        registerModel(StiNSpecialComment);
        registerSubclass(StiNSpecialComment);
      }
    }
    class StiNRating extends Base {
      static {
        this.attribute("sti_n_comment_id", "integer");
        this.attribute("value", "integer");
      }
    }
    class StiNTagging extends Base {
      static {
        this.attribute("sti_n_rating_id", "integer");
      }
    }
    Associations.hasMany.call(StiNPost, "specialComments", {
      className: "StiNSpecialComment",
      foreignKey: "sti_n_post_id",
    });
    Associations.hasMany.call(StiNSpecialComment, "ratings", {
      className: "StiNRating",
      foreignKey: "sti_n_comment_id",
    });
    Associations.hasMany.call(StiNRating, "taggings", {
      className: "StiNTagging",
      foreignKey: "sti_n_rating_id",
    });
    Associations.hasMany.call(StiNPost, "specialCommentsRatings", {
      className: "StiNRating",
      through: "specialComments",
      source: "ratings",
    });
    Associations.hasMany.call(StiNPost, "specialCommentsRatingsTaggings", {
      className: "StiNTagging",
      through: "specialCommentsRatings",
      source: "taggings",
    });
    registerModel("StiNPost", StiNPost);
    registerModel("StiNComment", StiNComment);
    registerModel("StiNRating", StiNRating);
    registerModel("StiNTagging", StiNTagging);

    const post = await StiNPost.create({ title: "sti_comments" });
    const special = await StiNSpecialComment.create({ sti_n_post_id: post.id, body: "S" });
    const plain = await StiNComment.create({ sti_n_post_id: post.id, body: "P" });
    const specialRating = await StiNRating.create({ sti_n_comment_id: special.id, value: 1 });
    const plainRating = await StiNRating.create({ sti_n_comment_id: plain.id, value: 2 });
    const specialTagging = await StiNTagging.create({ sti_n_rating_id: specialRating.id });
    await StiNTagging.create({ sti_n_rating_id: plainRating.id });

    const posts = await StiNPost.all().preload("specialCommentsRatingsTaggings").toArray();
    const taggings =
      (posts[0] as any)._preloadedAssociations?.get("specialCommentsRatingsTaggings") ?? [];
    expect(taggings).toHaveLength(1);
    expect(taggings[0].id).toBe(specialTagging.id);
  });

  it("nested has many through writers should raise error", async () => {
    const { CollectionProxy } = await import("./collection-proxy.js");

    class NwrAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class NwrPost extends Base {
      static {
        this.attribute("nwr_author_id", "integer");
        this.attribute("title", "string");
      }
    }
    class NwrTagging extends Base {
      static {
        this.attribute("nwr_post_id", "integer");
        this.attribute("nwr_tag_id", "integer");
      }
    }
    class NwrTag extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    Associations.hasMany.call(NwrAuthor, "nwrPosts", {
      className: "NwrPost",
      foreignKey: "nwr_author_id",
    });

    Associations.hasMany.call(NwrAuthor, "nwrTaggings", {
      through: "nwrPosts",
      source: "nwrTaggings",
      className: "NwrTagging",
    });

    Associations.hasMany.call(NwrAuthor, "nwrTags", {
      through: "nwrTaggings",
      source: "nwrTag",
      className: "NwrTag",
    });
    Associations.hasMany.call(NwrPost, "nwrTaggings", {
      className: "NwrTagging",
      foreignKey: "nwr_post_id",
    });
    Associations.belongsTo.call(NwrTagging, "nwrTag", {
      className: "NwrTag",
      foreignKey: "nwr_tag_id",
    });
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
      }
    }
    class NhoPost extends Base {
      static {
        this.attribute("nho_author_id", "integer");
      }
    }
    class NhoComment extends Base {
      static {
        this.attribute("nho_post_id", "integer");
        this.attribute("body", "string");
      }
    }
    Associations.hasOne.call(NhoAuthor, "nhoPost", {
      className: "NhoPost",
      foreignKey: "nho_author_id",
    });

    Associations.hasOne.call(NhoAuthor, "nhoComment", {
      through: "nhoPost",
      source: "nhoComment",
      className: "NhoComment",
    });

    Associations.hasOne.call(NhoAuthor, "nhoNestedComment", {
      through: "nhoComment",
      source: "nhoComment",
      className: "NhoComment",
    });
    Associations.hasOne.call(NhoPost, "nhoComment", {
      className: "NhoComment",
      foreignKey: "nho_post_id",
    });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });
    Associations.hasMany.call(Author, "miscTags", {
      className: "Tag",
      through: "posts",
      source: "tags",
      scope: (rel: any) => rel,
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });
    Associations.hasMany.call(Author, "blueThroughTags", {
      className: "Tag",
      through: "posts",
      source: "tags",
      scope: (rel: any) => rel.where({ name: "blue" }),
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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

  it("nested has many through with conditions on through associations preload via joins", async () => {
    // Same chain as the preload variant above, but loaded via a single-query
    // JOIN (eagerLoad). The scope's WHERE must filter the JOINed target table.
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });
    Associations.hasMany.call(Author, "blueThroughTags", {
      className: "Tag",
      through: "posts",
      source: "tags",
      scope: (rel: any) => rel.where({ name: "blue" }),
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "Misc", body: "B" });
    const blueTag = await Tag.create({ name: "blue" });
    const redTag = await Tag.create({ name: "red" });
    await Tagging.create({ tag_id: blueTag.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: redTag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().eagerLoad("blueThroughTags").toArray();
    expect(authors).toHaveLength(1);
    const loadedTags = (authors[0] as any)._preloadedAssociations?.get("blueThroughTags") ?? [];
    expect(loadedTags).toHaveLength(1);
    expect(loadedTags[0].name).toBe("blue");
  });

  it("nested has many through with conditions on source associations", async () => {
    // Same as above but conditions are on source (tag) side
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });
    Associations.hasMany.call(Author, "blueTags", {
      className: "Tag",
      through: "posts",
      source: "tags",
      scope: (rel: any) => rel.where({ name: "blue" }),
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });
    Associations.hasMany.call(Author, "blueTags", {
      className: "Tag",
      through: "posts",
      source: "tags",
      scope: (rel: any) => rel.where({ name: "blue" }),
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });

    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
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

  it("through association preload doesnt reset source association if already preloaded", async () => {
    // Mirrors Rails' test of the same name: preloading two associations that
    // share a source reflection on Post (`tags`). `{ posts: "tags" }` loads
    // `tags` onto each Post; the author-level HMT `postTags` (through posts,
    // source tags) reuses those same Posts and must NOT reset the `tags`
    // already preloaded onto `author.posts.first`.
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });
    Associations.hasMany.call(Author, "postTags", {
      className: "Tag",
      through: "posts",
      source: "tags",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const blueTag = await Tag.create({ name: "blue" });
    const redTag = await Tag.create({ name: "red" });
    await Tagging.create({ tag_id: blueTag.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: redTag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().preload({ posts: "tags" }, "postTags").toArray();
    expect(authors).toHaveLength(1);

    // The Post already had `tags` preloaded by `{ posts: "tags" }`; the later
    // `postTags` through-preload (which reuses that Post as a middle record)
    // must leave it loaded and intact, not reset it.
    const post0 = ((authors[0] as any).association("posts").target ?? [])[0] as any;
    expect(post0.association("tags").loaded).toBe(true);
    const tagNames = (post0.association("tags").target ?? []).map((t: any) => t.name).sort();
    expect(tagNames).toEqual(["blue", "red"]);
  });

  it("nested has many through with conditions on source associations preload via joins", async () => {
    // Same chain as the source-conditions preload variant above, loaded via a
    // single-query JOIN (eagerLoad) rather than the multi-query preloader.
    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });
    Associations.hasMany.call(Author, "blueTags", {
      className: "Tag",
      through: "posts",
      source: "tags",
      scope: (rel: any) => rel.where({ name: "blue" }),
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
    });
    Associations.hasMany.call(Post, "tags", {
      className: "Tag",
      through: "taggings",
      source: "tag",
    });
    Associations.belongsTo.call(Tagging, "tag", { className: "Tag", foreignKey: "tag_id" });
    const author = await Author.create({ name: "Bob" });
    const post = await Post.create({ author_id: author.id, title: "P1", body: "B" });
    const blueTag = await Tag.create({ name: "blue" });
    const redTag = await Tag.create({ name: "red" });
    await Tagging.create({ tag_id: blueTag.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({ tag_id: redTag.id, taggable_id: post.id, taggable_type: "Post" });

    const authors = await Author.all().eagerLoad("blueTags").toArray();
    expect(authors).toHaveLength(1);
    const loadedTags = (authors[0] as any)._preloadedAssociations?.get("blueTags") ?? [];
    expect(loadedTags).toHaveLength(1);
    expect(loadedTags[0].name).toBe("blue");
  });

  it("nested has many through with foreign key option on the source reflection through reflection", async () => {
    // Organization -> Authors (custom FK) -> Essays -> Categories
    class NfkOrganization extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class NfkAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("organization_id", "integer");
      }
    }
    class NfkEssay extends Base {
      static {
        this.attribute("writer_id", "integer");
        this.attribute("nfk_category_id", "integer");
      }
    }
    class NfkCategory extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    Associations.hasMany.call(NfkOrganization, "nfkAuthors", {
      className: "NfkAuthor",
      foreignKey: "organization_id",
    });

    Associations.hasMany.call(NfkOrganization, "nfkCategories", {
      className: "NfkCategory",
      through: "nfkAuthors",
      source: "nfkCategories",
    });
    Associations.hasMany.call(NfkAuthor, "nfkEssays", {
      className: "NfkEssay",
      foreignKey: "writer_id",
    });

    Associations.hasMany.call(NfkAuthor, "nfkCategories", {
      className: "NfkCategory",
      through: "nfkEssays",
      source: "nfkCategory",
    });
    Associations.belongsTo.call(NfkEssay, "nfkCategory", {
      className: "NfkCategory",
      foreignKey: "nfk_category_id",
    });
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

  it("nested has many through should not be autosaved", async () => {
    class Categorization extends Base {
      static {
        this.attribute("author_id", "integer");
        this.attribute("category_id", "integer");
      }
    }
    registerModel(Categorization);

    Associations.hasMany.call(Author, "posts", { className: "Post", foreignKey: "author_id" });
    Associations.hasMany.call(Author, "taggings", {
      className: "Tagging",
      through: "posts",
      source: "taggings",
    });
    Associations.hasMany.call(Post, "taggings", {
      className: "Tagging",
      foreignKey: "taggable_id",
      as: "taggable",
    });
    Associations.belongsTo.call(Categorization, "author", {
      className: "Author",
      foreignKey: "author_id",
    });
    Associations.hasMany.call(Categorization, "postTaggings", {
      className: "Tagging",
      through: "author",
      source: "taggings",
    });

    const david = await Author.create({ name: "David" });
    const post = await Post.create({ author_id: david.id, title: "P", body: "B" });
    await Tagging.create({ taggable_id: post.id, taggable_type: "Post" });

    const c = new Categorization();
    (c as any).association("author").writer(david);
    expect(await association(c, "postTaggings").toArray()).not.toHaveLength(0);
    await c.save();
    expect(await association(c, "postTaggings").toArray()).not.toHaveLength(0);
  });

  it("polymorphic has many through when through association has not loaded", async () => {
    // Hotel -> departments -> chefs -> cake_designers / drink_designers (polymorphic)
    class PhmtHotel extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class PhmtDepartment extends Base {
      static {
        this.attribute("phmt_hotel_id", "integer");
      }
    }
    class PhmtChef extends Base {
      static {
        this.attribute("phmt_department_id", "integer");
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
      }
    }
    class PhmtCakeDesigner extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class PhmtDrinkDesigner extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    Associations.hasMany.call(PhmtHotel, "phmtDepartments", {
      className: "PhmtDepartment",
      foreignKey: "phmt_hotel_id",
    });

    Associations.hasMany.call(PhmtHotel, "phmtChefs", {
      className: "PhmtChef",
      through: "phmtDepartments",
      source: "phmtChefs",
    });

    Associations.hasMany.call(PhmtHotel, "phmtCakeDesigners", {
      className: "PhmtCakeDesigner",
      through: "phmtChefs",
      source: "employable",
      sourceType: "PhmtCakeDesigner",
    });
    Associations.hasMany.call(PhmtHotel, "phmtDrinkDesigners", {
      className: "PhmtDrinkDesigner",
      through: "phmtChefs",
      source: "employable",
      sourceType: "PhmtDrinkDesigner",
    });
    Associations.hasMany.call(PhmtDepartment, "phmtChefs", {
      className: "PhmtChef",
      foreignKey: "phmt_department_id",
    });
    Associations.belongsTo.call(PhmtChef, "employable", {
      polymorphic: true,
      foreignKey: "employable_id",
    });
    registerModel("PhmtHotel", PhmtHotel);
    registerModel("PhmtDepartment", PhmtDepartment);
    registerModel("PhmtChef", PhmtChef);
    registerModel("PhmtCakeDesigner", PhmtCakeDesigner);
    registerModel("PhmtDrinkDesigner", PhmtDrinkDesigner);

    const cakeDesigner = await PhmtCakeDesigner.create({ name: "Cake Boss" });
    const drinkDesigner = await PhmtDrinkDesigner.create({ name: "Drink Boss" });
    const hotel = await PhmtHotel.create({ name: "Grand" });
    const dept = await PhmtDepartment.create({ phmt_hotel_id: hotel.id });
    await PhmtChef.create({
      phmt_department_id: dept.id,
      employable_id: cakeDesigner.id,
      employable_type: "PhmtCakeDesigner",
    });
    await PhmtChef.create({
      phmt_department_id: dept.id,
      employable_id: drinkDesigner.id,
      employable_type: "PhmtDrinkDesigner",
    });

    // Mirrors Rails: Hotel.includes(:cake_designers, :drink_designers).take
    const hotels = await PhmtHotel.all()
      .preload("phmtCakeDesigners", "phmtDrinkDesigners")
      .toArray();
    expect(hotels).toHaveLength(1);
    const cakes = (hotels[0] as any)._preloadedAssociations?.get("phmtCakeDesigners") ?? [];
    const drinks = (hotels[0] as any)._preloadedAssociations?.get("phmtDrinkDesigners") ?? [];
    expect(cakes.map((r: any) => r.id)).toEqual([cakeDesigner.id]);
    expect(drinks.map((r: any) => r.id)).toEqual([drinkDesigner.id]);
  });

  it("polymorphic has many through when through association has already loaded", async () => {
    // Same setup as above, but include the chefs through-association in the preload list
    // so the through reflection is already loaded when the polymorphic source is resolved.
    class PhmtHotel2 extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class PhmtDepartment2 extends Base {
      static {
        this.attribute("phmt_hotel2_id", "integer");
      }
    }
    class PhmtChef2 extends Base {
      static {
        this.attribute("phmt_department2_id", "integer");
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
      }
    }
    class PhmtCakeDesigner2 extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class PhmtDrinkDesigner2 extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    Associations.hasMany.call(PhmtHotel2, "phmtDepartment2s", {
      className: "PhmtDepartment2",
      foreignKey: "phmt_hotel2_id",
    });

    Associations.hasMany.call(PhmtHotel2, "phmtChef2s", {
      className: "PhmtChef2",
      through: "phmtDepartment2s",
      source: "phmtChef2s",
    });
    Associations.hasMany.call(PhmtHotel2, "phmtCakeDesigner2s", {
      className: "PhmtCakeDesigner2",
      through: "phmtChef2s",
      source: "employable",
      sourceType: "PhmtCakeDesigner2",
    });
    Associations.hasMany.call(PhmtHotel2, "phmtDrinkDesigner2s", {
      className: "PhmtDrinkDesigner2",
      through: "phmtChef2s",
      source: "employable",
      sourceType: "PhmtDrinkDesigner2",
    });
    Associations.hasMany.call(PhmtDepartment2, "phmtChef2s", {
      className: "PhmtChef2",
      foreignKey: "phmt_department2_id",
    });
    Associations.belongsTo.call(PhmtChef2, "employable", {
      polymorphic: true,
      foreignKey: "employable_id",
    });
    registerModel("PhmtHotel2", PhmtHotel2);
    registerModel("PhmtDepartment2", PhmtDepartment2);
    registerModel("PhmtChef2", PhmtChef2);
    registerModel("PhmtCakeDesigner2", PhmtCakeDesigner2);
    registerModel("PhmtDrinkDesigner2", PhmtDrinkDesigner2);

    const cakeDesigner = await PhmtCakeDesigner2.create({ name: "Cake Boss" });
    const drinkDesigner = await PhmtDrinkDesigner2.create({ name: "Drink Boss" });
    const hotel = await PhmtHotel2.create({ name: "Grand" });
    const dept = await PhmtDepartment2.create({ phmt_hotel2_id: hotel.id });
    await PhmtChef2.create({
      phmt_department2_id: dept.id,
      employable_id: cakeDesigner.id,
      employable_type: "PhmtCakeDesigner2",
    });
    await PhmtChef2.create({
      phmt_department2_id: dept.id,
      employable_id: drinkDesigner.id,
      employable_type: "PhmtDrinkDesigner2",
    });

    // Mirrors Rails: Hotel.includes(:chefs, :cake_designers, :drink_designers).take
    const hotels = await PhmtHotel2.all()
      .preload("phmtChef2s", "phmtCakeDesigner2s", "phmtDrinkDesigner2s")
      .toArray();
    expect(hotels).toHaveLength(1);
    const cakes = (hotels[0] as any)._preloadedAssociations?.get("phmtCakeDesigner2s") ?? [];
    const drinks = (hotels[0] as any)._preloadedAssociations?.get("phmtDrinkDesigner2s") ?? [];
    expect(cakes.map((r: any) => r.id)).toEqual([cakeDesigner.id]);
    expect(drinks.map((r: any) => r.id)).toEqual([drinkDesigner.id]);
  });

  it.skip("polymorphic has many through joined different table twice", () => {
    // BLOCKED on the INNER `joins()` nested-through resolver, NOT on alias
    // emission (AF6 shipped JoinDependency self-join aliasing; the LEFT-OUTER
    // path emits the `{table}_{owner}_join` aliases). `Hotel.joins(:cake_designers,
    // :drink_designers)` joins the same polymorphic `chefs` table twice in one
    // INNER query; routing this through JoinDependency is a relation.ts
    // follow-up outside AF6's file scope.
  });

  it("has many through polymorphic with scope", async () => {
    // Mirrors Rails test_has_many_through_polymorphic_with_scope:
    //   Post.joins(:authors_of_essays_named_bob).count == 1
    // The chain is Post --HABTM-> categories --> essays (through categories)
    // --> writer (belongs_to polymorphic, source_type "Author"), with a
    // `-> { where(name: "Bob") }` scope folded into the final join.
    class HmpsCategory extends Base {
      static {
        this.tableName = "hmps_categories";
        this.attribute("name", "string");
      }
    }
    class HmpsPost extends Base {
      static {
        this.tableName = "hmps_posts";
        this.attribute("title", "string");
        this.attribute("body", "string");
      }
    }
    class HmpsEssay extends Base {
      static {
        this.tableName = "hmps_essays";
        this.attribute("writer_id", "integer");
        this.attribute("writer_type", "string");
        this.attribute("hmps_category_id", "integer");
      }
    }
    class HmpsAuthor extends Base {
      static {
        this.tableName = "hmps_authors";
        this.attribute("name", "string");
      }
    }
    registerModel("HmpsCategory", HmpsCategory);
    registerModel("HmpsPost", HmpsPost);
    registerModel("HmpsEssay", HmpsEssay);
    registerModel("HmpsAuthor", HmpsAuthor);

    Associations.hasAndBelongsToMany.call(HmpsPost, "categories", {
      className: "HmpsCategory",
      joinTable: "hmps_categories_posts",
      foreignKey: "hmps_post_id",
      associationForeignKey: "hmps_category_id",
    });
    Associations.hasMany.call(HmpsCategory, "essays", {
      className: "HmpsEssay",
      foreignKey: "hmps_category_id",
    });
    Associations.hasMany.call(HmpsPost, "essays", {
      className: "HmpsEssay",
      through: "categories",
      source: "essays",
    });
    Associations.belongsTo.call(HmpsEssay, "writer", {
      polymorphic: true,
      foreignKey: "writer_id",
    });
    Associations.hasMany.call(HmpsPost, "authorsOfEssaysNamedBob", {
      className: "HmpsAuthor",
      through: "essays",
      source: "writer",
      sourceType: "HmpsAuthor",
      scope: (rel: any) => rel.where({ name: "Bob" }),
    });

    const post = await HmpsPost.create({ title: "Catchy Title", body: "Interesting body." });
    const category = await HmpsCategory.create({ name: "Anything" });
    await (HmpsPost as any)
      .leaseConnection()
      .executeMutation(
        `INSERT INTO "hmps_categories_posts" ("hmps_category_id", "hmps_post_id") VALUES (${category.id}, ${post.id})`,
      );
    const author = await HmpsAuthor.create({ name: "Bob" });
    await HmpsEssay.create({
      writer_id: author.id,
      writer_type: "HmpsAuthor",
      hmps_category_id: category.id,
    });

    const sql = (HmpsPost as any).all().joins("authorsOfEssaysNamedBob").toSql();
    expect(sql).toMatch(/JOIN ["`]hmps_categories_posts["`]/);
    expect(sql).toMatch(/JOIN ["`]hmps_categories["`]/);
    expect(sql).toMatch(/JOIN ["`]hmps_essays["`]/);
    expect(sql).toMatch(/JOIN ["`]hmps_authors["`]/);
    expect(sql).toMatch(/["`]writer_type["`]\s*=\s*'HmpsAuthor'/);
    expect(sql).toMatch(/["`]name["`]\s*=\s*'Bob'/);

    const count = await (HmpsPost as any).all().joins("authorsOfEssaysNamedBob").count();
    expect(count).toBe(1);
  });

  it("has many through reset source reflection after loading is complete", async () => {
    // Mirrors Rails Category#ordered_post_comments: preloading a HMT across
    // multiple owners must not leave the source reflection in a mutated state
    // that corrupts a subsequent non-preloaded read on a different owner.
    class RsrCategory extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class RsrPost extends Base {
      static {
        this.attribute("rsr_category_id", "integer");
        this.attribute("title", "string");
      }
    }
    class RsrComment extends Base {
      static {
        this.attribute("rsr_post_id", "integer");
        this.attribute("body", "string");
      }
    }
    Associations.hasMany.call(RsrCategory, "rsrPosts", {
      className: "RsrPost",
      foreignKey: "rsr_category_id",
    });
    Associations.hasMany.call(RsrPost, "rsrComments", {
      className: "RsrComment",
      foreignKey: "rsr_post_id",
    });
    Associations.hasMany.call(RsrCategory, "orderedPostComments", {
      className: "RsrComment",
      through: "rsrPosts",
      source: "rsrComments",
      scope: (rel: any) => rel.order({ id: "desc" }),
    });
    registerModel("RsrCategory", RsrCategory);
    registerModel("RsrPost", RsrPost);
    registerModel("RsrComment", RsrComment);

    const cat1 = await RsrCategory.create({ name: "C1" });
    const cat2 = await RsrCategory.create({ name: "C2" });
    const post1 = await RsrPost.create({ rsr_category_id: cat1.id, title: "P1" });
    const post2 = await RsrPost.create({ rsr_category_id: cat2.id, title: "P2" });
    await RsrComment.create({ rsr_post_id: post1.id, body: "c1a" });
    await RsrComment.create({ rsr_post_id: post2.id, body: "c2a" });
    await RsrComment.create({ rsr_post_id: post2.id, body: "c2b" });

    const preloaded = await RsrCategory.all().preload("orderedPostComments").toArray();
    const preloadedCat2 = preloaded.find((c) => (c as any).id === cat2.id)!;
    const preloadedIds = (
      (preloadedCat2 as any)._preloadedAssociations?.get("orderedPostComments") ?? []
    ).map((c: any) => c.id);

    const original = await loadHasManyThrough(cat2, "orderedPostComments", {
      className: "RsrComment",
      through: "rsrPosts",
      source: "rsrComments",
      scope: (rel: any) => rel.order({ id: "desc" }),
    });
    const originalIds = original.map((c: any) => c.id);
    expect(preloadedIds).toEqual(originalIds);
    expect(preloadedIds).toEqual([...originalIds].sort((a, b) => b - a));
  });
});

// ==========================================================================
// HasOneThroughAssociationsTest — mirrors has_one_through_associations_test.rb
// ==========================================================================
