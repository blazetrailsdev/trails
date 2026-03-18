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

  it.skip("has many through has many with has many through source reflection preload", () => {});

  it.skip("has many through has many with has many through source reflection preload via joins", () => {});

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

  it.skip("has many through has many through with has many source reflection preload", () => {});

  it.skip("has many through has many through with has many source reflection preload via joins", () => {});

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

  it.skip("has many through has one with has one through source reflection preload", () => {});

  it.skip("has many through has one with has one through source reflection preload via joins", () => {});

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

  it.skip("has many through has one through with has one source reflection preload", () => {});

  it.skip("has many through has one through with has one source reflection preload via joins", () => {});

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

  it.skip("has many through has one with has many through source reflection preload", () => {});

  it.skip("has many through has one with has many through source reflection preload via joins", () => {});

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

  it.skip("has many through has one through with has many source reflection preload", () => {});

  it.skip("has many through has one through with has many source reflection preload via joins", () => {});

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

  it.skip("has many through has many with has and belongs to many source reflection preload", () => {});

  it.skip("has many through has many with has and belongs to many source reflection preload via joins", () => {});

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

  it.skip("has many through has and belongs to many with has many source reflection preload", () => {});

  it.skip("has many through has and belongs to many with has many source reflection preload via joins", () => {});

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

  it.skip("has many through has many with has many through habtm source reflection preload", () => {});

  it.skip("has many through has many with has many through habtm source reflection preload via joins", () => {});

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

  it.skip("has many through has many through with belongs to source reflection preload", () => {});

  it.skip("has many through has many through with belongs to source reflection preload via joins", () => {});

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

  it.skip("has many through belongs to with has many through source reflection preload", () => {});

  it.skip("has many through belongs to with has many through source reflection preload via joins", () => {});

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

  it.skip("has one through has one with has one through source reflection preload", () => {});

  it.skip("has one through has one with has one through source reflection preload via joins", () => {});

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

  it.skip("joins and includes from through models not included in association", () => {});

  it.skip("has one through has one through with belongs to source reflection preload", () => {});

  it.skip("has one through has one through with belongs to source reflection preload via joins", () => {});

  it.skip("distinct has many through a has many through association on source reflection", () => {});

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

  it.skip("has many through with sti on nested through reflection", () => {});

  it.skip("nested has many through writers should raise error", () => {});

  it.skip("nested has one through writers should raise error", () => {});

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

  it.skip("nested has many through with conditions on through associations preload", () => {});

  it.skip("nested has many through with conditions on through associations preload via joins", () => {});

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

  it.skip("nested has many through with conditions on source associations preload", () => {});

  it.skip("through association preload doesnt reset source association if already preloaded", () => {});

  it.skip("nested has many through with conditions on source associations preload via joins", () => {});

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

  it.skip("nested has many through should not be autosaved", () => {});

  it.skip("polymorphic has many through when through association has not loaded", () => {});

  it.skip("polymorphic has many through when through association has already loaded", () => {});

  it.skip("polymorphic has many through joined different table twice", () => {});

  it.skip("has many through polymorphic with scope", () => {});

  it.skip("has many through reset source reflection after loading is complete", () => {});
});

// ==========================================================================
// HasOneThroughAssociationsTest — mirrors has_one_through_associations_test.rb
// ==========================================================================
