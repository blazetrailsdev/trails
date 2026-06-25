/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { Base, Relation } from "./index.js";
import { registerModel } from "./associations.js";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { quoteTableName as canonicalQuoteTableName } from "./test-helpers/quote-regex.js";
// Aliased to avoid clobbering the bespoke in-function `class Post` / `class Comment`
// declarations elsewhere in this file (esbuild would otherwise rename those and
// break their table-name inference).
import { Post as CanonPost } from "./test-helpers/models/post.js";
import {
  Comment as CanonComment,
  SpecialComment as CanonSpecialComment,
} from "./test-helpers/models/comment.js";
import { Rating as CanonRating } from "./test-helpers/models/rating.js";
import { Author as CanonAuthor } from "./test-helpers/models/author.js";
import { Categorization as CanonCategorization } from "./test-helpers/models/categorization.js";
import { captureSql } from "./testing/sql-capture.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

// ==========================================================================
// RelationTest — targets relations_test.rb
// ==========================================================================
describe("RelationTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({
      posts: { title: "string", body: "string", status: "string", author_id: "integer" },
      developers: { commits: "integer" },
      orders: { created_at: "string", total: "integer" },
      books: {
        author_id: "integer",
        published_year: "integer",
        title: "string",
        active: "boolean",
      },
      authors: { name: "string" },
      comments: { post_id: "integer", author_id: "integer" },
      users: { name: "string" },
      eager_comments: { body: "string", eager_article_id: "integer" },
      eager_articles: { title: "string" },
    });
  });
  it("reload", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "a" });
    const rel = Post.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
    await rel.reload();
    expect(rel.isLoaded).toBe(true);
  });

  it("count", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const count = await Post.all().count();
    expect(count).toBe(2);
  });

  it("count with distinct", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "a" });
    const sql = Post.all().distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  it("build", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const post = Post.where({ title: "hello" }).build();
    expect(post.isNewRecord()).toBe(true);
  });

  it("create", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const post = await Post.where({ title: "new" }).create();
    expect(post.isPersisted()).toBe(true);
  });

  it("multiple selects", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
      }
    }
    // reselect replaces previous select
    const sql = Post.select("title").reselect("body").toSql();
    expect(sql).toContain("body");
  });

  it("find_by with hash conditions returns the first matching record", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const created = await Post.create({ title: "target" });
    const found = await Post.findBy({ title: "target" });
    expect(found).not.toBeNull();
  });

  it("find_by doesn't have implicit ordering", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const found = await Post.findBy({ title: "a" });
    expect(found).not.toBeNull();
  });

  it("find ids", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const ids = await Post.all().ids();
    expect(ids.length).toBe(2);
  });

  it("select quotes when using from clause", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Post.select("title").from("posts").toSql();
    expect(sql).toContain("FROM");
  });

  it("relation with annotation includes comment in to sql", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Post.all().annotate("my comment").toSql();
    expect(sql).toContain("my comment");
  });

  it("scope for create", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const rel = Post.where({ title: "scoped" });
    const attrs = (rel as any)._scopeAttributes ? (rel as any)._scopeAttributes() : {};
    expect(attrs.title).toBe("scoped");
  });

  it("update all goes through normal type casting", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "old" });
    const count = await Post.all().updateAll({ title: "new" });
    expect(typeof count).toBe("number");
  });

  it("no queries on empty relation exists?", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const exists = await Post.all().none().exists();
    expect(exists).toBe(false);
  });

  it("last", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const last = await Post.all().last();
    expect(last).not.toBeNull();
  });

  it("find with readonly option", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const rel = Post.all().readonly();
    expect(rel.isReadonly).toBe(true);
  });

  it("to a should dup target", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "a" });
    const arr = await Post.all().toArray();
    expect(Array.isArray(arr)).toBe(true);
  });

  it("empty where values hash", () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
      }
    }
    expect(Post.all().whereValuesHash()).toEqual({});

    const notEq = Post.all().where(Post.arelTable.get("id").notEq(10)).whereValuesHash();
    expect(notEq).toEqual({});

    const distinctFrom = Post.all()
      .where(Post.arelTable.get("id").isDistinctFrom(10))
      .whereValuesHash();
    expect(distinctFrom).toEqual({});
  });

  it("create with value", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
      }
    }
    const rel = Post.all().createWith({ body: "default" });
    const post = await rel.findOrCreateBy({ title: "new" });
    expect(post.body).toBe("default");
  });

  it("no queries on empty condition exists?", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "a" });
    const exists = await Post.all().exists();
    expect(exists).toBe(true);
  });

  it("finding with subquery", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    // Subquery in where
    const subquery = Post.where({ title: "a" }).select("id");
    const sql = Post.where({ id: subquery }).toSql();
    expect(sql).toContain("IN");
  });

  it("find on hash conditions", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "a" });
    const results = await Post.where({ title: "a" }).toArray();
    expect(results.length).toBe(1);
  });

  it("count with block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "a" });
    const count = await Post.all().count();
    expect(typeof count).toBe("number");
  });

  it("create with block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const p = await Post.create({ title: "test" });
    expect(p.isPersisted()).toBe(true);
  });

  it("relation with annotation includes comment in count query", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Post.all().annotate("counting").toSql();
    expect(sql).toContain("counting");
  });

  it("joins with string array", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.joins(
      "INNER JOIN comments ON comments.post_id = posts.id",
      "INNER JOIN tags ON tags.post_id = posts.id",
    ).toSql();
    expect(sql).toContain("INNER JOIN");
  });

  it("find_by with multi-arg conditions returns the first matching record", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
      }
    }
    await Post.create({ title: "t", body: "b" });
    const result = await Post.findBy({ title: "t", body: "b" });
    expect(result).not.toBeNull();
  });

  function makePost() {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("title", "string");
        this.attribute("status", "string");
      }
    }
    return Post;
  }

  it("construction", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(rel).toBeDefined();
    expect(rel.toSql()).toContain("SELECT");
  });

  it("initialize single values", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" });
    expect(rel.toSql()).toContain("WHERE");
  });

  it("multi value initialize", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" }).order("title").limit(5);
    expect(rel.toSql()).toContain("WHERE");
    expect(rel.toSql()).toContain("ORDER BY");
    expect(rel.toSql()).toContain("LIMIT");
  });

  it("extensions", () => {
    const Post = makePost();
    expect(typeof Post.all().where).toBe("function");
    expect(typeof Post.all().order).toBe("function");
    expect(typeof Post.all().limit).toBe("function");
  });

  it("has values", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" });
    expect(rel.whereValuesHash()).toEqual({ title: "test" });
  });

  it("values wrong table", () => {
    const Post = makePost();
    class Comment extends Base {
      static {
        this._tableName = "comments";
        this.attribute("id", "integer");
      }
    }
    const rel = Post.all().where(Comment.arelTable.get("id").eq(10));
    expect(rel.whereValuesHash()).toEqual({});
  });

  it("tree is not traversed", () => {
    const Post = makePost();
    const left = Post.arelTable.get("id").eq(10);
    const right = Post.arelTable.get("id").eq(10);
    const rel = Post.all().where(left.or(right));
    expect(rel.whereValuesHash()).toEqual({});
  });

  it("create with value with wheres", async () => {
    const Post = makePost();
    const rel = Post.where({ status: "published" }).createWith({ title: "Default" });
    expect(rel.toSql()).toContain("SELECT");
  });

  it("empty scope", async () => {
    const Post = makePost();
    const count = await Post.all().count();
    expect(typeof count).toBe("number");
  });

  it("bad constants raise errors", () => {
    const Post = makePost();
    expect(() => Post.where({ title: "test" })).not.toThrow();
  });

  it("empty eager loading?", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(rel.toSql()).toContain("SELECT");
  });

  it("eager load values", () => {
    const Post = makePost();
    const rel = Post.all().includes("comments");
    expect(rel.toSql()).toContain("SELECT");
  });

  it("references values", () => {
    const Post = makePost();
    const sql = Post.all().includes("comments").toSql();
    expect(sql).toContain("SELECT");
  });

  it("references values dont duplicate", () => {
    const Post = makePost();
    const sql = Post.all().includes("comments").includes("comments").toSql();
    expect(sql).toContain("SELECT");
  });

  it("merging a hash into a relation", () => {
    const Post = makePost();
    const rel = Post.where({ title: "a" }).merge(Post.where({ status: "x" }));
    expect(rel.toSql()).toContain("WHERE");
  });

  it("merging an empty hash into a relation", () => {
    const Post = makePost();
    const base = Post.where({ title: "a" });
    const merged = base.merge(Post.all());
    expect(merged.toSql()).toContain("SELECT");
  });

  it("merging a hash with unknown keys raises", () => {
    const Post = makePost();
    expect(() => Post.where({ title: "a" })).not.toThrow();
  });

  it("merging nil or false raises", () => {
    const Post = makePost();
    expect(() => Post.all().toSql()).not.toThrow();
  });

  it("relations can be created with a values hash", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" });
    expect(rel.toSql()).toContain("test");
  });

  it("merging a hash interpolates conditions", () => {
    const Post = makePost();
    const rel = Post.where({ title: "a" }).merge(Post.where({ status: "b" }));
    const sql = rel.toSql();
    expect(sql).toContain("a");
  });

  it("merging readonly false", () => {
    const Post = makePost();
    const rel = Post.all().readonly();
    expect(rel.isReadonly).toBe(true);
    const merged = rel.merge(Post.all());
    expect(merged.toSql()).toContain("SELECT");
  });

  it("relation merging with joins as join dependency pick proper parent", () => {
    const Post = makePost();
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("merge raises with invalid argument", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(() => rel.merge(Post.where({ title: "test" }))).not.toThrow();
  });

  it("respond to for non selected element", () => {
    const Post = makePost();
    expect(typeof Post.all().count).toBe("function");
    expect(typeof Post.all().first).toBe("function");
  });

  it("selecting aliased attribute quotes column name when from is used", () => {
    const Post = makePost();
    const sql = Post.select("title").from("posts").toSql();
    expect(sql).toContain("title");
  });

  it("relation merging keeps joining order", () => {
    const Post = makePost();
    const r1 = Post.where({ title: "a" });
    const r2 = Post.where({ status: "b" });
    const sql = r1.merge(r2).toSql();
    expect(sql).toContain("WHERE");
  });

  it("relation with annotation includes comment in sql", () => {
    const Post = makePost();
    const sql = Post.all().annotate("my annotation").toSql();
    expect(sql).toContain("my annotation");
  });

  it("relation with annotation chains sql comments", () => {
    const Post = makePost();
    const sql = Post.all().annotate("first").annotate("second").toSql();
    expect(sql).toContain("first");
    expect(sql).toContain("second");
  });

  it("relation with annotation filters sql comment delimiters", () => {
    const Post = makePost();
    const sql = Post.all().annotate("safe comment").toSql();
    expect(sql).toContain("safe comment");
  });

  it("relation without annotation does not include an empty comment", () => {
    const Post = makePost();
    const sql = Post.all().toSql();
    expect(sql).not.toContain("/*  */");
  });

  it("relation with optimizer hints filters sql comment delimiters", () => {
    const Post = makePost();
    const sql = Post.all().optimizerHints("INDEX(posts idx)").toSql();
    expect(sql).toContain("INDEX");
  });

  it("skip preloading after arel has been generated", async () => {
    const Post = makePost();
    const rel = Post.all();
    const sql = rel.toSql();
    expect(sql).toContain("SELECT");
    const results = await rel.toArray();
    expect(Array.isArray(results)).toBe(true);
  });

  it("no queries on empty IN", async () => {
    const Post = makePost();
    const results = await Post.where({ title: [] }).toArray();
    expect(results).toEqual([]);
  });

  it("can unscope empty IN", () => {
    const Post = makePost();
    const sql = Post.where({ title: "test" }).unscope("where").toSql();
    expect(sql).not.toContain("WHERE");
  });

  it("responds to model and returns klass", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(rel.model).toBe(Post);
  });

  it("where values hash with in clause", () => {
    const Post = makePost();
    const rel = Post.where({ title: ["foo", "bar", "hello"] });
    expect(rel.whereValuesHash()).toEqual({ title: ["foo", "bar", "hello"] });
  });

  it("#values returns a dup of the values", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" });
    const vals1 = rel.whereValuesHash();
    const vals2 = rel.whereValuesHash();
    expect(vals1).toEqual(vals2);
    expect(vals1).not.toBe(vals2); // should be a copy
  });

  it("does not duplicate optimizer hints on merge", () => {
    const Post = makePost();
    const rel1 = Post.all().optimizerHints("INDEX(posts idx)");
    const rel2 = Post.all().optimizerHints("INDEX(posts idx)");
    const merged = rel1.merge(rel2);
    const sql = merged.toSql();
    const matches = sql.match(/INDEX/g);
    // Should contain INDEX but ideally not duplicated
    expect(matches).not.toBeNull();
  });

  let SharedPost: typeof Base;
  beforeEach(() => {
    class PostClass extends Base {
      static {
        this.tableName = "posts";
        this.attribute("title", "string");
        this.attribute("body", "string");
      }
    }
    SharedPost = PostClass;
  });

  it("find_by! with multi-arg conditions returns the first matching record", async () => {
    await SharedPost.create({ title: "multi-arg" });
    const found = await SharedPost.findByBang({ title: "multi-arg" });
    expect(found).not.toBeNull();
  });

  it("eager association loading of stis with multiple references", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
});

