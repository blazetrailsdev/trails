import { describe, it, expect, beforeAll } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { assert, assertNot, assertNotRespondTo, assertRaises } from "@blazetrails/activesupport";
import { isEmpty } from "@blazetrails/ruby-compat";
import { sql as arelSql } from "@blazetrails/arel";
import { Relation } from "./index.js";
import { WhereClause } from "./relation/where-clause.js";
import { Base } from "./base.js";
import { registerModel } from "./associations.js";

import { fixtures } from "./test-fixtures.js";
import { quoteTableName as canonicalQuoteTableName } from "./support/quote-regex.js";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { HashMerger } from "./relation/merger.js";
import { Post as CanonPost, NullPost, FirstPost } from "./test-helpers/models/post.js";
import {
  Comment as CanonComment,
  SpecialComment as CanonSpecialComment,
} from "./test-helpers/models/comment.js";
import { Rating as CanonRating } from "./test-helpers/models/rating.js";
import { Author as CanonAuthor } from "./test-helpers/models/author.js";
import { Categorization as CanonCategorization } from "./test-helpers/models/categorization.js";
import { captureSql } from "./testing/sql-capture.js";
import { assertQueriesCount, assertQueriesMatch } from "./testing/query-assertions.js";

class EnsureRoundTripTypeCasting extends ValueType {
  override type(): string {
    return "string";
  }
  override cast(value: unknown): unknown {
    if (value == null) return value;
    if (value !== "value from user") throw new Error(String(value));
    return "cast value";
  }
  override deserialize(value: unknown): unknown {
    if (value == null) return value;
    if (value !== "type cast for database") throw new Error(String(value));
    return "type cast from database";
  }
  override serialize(value: unknown): unknown {
    if (value == null) return value;
    if (value !== "cast value") throw new Error(String(value));
    return "type cast for database";
  }
}

class UpdateAllTestModel extends Base {
  static {
    this._tableName = "posts";
    this.attribute("body", new EnsureRoundTripTypeCasting());
  }
}

