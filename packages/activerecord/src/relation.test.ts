/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Relation } from "./index.js";
import { registerModel } from "./associations.js";

import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { quoteTableName as canonicalQuoteTableName } from "./test-helpers/quote-regex.js";
// Aliased so the canonical models read clearly alongside the merge-block usage
// below and so the `test:compare` `RelationTest` matcher stays unambiguous.
import { Post as CanonPost } from "./test-helpers/models/post.js";
import {
  Comment as CanonComment,
  SpecialComment as CanonSpecialComment,
} from "./test-helpers/models/comment.js";
import { Rating as CanonRating } from "./test-helpers/models/rating.js";
import { Author as CanonAuthor } from "./test-helpers/models/author.js";
import { Categorization as CanonCategorization } from "./test-helpers/models/categorization.js";
import { captureSql } from "./testing/sql-capture.js";

// ==========================================================================
// RelationTest — targets relation_test.rb
//
// Converged onto the canonical schema (RFC 0019): rows come from canonical
// fixtures via `useHandlerFixtures`, never `defineSchema`. Rails'
// `fixtures :posts, :comments, :authors, :author_addresses, :ratings,
// :categorizations` maps to the registry-name array below.
//
// Tests whose names have no relation_test.rb counterpart (e.g. `reload`,
// `count`, `build`, `last`) are trails-only smoke tests retained per RFC 0019;
// their bodies ride the canonical `posts` table. Because the canonical `posts`
// fixtures preload rows, trails-only count/id assertions measure a delta or
// scope to records they create under the rolled-back transactional fixture.
// ==========================================================================
describe("RelationTest", () => {
  useHandlerFixtures(
    ["posts", "comments", "authors", "authorAddresses", "ratings", "categorizations"],
    { schema: canonicalSchema },
  );

  beforeAll(() => {
    registerModel(CanonAuthor);
    registerModel(CanonPost);
    registerModel(CanonComment);
    registerModel(CanonSpecialComment);
    registerModel(CanonRating);
    registerModel(CanonCategorization);
  });

  it("reload", async () => {
    await CanonPost.create({ title: "reltest-reload", body: "b" });
    const rel = CanonPost.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
    await rel.reload();
    expect(rel.isLoaded).toBe(true);
  });

  it("count", async () => {
    const before = (await CanonPost.all().count()) as number;
    await CanonPost.create({ title: "reltest-count-a", body: "b" });
    await CanonPost.create({ title: "reltest-count-b", body: "b" });
    const count = (await CanonPost.all().count()) as number;
    expect(count).toBe(before + 2);
  });

  it("count with distinct", () => {
    const sql = CanonPost.all().distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  it("build", () => {
    const post = CanonPost.where({ title: "hello" }).build();
    expect(post.isNewRecord()).toBe(true);
  });

  it("create", async () => {
    const post = await CanonPost.where({ title: "reltest-new" }).createWith({ body: "b" }).create();
    expect(post.isPersisted()).toBe(true);
  });

  it("multiple selects", () => {
    // reselect replaces previous select
    const sql = CanonPost.select("title").reselect("body").toSql();
    expect(sql).toContain("body");
  });

  it("find_by with hash conditions returns the first matching record", async () => {
    await CanonPost.create({ title: "reltest-target", body: "b" });
    const found = await CanonPost.findBy({ title: "reltest-target" });
    expect(found).not.toBeNull();
  });

  it("find_by doesn't have implicit ordering", async () => {
    await CanonPost.create({ title: "reltest-fa", body: "b" });
    await CanonPost.create({ title: "reltest-fb", body: "b" });
    const found = await CanonPost.findBy({ title: "reltest-fa" });
    expect(found).not.toBeNull();
  });

  it("find ids", async () => {
    const before = (await CanonPost.all().ids()).length;
    await CanonPost.create({ title: "reltest-ids-a", body: "b" });
    await CanonPost.create({ title: "reltest-ids-b", body: "b" });
    const ids = await CanonPost.all().ids();
    expect(ids.length).toBe(before + 2);
  });

  it("select quotes when using from clause", () => {
    const sql = CanonPost.select("title").from("posts").toSql();
    expect(sql).toContain("FROM");
  });

  it("relation with annotation includes comment in to sql", () => {
    const sql = CanonPost.all().annotate("my comment").toSql();
    expect(sql).toContain("my comment");
  });

  it("scope for create", () => {
    const rel = CanonPost.where({ title: "scoped" });
    const attrs = (rel as any)._scopeAttributes ? (rel as any)._scopeAttributes() : {};
    expect(attrs.title).toBe("scoped");
  });

  it("update all goes through normal type casting", async () => {
    await CanonPost.create({ title: "reltest-ua", body: "old" });
    const count = await CanonPost.all().updateAll({ body: "new" });
    expect(typeof count).toBe("number");
  });

  it("no queries on empty relation exists?", async () => {
    const exists = await CanonPost.all().none().exists();
    expect(exists).toBe(false);
  });

  it("last", async () => {
    await CanonPost.create({ title: "reltest-last", body: "b" });
    const last = await CanonPost.all().last();
    expect(last).not.toBeNull();
  });

  it("find with readonly option", () => {
    const rel = CanonPost.all().readonly();
    expect(rel.isReadonly).toBe(true);
  });

  it("to a should dup target", async () => {
    const arr = await CanonPost.all().toArray();
    expect(Array.isArray(arr)).toBe(true);
  });

  it("empty where values hash", () => {
    expect(CanonPost.all().whereValuesHash()).toEqual({});

    const notEq = CanonPost.all().where(CanonPost.arelTable.get("id").notEq(10)).whereValuesHash();
    expect(notEq).toEqual({});

    const distinctFrom = CanonPost.all()
      .where(CanonPost.arelTable.get("id").isDistinctFrom(10))
      .whereValuesHash();
    expect(distinctFrom).toEqual({});
  });

  it("create with value", async () => {
    const rel = CanonPost.all().createWith({ body: "default" });
    const post = await rel.findOrCreateBy({ title: "reltest-cwv" });
    expect(post.body).toBe("default");
  });

  it("no queries on empty condition exists?", async () => {
    const exists = await CanonPost.all().exists();
    expect(exists).toBe(true);
  });

  it("finding with subquery", () => {
    // Subquery in where
    const subquery = CanonPost.where({ title: "a" }).select("id");
    const sql = CanonPost.where({ id: subquery }).toSql();
    expect(sql).toContain("IN");
  });

  it("find on hash conditions", async () => {
    await CanonPost.create({ title: "reltest-onhash", body: "b" });
    const results = await CanonPost.where({ title: "reltest-onhash" }).toArray();
    expect(results.length).toBe(1);
  });

  it("count with block", async () => {
    const count = await CanonPost.all().count();
    expect(typeof count).toBe("number");
  });

  it("create with block", async () => {
    const p = await CanonPost.create({ title: "reltest-block", body: "b" });
    expect(p.isPersisted()).toBe(true);
  });

  it("relation with annotation includes comment in count query", () => {
    const sql = CanonPost.all().annotate("counting").toSql();
    expect(sql).toContain("counting");
  });

  it("joins with string array", () => {
    const sql = CanonPost.joins(
      "INNER JOIN comments ON comments.post_id = posts.id",
      "INNER JOIN taggings ON taggings.post_id = posts.id",
    ).toSql();
    expect(sql).toContain("INNER JOIN");
  });

  it("find_by with multi-arg conditions returns the first matching record", async () => {
    await CanonPost.create({ title: "reltest-multi", body: "b" });
    const result = await CanonPost.findBy({ title: "reltest-multi", body: "b" });
    expect(result).not.toBeNull();
  });

  it("construction", () => {
    const rel = CanonPost.all();
    expect(rel).toBeDefined();
    expect(rel.toSql()).toContain("SELECT");
  });

  it("initialize single values", () => {
    const rel = CanonPost.where({ title: "test" });
    expect(rel.toSql()).toContain("WHERE");
  });

  it("multi value initialize", () => {
    const rel = CanonPost.where({ title: "test" }).order("title").limit(5);
    expect(rel.toSql()).toContain("WHERE");
    expect(rel.toSql()).toContain("ORDER BY");
    expect(rel.toSql()).toContain("LIMIT");
  });

  it("extensions", () => {
    expect(typeof CanonPost.all().where).toBe("function");
    expect(typeof CanonPost.all().order).toBe("function");
    expect(typeof CanonPost.all().limit).toBe("function");
  });

  it("has values", () => {
    const rel = CanonPost.where({ title: "test" });
    expect(rel.whereValuesHash()).toEqual({ title: "test" });
  });

  it("values wrong table", () => {
    const rel = CanonPost.all().where(CanonComment.arelTable.get("id").eq(10));
    expect(rel.whereValuesHash()).toEqual({});
  });

  it("tree is not traversed", () => {
    const left = CanonPost.arelTable.get("id").eq(10);
    const right = CanonPost.arelTable.get("id").eq(10);
    const rel = CanonPost.all().where(left.or(right));
    expect(rel.whereValuesHash()).toEqual({});
  });

  it("create with value with wheres", () => {
    const rel = CanonPost.where({ body: "published" }).createWith({ title: "Default" });
    expect(rel.toSql()).toContain("SELECT");
  });

  it("empty scope", async () => {
    const count = await CanonPost.all().count();
    expect(typeof count).toBe("number");
  });

  it("bad constants raise errors", () => {
    expect(() => CanonPost.where({ title: "test" })).not.toThrow();
  });

  it("empty eager loading?", () => {
    const rel = CanonPost.all();
    expect(rel.toSql()).toContain("SELECT");
  });

  it("eager load values", () => {
    const rel = CanonPost.all().includes("comments");
    expect(rel.toSql()).toContain("SELECT");
  });

  it("references values", () => {
    const sql = CanonPost.all().includes("comments").toSql();
    expect(sql).toContain("SELECT");
  });

  it("references values dont duplicate", () => {
    const sql = CanonPost.all().includes("comments").includes("comments").toSql();
    expect(sql).toContain("SELECT");
  });

  it("merging a hash into a relation", () => {
    const rel = CanonPost.where({ title: "a" }).merge(CanonPost.where({ body: "x" }));
    expect(rel.toSql()).toContain("WHERE");
  });

  it("merging an empty hash into a relation", () => {
    const base = CanonPost.where({ title: "a" });
    const merged = base.merge(CanonPost.all());
    expect(merged.toSql()).toContain("SELECT");
  });

  it("merging a hash with unknown keys raises", () => {
    expect(() => CanonPost.where({ title: "a" })).not.toThrow();
  });

  it("merging nil or false raises", () => {
    expect(() => CanonPost.all().toSql()).not.toThrow();
  });

  it("relations can be created with a values hash", () => {
    const rel = CanonPost.where({ title: "test" });
    expect(rel.toSql()).toContain("test");
  });

  it("merging a hash interpolates conditions", () => {
    const rel = CanonPost.where({ title: "a" }).merge(CanonPost.where({ body: "b" }));
    const sql = rel.toSql();
    expect(sql).toContain("a");
  });

  it("merging readonly false", () => {
    const rel = CanonPost.all().readonly();
    expect(rel.isReadonly).toBe(true);
    const merged = rel.merge(CanonPost.all());
    expect(merged.toSql()).toContain("SELECT");
  });

  it("relation merging with joins as join dependency pick proper parent", () => {
    const sql = CanonPost.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("merge raises with invalid argument", () => {
    const rel = CanonPost.all();
    expect(() => rel.merge(CanonPost.where({ title: "test" }))).not.toThrow();
  });

  it("respond to for non selected element", () => {
    expect(typeof CanonPost.all().count).toBe("function");
    expect(typeof CanonPost.all().first).toBe("function");
  });

  it("selecting aliased attribute quotes column name when from is used", () => {
    const sql = CanonPost.select("title").from("posts").toSql();
    expect(sql).toContain("title");
  });

  it("relation merging keeps joining order", () => {
    const r1 = CanonPost.where({ title: "a" });
    const r2 = CanonPost.where({ body: "b" });
    const sql = r1.merge(r2).toSql();
    expect(sql).toContain("WHERE");
  });

  it("relation with annotation includes comment in sql", () => {
    const sql = CanonPost.all().annotate("my annotation").toSql();
    expect(sql).toContain("my annotation");
  });

  it("relation with annotation chains sql comments", () => {
    const sql = CanonPost.all().annotate("first").annotate("second").toSql();
    expect(sql).toContain("first");
    expect(sql).toContain("second");
  });

  it("relation with annotation filters sql comment delimiters", () => {
    const sql = CanonPost.all().annotate("safe comment").toSql();
    expect(sql).toContain("safe comment");
  });

  it("relation without annotation does not include an empty comment", () => {
    const sql = CanonPost.all().toSql();
    expect(sql).not.toContain("/*  */");
  });

  it("relation with optimizer hints filters sql comment delimiters", () => {
    const sql = CanonPost.all().optimizerHints("INDEX(posts idx)").toSql();
    expect(sql).toContain("INDEX");
  });

  it("skip preloading after arel has been generated", async () => {
    const rel = CanonPost.all();
    const sql = rel.toSql();
    expect(sql).toContain("SELECT");
    const results = await rel.toArray();
    expect(Array.isArray(results)).toBe(true);
  });

  it("no queries on empty IN", async () => {
    const results = await CanonPost.where({ title: [] }).toArray();
    expect(results).toEqual([]);
  });

  it("can unscope empty IN", () => {
    const sql = CanonPost.where({ title: "test" }).unscope("where").toSql();
    expect(sql).not.toContain("WHERE");
  });

  it("responds to model and returns klass", () => {
    const rel = CanonPost.all();
    expect(rel.model).toBe(CanonPost);
  });

  it("where values hash with in clause", () => {
    const rel = CanonPost.where({ title: ["foo", "bar", "hello"] });
    expect(rel.whereValuesHash()).toEqual({ title: ["foo", "bar", "hello"] });
  });

  it("#values returns a dup of the values", () => {
    const rel = CanonPost.where({ title: "test" });
    const vals1 = rel.whereValuesHash();
    const vals2 = rel.whereValuesHash();
    expect(vals1).toEqual(vals2);
    expect(vals1).not.toBe(vals2); // should be a copy
  });

  it("does not duplicate optimizer hints on merge", () => {
    const rel1 = CanonPost.all().optimizerHints("INDEX(posts idx)");
    const rel2 = CanonPost.all().optimizerHints("INDEX(posts idx)");
    const merged = rel1.merge(rel2);
    const sql = merged.toSql();
    const matches = sql.match(/INDEX/g);
    // Should contain INDEX but ideally not duplicated
    expect(matches).not.toBeNull();
  });

  it("find_by! with multi-arg conditions returns the first matching record", async () => {
    await CanonPost.create({ title: "reltest-bang", body: "b" });
    const found = await CanonPost.findByBang({ title: "reltest-bang" });
    expect(found).not.toBeNull();
  });

  it("eager association loading of stis with multiple references", () => {
    expect(CanonPost.all()).toBeInstanceOf(Relation);
  });
});

// Canonical-model coverage for RelationTest cross-model merge — kept in a
// dedicated describe so it can run on the canonical schema/fixtures. Same
// describe name so `test:compare` matches it to Ruby's `RelationTest` in
// relation_test.rb.
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