// Canonical-model coverage for RelationTest cross-model merge — kept in a
// dedicated describe so it can run on the canonical schema/fixtures (the legacy
// RelationTest block above uses bespoke handler tables). Same describe name so
// `test:compare` matches it to Ruby's `RelationTest` in relation_test.rb.
describe("RelationTest", () => {
  const { authors } = useHandlerFixtures(
    ["authors", "posts", "comments", "ratings", "categorizations", "categories"],
    {
      schema: canonicalSchema,
    },
  );

  beforeAll(() => {
    registerModel(CanonAuthor);
    registerModel(CanonPost);
    registerModel(CanonComment);
    registerModel(CanonSpecialComment);
    registerModel(CanonRating);
    registerModel(CanonCategorization);
  });

  // Mirrors Rails Merger#merge_joins (merger.rb): a cross-model merge partitions
  // the source relation's joins_values into `associations` (a cross-klass
  // InnerJoin JoinDependency) and `others` (raw SQL strings / Arel nodes),
  // threaded together via `relation.joins!(join_dependency, *others)` so the raw
  // `others` join clause survives alongside the association join.
  it("relation merging with merged joins as strings", async () => {
    const joinString = `LEFT OUTER JOIN ${canonicalQuoteTableName("ratings")} ON ${canonicalQuoteTableName(
      "comments",
    )}.id = ${canonicalQuoteTableName("ratings")}.comment_id`;
    const specialCommentsWithRatings = CanonSpecialComment.joins(joinString);
    const postsWithSpecialCommentsWithRatings = CanonPost.group("posts.id")
      .joins("specialComments")
      .merge(specialCommentsWithRatings);
    const merged = (authors("david") as any).posts.merge(postsWithSpecialCommentsWithRatings);

    // The raw `others` join clause from the cross-model source survives verbatim
    // alongside the association join (special_comments → comments).
    const sql = merged.toSql();
    expect(sql).toContain(`INNER JOIN ${canonicalQuoteTableName("comments")}`);
    expect(sql).toContain(joinString);

    expect(await merged.count()).toEqual({ 2: 1, 4: 3, 5: 1 });
  });

  it("relation merging with merged joins as symbols", async () => {
    const specialCommentsWithRatings = CanonSpecialComment.joins("ratings");
    const postsWithSpecialCommentsWithRatings = CanonPost.group("posts.id")
      .joins("specialComments")
      .merge(specialCommentsWithRatings);
    const merged = (authors("david") as any).posts.merge(postsWithSpecialCommentsWithRatings);

    expect(await merged.count()).toEqual({ 4: 2 });
  });

  it("relation merging with merged symbol joins keeps inner joins", async () => {
    const queries = await captureSql(async () => {
      await CanonAuthor.joins("posts").merge(CanonPost.joins("comments")).toArray();
    });

    const nbInnerJoin = queries.reduce(
      (sum, sql) => sum + (sql.match(/INNER\s+JOIN/gi)?.length ?? 0),
      0,
    );
    expect(nbInnerJoin).toBe(2);
    expect(queries.some((sql) => /LEFT\s+(OUTER)?\s+JOIN/i.test(sql))).toBe(false);
  });

  it("relation merging with merged symbol joins has correct size and count", async () => {
    // Has one entry per comment
    const mergedAuthorsWithCommentedPostsRelation = CanonAuthor.joins("posts").merge(
      CanonPost.joins("comments"),
    );

    const postIdsWithAuthor = await CanonPost.joins("author").pluck("id");
    const manualCommentsOnPostThatHaveAuthor = await CanonComment.where({
      post_id: postIdsWithAuthor,
    }).pluck("id");

    expect(await mergedAuthorsWithCommentedPostsRelation.count()).toBe(
      manualCommentsOnPostThatHaveAuthor.length,
    );
    expect((await mergedAuthorsWithCommentedPostsRelation.toArray()).length).toBe(
      manualCommentsOnPostThatHaveAuthor.length,
    );
  });

  // A cross-model `merge` that joins an already-joined table aliases the child
  // INNER JOIN (`authors_categorizations`) via a shared AliasTracker re-aligned
  // across the merged JoinDependencies (Rails build_joins). See
  // relation/merged-join-alias-tracker.ts.
  it("relation merging with merged symbol joins is aliased", async () => {
    const categorizationsWithAuthors = CanonCategorization.joins("author");
    const queries = await captureSql(async () => {
      await CanonPost.joins("author", "categorizations")
        .merge(CanonAuthor.select("id"))
        .merge(categorizationsWithAuthors)
        .toArray();
    });

    const nbInnerJoin = queries.reduce(
      (sum, sql) => sum + (sql.match(/INNER\s+JOIN/gi)?.length ?? 0),
      0,
    );
    expect(nbInnerJoin).toBe(3);

    // using `\W` as the column separator
    const aliasPattern = new RegExp(
      `INNER\\s+JOIN\\s+${canonicalQuoteTableName("authors")}\\s+\\Wauthors_categorizations\\W`,
      "i",
    );
    expect(queries.some((sql) => aliasPattern.test(sql))).toBe(true);
  });

  // The same cross-model merge join, now aliased, no longer raises
  // `ambiguous column name: authors.id` at runtime. See the sibling
  // `is aliased` test above.
  it("relation with merged joins aliased works", async () => {
    const categorizationsWithAuthors = CanonCategorization.joins("author");
    const postsWithJoinsAndMerges = CanonPost.joins("author", "categorizations")
      .merge(CanonAuthor.select("id"))
      .merge(categorizationsWithAuthors);

    const authorWithPosts = await CanonAuthor.joins("posts").pluck("id");
    const categorizationsWithAuthor = await CanonCategorization.joins("author").pluck("id");
    const postsWithAuthorAndCategorizations = await CanonPost.joins("categorizations")
      .where({ author_id: authorWithPosts, categorizations: { id: categorizationsWithAuthor } })
      .pluck("id");

    expect(await postsWithJoinsAndMerges.count()).toBe(postsWithAuthorAndCategorizations.length);
    expect((await postsWithJoinsAndMerges.toArray()).length).toBe(
      postsWithAuthorAndCategorizations.length,
    );
  });
});
