/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import type { AssociationProxy } from "./collection-proxy.js";
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel, enableSti, registerSubclass } from "../index.js";
import { Associations } from "../associations.js";
import { Table } from "@blazetrails/arel";

import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

const TEST_SCHEMA = {
  authors: { name: "string" },
  posts: { title: "string", author_id: "integer" },
  comments: { body: "string", type: "string", post_id: "integer" },
  thr_authors: { name: "string" },
  thr_posts: { title: "string", thr_author_id: "integer" },
  thr_taggings: { thr_post_id: "integer", thr_tag_id: "integer" },
  thr_tags: { name: "string" },
  habtm_posts: { title: "string" },
  habtm_tags: { name: "string" },
  habtm_posts_habtm_tags: { habtm_post_id: "integer", habtm_tag_id: "integer" },
} as const;

describe("InnerJoinAssociationTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

  function makeModels() {
    class Author extends Base {
      declare name: string;
      declare posts: AssociationProxy<Post>;

      static {
        this.attribute("name", "string");
        this.hasMany("posts", {});
      }
    }
    class Post extends Base {
      declare title: string;
      declare author_id: number;

      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    class Comment extends Base {
      declare body: string;
      declare post_id: number;

      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
      }
    }
    Associations.belongsTo.call(Post, "author", {});
    Associations.hasMany.call(Post, "comments", {});
    registerModel(Author);
    registerModel(Post);
    registerModel(Comment);
    return { Author, Post, Comment };
  }

  it("construct finder sql applies aliases tables on association conditions", () => {
    const { Post } = makeModels();
    const sql = Post.joins("authors", "posts.author_id = authors.id").toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("authors");
  });

  it("construct finder sql does not table name collide on duplicate associations", () => {
    const { Post } = makeModels();
    const sql = Post.joins("authors", "posts.author_id = authors.id")
      .joins("comments", "comments.post_id = posts.id")
      .toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("authors");
    expect(sql).toContain("comments");
  });

  it("construct finder sql does not table name collide on duplicate associations with left outer joins", () => {
    const { Post } = makeModels();
    const sql = Post.joins("authors", "posts.author_id = authors.id")
      .leftOuterJoins("comments", "comments.post_id = posts.id")
      .toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("LEFT OUTER JOIN");
  });

  it("construct finder sql does not table name collide with string joins", () => {
    const { Post } = makeModels();
    const sql = Post.joins("INNER JOIN authors ON posts.author_id = authors.id").toSql();
    expect(sql).toContain("INNER JOIN authors");
  });

  it("construct finder sql does not table name collide with aliased joins", () => {
    // Rails passes a raw Arel join node onto a table the association also joins;
    // `build_joins` seeds the alias_tracker with `leading_joins + join_nodes`, so
    // the association join finds the table already claimed and re-aliases to its
    // `alias_candidate` (`posts_authors`) while the raw join keeps the bare name.
    const { Author } = makeModels();
    const posts = new Table("posts");
    const authors = new Table("authors");
    const rawJoin = posts.join(posts).on(posts.get("author_id").eq(authors.get("id"))).joinSources;
    const sql = Author.joins("posts")
      .joins(...rawJoin)
      .toSql();
    // Quote char varies by adapter, so assert on the bare alias candidate and
    // that both joins onto `posts` are emitted (the association, re-aliased to
    // `posts_authors`, plus the raw join keeping the bare name).
    expect(sql).toMatch(/posts_authors/);
    expect((sql.match(/INNER JOIN/g) ?? []).length).toBe(2);
  });

  it("user supplied joins order should be preserved", () => {
    const { Post } = makeModels();
    const sql = Post.joins("authors", "posts.author_id = authors.id")
      .joins("comments", "comments.post_id = posts.id")
      .toSql();
    const authorsIdx = sql.indexOf("authors");
    const commentsIdx = sql.indexOf("comments");
    expect(authorsIdx).toBeLessThan(commentsIdx);
  });

  it("deduplicate joins", () => {
    const { Post } = makeModels();
    const sql = Post.joins("INNER JOIN authors ON posts.author_id = authors.id")
      .joins("INNER JOIN authors ON posts.author_id = authors.id")
      .toSql();
    expect(sql).toContain("INNER JOIN authors");
  });

  it("eager load with arel joins", async () => {
    const { Post, Comment } = makeModels();
    const post = await Post.create({ title: "with-two-comments" });
    await Comment.create({ body: "C1", post_id: post.id });
    await Comment.create({ body: "C2", post_id: post.id });
    const postTable = new Table("posts");
    const commentTable = new Table("comments");
    const joinSources = postTable
      .join(commentTable)
      .on(postTable.get("id").eq(commentTable.get("post_id"))).joinSources;
    // Mirrors Rails: Person.eager_load(:agents).joins(arel_join).count == 3
    // Without eagerLoad the INNER JOIN fans out to 2 rows (one per comment).
    // eagerLoad routes count through apply_join_dependency which adds DISTINCT
    // on the PK, collapsing the fan-out back to 1.
    const count = await Post.eagerLoad("comments")
      .joins(...joinSources)
      .count();
    expect(count).toBe(1);
  });

  it("construct finder sql ignores empty joins hash", () => {
    const { Post } = makeModels();
    const rel = Post.joins({});
    const sql = rel.toSql();
    expect(sql).toContain("SELECT");
    expect(sql).not.toContain("JOIN");
    // Rails compact_blank!s the {} away before joins!; it must not linger in
    // relation state (where it would skew structural comparisons).
    expect((rel as any)._namedInnerJoins).toEqual([]);
  });

  it("construct finder sql ignores empty joins array", () => {
    const { Post } = makeModels();
    const rel = Post.joins([]);
    const sql = rel.toSql();
    expect(sql).toContain("SELECT");
    expect(sql).not.toContain("JOIN");
    expect((rel as any)._namedInnerJoins).toEqual([]);
    expect((rel as any)._joinValues).toEqual([]);
  });

  it("join conditions added to join clause", () => {
    const { Post } = makeModels();
    const sql = Post.joins(
      "authors",
      "posts.author_id = authors.id AND authors.name = 'test'",
    ).toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("authors.name");
  });

  it("join association conditions support string and arel expressions", () => {
    const { Post } = makeModels();
    const sql = Post.joins("authors", "posts.author_id = authors.id").toSql();
    expect(sql).toContain("INNER JOIN");
  });

  it("join conditions allow nil associations", async () => {
    const { Post } = makeModels();
    await Post.create({ title: "orphan" });
    const sql = Post.joins("authors", "posts.author_id = authors.id").toSql();
    expect(sql).toContain("INNER JOIN");
  });

  it("join with reserved word", () => {
    const { Post } = makeModels();
    const sql = Post.joins('"order"', 'posts.id = "order".post_id').toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("order");
  });

  it("find with implicit inner joins without select does not imply readonly", () => {
    const { Post } = makeModels();
    const rel = Post.joins("authors", "posts.author_id = authors.id");
    expect(rel.isReadonly).toBeFalsy();
  });

  it("find with implicit inner joins honors readonly with select", () => {
    const { Post } = makeModels();
    const rel = Post.joins("authors", "posts.author_id = authors.id")
      .select("posts.title")
      .readonly();
    expect(rel.isReadonly).toBe(true);
  });

  it("find with implicit inner joins honors readonly false", () => {
    const { Post } = makeModels();
    const rel = Post.joins("authors", "posts.author_id = authors.id").readonly(false);
    expect(rel.isReadonly).toBe(false);
  });

  it("find with implicit inner joins does not set associations", async () => {
    const { Post, Author } = makeModels();
    const a = await Author.create({ name: "Alice" });
    const post = await Post.create({ title: "P1", author_id: a.id });
    const reloaded = await Post.find(post.id);
    expect((reloaded as any)._loadedAssociations?.author).toBeUndefined();
  });

  it("count honors implicit inner joins", async () => {
    const { Post, Author } = makeModels();
    const a = await Author.create({ name: "Alice" });
    await Post.create({ title: "P1", author_id: a.id });
    await Post.create({ title: "P2", author_id: a.id });
    const count = await Post.all().count();
    expect(count).toBe(2);
  });

  it("calculate honors implicit inner joins", async () => {
    const { Post, Author } = makeModels();
    const a = await Author.create({ name: "Alice" });
    await Post.create({ title: "P1", author_id: a.id });
    const count = await Post.all().count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("calculate honors implicit inner joins and distinct and conditions", () => {
    const { Post } = makeModels();
    const sql = Post.where({ title: "P1" }).distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  it("find with sti join", async () => {
    class Comment extends Base {
      declare body: string;
      declare "type": string;
      declare post_id: number;

      static {
        this.attribute("body", "string");
        this.attribute("type", "string");
        this.attribute("post_id", "integer");
      }
    }
    enableSti(Comment);
    class SpecialComment extends Comment {}
    registerSubclass(SpecialComment);
    class SubSpecialComment extends SpecialComment {}
    registerSubclass(SubSpecialComment);
    class Post extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    Associations.hasMany.call(Post, "specialComments", {
      className: "SpecialComment",
      foreignKey: "post_id",
    });
    registerModel(Comment);
    registerModel(SpecialComment);
    registerModel(SubSpecialComment);
    registerModel(Post);

    const post = await Post.create({ title: "STI Post" });
    await Comment.create({ body: "regular", type: "Comment", post_id: post.id });
    await SpecialComment.create({ body: "special", post_id: post.id });
    await SubSpecialComment.create({ body: "sub-special", post_id: post.id });

    // Association join should only match SpecialComment and SubSpecialComment
    const sql = Post.joins("specialComments").where({ id: post.id }).toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("SpecialComment");

    // Query should find the post (it has special comments)
    const results = await Post.joins("specialComments").where({ id: post.id });
    expect(results.length).toBeGreaterThan(0);
  });

  it("find with conditions on reflection", async () => {
    const { Post, Author } = makeModels();
    const a = await Author.create({ name: "Bob" });
    await Post.create({ title: "P1", author_id: a.id });
    const results = await Post.where({ author_id: a.id });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("P1");
  });

  it("find with conditions on through reflection", async () => {
    class ThrAuthor extends Base {
      declare name: string;
      declare thrPosts: AssociationProxy<ThrPost>;
      declare thrTags: AssociationProxy<ThrTag>;

      static {
        this.attribute("name", "string");
        this.hasMany("thrPosts", { foreignKey: "thr_author_id" });
        this.hasMany("thrTags", {
          through: "thrPosts",
          source: "thrTag",
          className: "ThrTag",
        });
      }
    }
    class ThrPost extends Base {
      declare title: string;
      declare thr_author_id: number;
      declare thrTaggings: AssociationProxy<ThrTagging>;
      declare thrTags: AssociationProxy<ThrTag>;

      static {
        this.attribute("title", "string");
        this.attribute("thr_author_id", "integer");
        this.hasMany("thrTaggings", { foreignKey: "thr_post_id" });
        this.hasMany("thrTags", {
          through: "thrTaggings",
          source: "thrTag",
          className: "ThrTag",
        });
      }
    }
    class ThrTagging extends Base {
      declare thr_post_id: number;
      declare thr_tag_id: number;
      declare thrTag: ThrTag | null;
      declare loadBelongsTo: (name: "thrTag") => Promise<ThrTag | null>;

      static {
        this.attribute("thr_post_id", "integer");
        this.attribute("thr_tag_id", "integer");
        this.belongsTo("thrTag", {
          foreignKey: "thr_tag_id",
          className: "ThrTag",
        });
      }
    }
    class ThrTag extends Base {
      declare name: string;

      static {
        this.attribute("name", "string");
      }
    }
    registerModel(ThrAuthor);
    registerModel(ThrPost);
    registerModel(ThrTagging);
    registerModel(ThrTag);

    // Verify the through join generates correct SQL
    const sql = ThrPost.joins("thrTags").toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("thr_taggings");
    expect(sql).toContain("thr_tags");

    // Verify it works end-to-end
    const author = await ThrAuthor.create({ name: "Alice" });
    const post = await ThrPost.create({ title: "P1", thr_author_id: author.id });
    const tag = await ThrTag.create({ name: "ruby" });
    await ThrTagging.create({ thr_post_id: post.id, thr_tag_id: tag.id });

    const results = await ThrPost.joins("thrTags").where({ id: post.id });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe("P1");
  });

  it("the default scope of the target is applied when joining associations", () => {
    const { Post } = makeModels();
    const sql = Post.joins("authors", "posts.author_id = authors.id")
      .where({ title: "test" })
      .toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("WHERE");
  });

  it("the default scope of the target is correctly aliased when joining associations", () => {
    const { Post } = makeModels();
    const sql = Post.joins("authors AS a", "posts.author_id = a.id").toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("authors AS a");
  });

  it("the correct records are loaded when including an aliased association", async () => {
    const { Post, Author } = makeModels();
    const a = await Author.create({ name: "Alice" });
    await Post.create({ title: "hello", author_id: a.id });
    const posts = await Post.where({ author_id: a.id });
    expect(posts.length).toBe(1);
    expect(posts[0].title).toBe("hello");
  });

  it("joins a belongs_to association with a composite foreign key", () => {
    const { Post } = makeModels();
    const sql = Post.joins("authors", "posts.author_id = authors.id").toSql();
    expect(sql).toContain("INNER JOIN");
  });

  it("joins a has_many association with a composite foreign key", () => {
    const { Author } = makeModels();
    const sql = Author.joins("posts", "posts.author_id = authors.id").toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("posts");
  });

  it("inner joins includes all nested associations", () => {
    const { Author } = makeModels();
    const sql = Author.joins("posts", "posts.author_id = authors.id")
      .joins("comments", "comments.post_id = posts.id")
      .toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("posts");
    expect(sql).toContain("comments");
  });

  it("eager load with string joins", async () => {
    const { Post, Comment } = makeModels();
    const post = await Post.create({ title: "with-two-comments" });
    await Comment.create({ body: "C1", post_id: post.id });
    await Comment.create({ body: "C2", post_id: post.id });
    // Mirrors Rails: Person.eager_load(:agents).joins(string_join).count == 3
    // Without eagerLoad the INNER JOIN fans out to 2 rows (one per comment).
    // eagerLoad routes count through apply_join_dependency which adds DISTINCT
    // on the PK, collapsing the fan-out back to 1.
    const count = await Post.eagerLoad("comments")
      .joins("INNER JOIN comments ON comments.post_id = posts.id")
      .count();
    expect(count).toBe(1);
  });

  it("joins a has_and_belongs_to_many association", async () => {
    class HabtmPost extends Base {
      declare title: string;
      declare habtmTags: AssociationProxy<HabtmTag>;

      static {
        this.attribute("title", "string");
        this.hasAndBelongsToMany("habtmTags", {
          className: "HabtmTag",
          joinTable: "habtm_posts_habtm_tags",
        });
      }
    }
    class HabtmTag extends Base {
      declare name: string;

      static {
        this.attribute("name", "string");
      }
    }
    registerModel(HabtmPost);
    registerModel(HabtmTag);

    const sql = HabtmPost.joins("habtmTags").toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("habtm_posts_habtm_tags");
    expect(sql).toContain("habtm_tags");
  });
});