describe("RelationTest", () => {
  fixtures(["posts", "comments", "authors", "authorAddresses", "ratings", "categorizations"]);

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
    await rel;
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

  it("select quotes when using from clause", async () => {
    const selected = (
      await CanonPost.select(":join").from(
        CanonPost.select(`id as ${canonicalQuoteTableName("join")}`),
      )
    ).map((p: any) => p.join);
    expect(selected.sort()).toEqual((await CanonPost.pluck("id")).sort());
  });

  it("relation with annotation includes comment in to sql", () => {
    const postWithAnnotation = CanonPost.where({ id: 1 }).annotate("foo");
    expect(postWithAnnotation.toSql()).toMatch(/= 1 \/\* foo \*\//);
  });

  it("scope for create", () => {
    const rel = CanonPost.where({ title: "scoped" });
    const attrs = rel.scopeForCreate();
    expect(attrs.title).toBe("scoped");
  });

  it("update all goes through normal type casting", async () => {
    await UpdateAllTestModel.updateAll({ body: "value from user", type: null });

    const first = await UpdateAllTestModel.first();
    expect((first as any).body).toBe("type cast from database");
  });

  it("no queries on empty relation exists?", async () => {
    await assertQueriesCount(0, false, async () => {
      await CanonPost.where({ id: [] }).exists(123);
    });
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
    const arr = await CanonPost.all();
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
    await assertQueriesCount(0, false, async () => {
      await CanonPost.all().exists({ id: [] });
    });
  });

  it("finding with subquery", () => {
    const subquery = CanonPost.where({ title: "a" }).select("id");
    const sql = CanonPost.where({ id: subquery }).toSql();
    expect(sql).toContain("IN");
  });

  it("find on hash conditions", async () => {
    await CanonPost.create({ title: "reltest-onhash", body: "b" });
    const results = await CanonPost.where({ title: "reltest-onhash" });
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

  it("relation with annotation includes comment in count query", async () => {
    const postWithAnnotation = CanonPost.annotate("foo");
    const allCount = (await CanonPost.all()).length;
    await assertQueriesMatch(/\/\* foo \*\//, undefined, false, async () => {
      expect(await postWithAnnotation.count()).toBe(allCount);
    });
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
    const table = CanonPost.arelTable;
    const relation = new Relation(CanonPost, table);
    expect(relation.model).toBe(CanonPost);
    expect(relation.table).toBe(table);
    assertNot(relation.isLoaded, "relation is not loaded");
  });

  it("initialize single values", () => {
    const relation = new Relation(CanonPost);
    for (const method of Relation.SINGLE_VALUE_METHODS.filter((m) => m !== "createWith")) {
      expect((relation as any)[`${method}Value`]).toBeNull();
    }
    const value = relation.createWithValue;
    expect(value).toEqual({});
    expect(Object.isFrozen(value)).toBeTruthy();
  });

  it("multi value initialize", () => {
    const relation = new Relation(CanonPost);
    for (const method of Relation.MULTI_VALUE_METHODS) {
      const values = (relation as any)[`${method}Values`];
      expect(values).toEqual([]);
      expect(Object.isFrozen(values)).toBeTruthy();
    }
  });

  it("extensions", () => {
    const relation = new Relation(CanonPost);
    expect(relation.extensions).toEqual([]);
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
    const relation = new Relation(CanonPost);
    expect(relation.scopeForCreate()).toEqual({});

    relation.whereBang({ id: 10 });
    expect(relation.scopeForCreate()).toEqual({ id: 10 });

    relation.createWithValue = { hello: "world" };
    expect(relation.scopeForCreate()).toEqual({ hello: "world", id: 10 });
  });

  it("empty scope", () => {
    const relation = new Relation(CanonPost);
    expect(relation.isEmptyScope).toBeTruthy();

    relation.mergeBang(relation);
    expect(relation.isEmptyScope).toBeTruthy();

    expect(NullPost.all().isEmptyScope).toBeFalsy();
    expect(FirstPost.all().isEmptyScope).toBeFalsy();
  });

  it("bad constants raise errors", async () => {
    await assertRaises([TypeError], {}, () => {
      new (Relation as any).HelloWorld();
    });
  });

  it("empty eager loading?", () => {
    const relation = new Relation(CanonPost);
    expect(relation.isEagerLoading).toBeFalsy();
  });

  it("eager load values", () => {
    const relation = new Relation(CanonPost);
    relation.eagerLoadBang(":comments");
    expect(relation.isEagerLoading).toBeTruthy();
  });

  it("references values", () => {
    let relation = new Relation(CanonPost);
    expect(relation.referencesValues).toEqual([]);
    relation = relation.references(":foo").references(":omg", ":lol");
    expect(relation.referencesValues).toEqual([":foo", ":omg", ":lol"]);
  });

  it("references values dont duplicate", () => {
    let relation = new Relation(CanonPost);
    relation = relation.references(":foo").references(":foo");
    expect(relation.referencesValues).toEqual([":foo"]);
  });

  it("merging a hash into a relation", () => {
    let relation = new Relation(CanonPost);
    relation = relation.merge({ where: { name: ":lol" }, readonly: true } as any);

    expect(relation.whereClause.toH()).toEqual({ name: ":lol" });
    expect(relation.readonlyValue).toBe(true);
  });

  it("merging an empty hash into a relation", () => {
    const merged = CanonPost.all().merge({} as any);
    expect(merged.whereClause).toEqual(WhereClause.empty());
  });

  it("merging a hash with unknown keys raises", async () => {
    await assertRaises([ArgumentError], {}, () => new HashMerger(null, { omg: "lol" }));
  });

  it("merging nil or false raises", async () => {
    let relation = new Relation(CanonPost);

    let e = await assertRaises([ArgumentError], {}, () => {
      relation = relation.merge(null as any);
    });

    expect(e.message).toBe("invalid argument: nil.");

    e = await assertRaises([ArgumentError], {}, () => {
      relation = relation.merge(false as any);
    });

    expect(e.message).toBe("invalid argument: false.");
  });

  it("relations can be created with a values hash", () => {
    const relation = new Relation(CanonPost, undefined, undefined, { select: [":foo"] });
    expect(relation.selectValues).toEqual([":foo"]);
  });

  it("merging a hash interpolates conditions", () => {
    class Klass extends CanonPost {
      static override sanitizeSql(args: unknown): string {
        if (JSON.stringify(args) !== JSON.stringify(["foo = ?", "bar"])) throw new Error();
        return "foo = bar";
      }
    }

    const relation = new Relation(Klass);
    relation.mergeBang({ where: ["foo = ?", "bar"] } as any);
    expect(relation.whereClause).toEqual(new WhereClause([arelSql("(foo = ?)", "bar")]));
  });

  it("merging readonly false", () => {
    const relation = CanonPost.all();
    const readonlyFalseRelation = CanonPost.all().readonly(false);
    expect(relation.merge(readonlyFalseRelation).isReadonly).toBe(false);
    expect(readonlyFalseRelation.merge(relation).isReadonly).toBe(false);
  });

  it("relation merging with joins as join dependency pick proper parent", async () => {
    const post = await CanonPost.create({ title: "haha", body: "huhu" });
    const comment = await (post as any).comments.create({ body: "hu" });
    for (let i = 0; i < 3; i++) await comment.ratings.create();

    const relation = CanonPost.joins(":comments").merge(CanonComment.joins(":ratings"));

    const ids = await relation.where({ id: (post as any).id }).pluck("id");
    expect(ids.length).toBe(3);
  });

  it("merge raises with invalid argument", () => {
    const rel = CanonPost.all();
    expect(() => rel.merge(true as any)).toThrow();
  });

  it("respond to for non selected element", async () => {
    let post = await CanonPost.select("title").first();
    assertNotRespondTo(
      post,
      "body",
      "post should not respond_to?(:body) since invoking it raises exception",
    );

    post = await CanonPost.select("'title' as post_title").first();
    assertNotRespondTo(
      post,
      "title",
      "post should not respond_to?(:body) since invoking it raises exception",
    );
  });

  it("selecting aliased attribute quotes column name when from is used", async () => {
    class KeywordColumn extends Base {
      static {
        this._tableName = "test_with_keyword_column_name";
        this.aliasAttribute("description", "desc");
      }
    }
    await KeywordColumn.create({ description: "foo" });

    expect(
      (await KeywordColumn.select("description").from(KeywordColumn.all())).map((r: any) => r.desc),
    ).toEqual(["foo"]);
    expect(
      (await KeywordColumn.reselect("description").from(KeywordColumn.all())).map(
        (r: any) => r.desc,
      ),
    ).toEqual(["foo"]);
  });

  it("relation merging keeps joining order", async () => {
    const authors = CanonAuthor.where({ id: 1 });
    const posts = CanonPost.joins(":author").merge(authors);
    const comments = CanonComment.joins(":post").merge(posts);
    const ratings = CanonRating.joins(":comment").merge(comments);

    expect(await ratings.count()).toBe(3);
  });

  it("relation with annotation includes comment in sql", async () => {
    const postWithAnnotation = CanonPost.where({ id: 1 }).annotate("foo");
    await assertQueriesMatch(/\/\* foo \*\//, undefined, false, async () => {
      assert(await postWithAnnotation.first(), "record should be found");
    });
  });

  it("relation with annotation chains sql comments", async () => {
    const postWithAnnotation = CanonPost.where({ id: 1 }).annotate("foo").annotate("bar");
    await assertQueriesMatch(/\/\* foo \*\/ \/\* bar \*\//, undefined, false, async () => {
      assert(await postWithAnnotation.first(), "record should be found");
    });
  });

  it("relation with annotation filters sql comment delimiters", () => {
    const postWithAnnotation = CanonPost.where({ id: 1 }).annotate("**//foo//**");
    expect(postWithAnnotation.toSql()).toContain("= 1 /* ** //foo// ** */");
  });

  it("relation without annotation does not include an empty comment", async () => {
    const log = await captureSql(async () => {
      await CanonPost.where({ id: 1 }).first();
    });

    expect(isEmpty(log)).toBeFalsy();
    expect(isEmpty(log.filter((query) => /\/\*/.test(query)))).toBeTruthy();
  });

  it("relation with optimizer hints filters sql comment delimiters", () => {
    let postWithHint = CanonPost.where({ id: 1 }).optimizerHints("**//BADHINT//**");
    expect(postWithHint.toSql()).toContain("/*+ ** //BADHINT// ** */");
    postWithHint = CanonPost.where({ id: 1 }).optimizerHints("/*+ BADHINT */");
    expect(postWithHint.toSql()).toContain("/*+ BADHINT */");
  });

  it("skip preloading after arel has been generated", () => {
    expect(() => {
      const relation = CanonComment.all();
      relation.arel();
      relation.skipPreloadingBang();
    }).not.toThrow();
  });

  it("no queries on empty IN", async () => {
    await assertQueriesCount(0, false, async () => {
      await CanonPost.where({ id: [] }).load();
    });
  });

  it("can unscope empty IN", async () => {
    await assertQueriesCount(1, false, async () => {
      await CanonPost.where({ id: [] }).unscope({ where: "id" }).load();
    });
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
    const relation = new Relation(CanonPost).whereBang({ title: ":foo" });
    const values = relation.values();

    values["where"] = null;
    expect(relation.whereClause).not.toBeNull();
  });

  it("does not duplicate optimizer hints on merge", () => {
    const escapedTable = canonicalQuoteTableName("posts");
    const expected = `SELECT /*+ OMGHINT */ ${escapedTable}.* FROM ${escapedTable}`;
    const query = CanonPost.optimizerHints("OMGHINT")
      .merge(CanonPost.optimizerHints("OMGHINT"))
      .toSql();
    expect(query).toBe(expected);
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

describe("RelationTest", () => {
  const { authors } = fixtures([
    "authors",
    "posts",
    "comments",
    "ratings",
    "categorizations",
    "categories",
  ]);

  beforeAll(() => {
    registerModel(CanonAuthor);
    registerModel(CanonPost);
    registerModel(CanonComment);
    registerModel(CanonSpecialComment);
    registerModel(CanonRating);
    registerModel(CanonCategorization);
  });

  it("relation merging with merged joins as strings", async () => {
    const joinString = `LEFT OUTER JOIN ${canonicalQuoteTableName("ratings")} ON ${canonicalQuoteTableName(
      "comments",
    )}.id = ${canonicalQuoteTableName("ratings")}.comment_id`;
    const specialCommentsWithRatings = CanonSpecialComment.joins(joinString);
    const postsWithSpecialCommentsWithRatings = CanonPost.group("posts.id")
      .joins(":specialComments")
      .merge(specialCommentsWithRatings);
    const merged = (authors("david") as any).posts.merge(postsWithSpecialCommentsWithRatings);

    expect(await merged.count()).toEqual(
      new Map([
        [2, 1],
        [4, 3],
        [5, 1],
      ]),
    );
  });

  it("relation merging with merged joins as symbols", async () => {
    const specialCommentsWithRatings = CanonSpecialComment.joins(":ratings");
    const postsWithSpecialCommentsWithRatings = CanonPost.group("posts.id")
      .joins(":specialComments")
      .merge(specialCommentsWithRatings);
    const merged = (authors("david") as any).posts.merge(postsWithSpecialCommentsWithRatings);

    expect(await merged.count()).toEqual(new Map([[4, 2]]));
  });

  it("relation merging with merged symbol joins keeps inner joins", async () => {
    const queries = await captureSql(async () => {
      await CanonAuthor.joins(":posts").merge(CanonPost.joins(":comments"));
    });

    const nbInnerJoin = queries.reduce(
      (sum, sql) => sum + (sql.match(/INNER\s+JOIN/gi)?.length ?? 0),
      0,
    );
    expect(nbInnerJoin).toBe(2);
    assert(
      queries.every((sql) => !/LEFT\s+(OUTER)?\s+JOIN/i.test(sql)),
      "Shouldn't have any LEFT JOIN in query",
    );
  });

  it("relation merging with merged symbol joins has correct size and count", async () => {
    const mergedAuthorsWithCommentedPostsRelation = CanonAuthor.joins(":posts").merge(
      CanonPost.joins(":comments"),
    );

    const postIdsWithAuthor = await CanonPost.joins(":author").pluck("id");
    const manualCommentsOnPostThatHaveAuthor = await CanonComment.where({
      post_id: postIdsWithAuthor,
    }).pluck("id");

    expect(await mergedAuthorsWithCommentedPostsRelation.count()).toBe(
      manualCommentsOnPostThatHaveAuthor.length,
    );
    expect((await mergedAuthorsWithCommentedPostsRelation).length).toBe(
      manualCommentsOnPostThatHaveAuthor.length,
    );
  });

  it("relation merging with merged symbol joins is aliased", async () => {
    const categorizationsWithAuthors = CanonCategorization.joins(":author");
    const queries = await captureSql(async () => {
      await CanonPost.joins(":author", ":categorizations")
        .merge(CanonAuthor.select("id"))
        .merge(categorizationsWithAuthors);
    });

    const nbInnerJoin = queries.reduce(
      (sum, sql) => sum + (sql.match(/INNER\s+JOIN/gi)?.length ?? 0),
      0,
    );
    expect(nbInnerJoin).toBe(3);

    const aliasPattern = new RegExp(
      `INNER\\s+JOIN\\s+${canonicalQuoteTableName("authors")}\\s+\\Wauthors_categorizations\\W`,
      "i",
    );
    assert(
      queries.some((sql) => aliasPattern.test(sql)),
      "Should be aliasing the child INNER JOINs in query",
    );
  });

  it("relation with merged joins aliased works", async () => {
    const categorizationsWithAuthors = CanonCategorization.joins(":author");
    const postsWithJoinsAndMerges = CanonPost.joins(":author", ":categorizations")
      .merge(CanonAuthor.select("id"))
      .merge(categorizationsWithAuthors);

    const authorWithPosts = await CanonAuthor.joins(":posts").pluck("id");
    const categorizationsWithAuthor = await CanonCategorization.joins(":author").pluck("id");
    const postsWithAuthorAndCategorizations = await CanonPost.joins(":categorizations")
      .where({ author_id: authorWithPosts, categorizations: { id: categorizationsWithAuthor } })
      .pluck("id");

    expect(await postsWithJoinsAndMerges.count()).toBe(postsWithAuthorAndCategorizations.length);
    expect((await postsWithJoinsAndMerges).length).toBe(postsWithAuthorAndCategorizations.length);
  });
});
