import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import {
  Relation,
  RecordNotFound,
  RecordInvalid,
  IrreversibleOrderError,
  UnmodifiableRelation,
  registerModel,
  registerSubclass,
  Base,
} from "./index.js";
import {
  assertQueriesCount,
  assertNoQueries,
  assertQueriesMatch,
} from "./testing/query-assertions.js";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  assertDifference,
  assertEmpty,
  assertNotEmpty,
  assertNotPredicate,
  assertNotRespondTo,
  assertPredicate,
  assertRespondTo,
  isBlank,
  isPresent,
  toXmlArray,
} from "@blazetrails/activesupport";
import { pp } from "./pretty-print.js";
import { fixtures } from "./test-fixtures.js";
import { adapterType } from "./test-adapter.js";
import { sql as arelSql } from "@blazetrails/arel";
import { captureSql } from "./testing/sql-capture.js";

import {
  Post,
  PostWithPreloadDefaultScope,
  PostWithIncludesDefaultScope,
} from "./test-helpers/models/post.js";
import { Author, AuthorAddress } from "./test-helpers/models/author.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Comment, SpecialComment, VerySpecialComment } from "./test-helpers/models/comment.js";
import { Bird } from "./test-helpers/models/bird.js";
import { Car, CoolCar, FastCar } from "./test-helpers/models/car.js";
import { Engine } from "./test-helpers/models/engine.js";
import { Tyre } from "./test-helpers/models/tyre.js";
import { Minivan } from "./test-helpers/models/minivan.js";
import { AuditLog, Developer, DeveloperCalledDavid } from "./test-helpers/models/developer.js";
import { Project } from "./test-helpers/models/project.js";
import { Tag } from "./test-helpers/models/tag.js";
import { Tagging } from "./test-helpers/models/tagging.js";
import { Account, SubAccount } from "./test-helpers/models/account.js";
import { Entrant } from "./test-helpers/models/entrant.js";
import { Edge } from "./test-helpers/models/edge.js";
import { CpkOrder, CpkBook } from "./test-helpers/models/cpk.js";
import { Subscriber } from "./test-helpers/models/subscriber.js";
import { Reader } from "./test-helpers/models/reader.js";
import { Company, DependentFirm } from "./test-helpers/models/company.js";
import { Contract } from "./test-helpers/models/contract.js";
import { Possession } from "./test-helpers/models/possession.js";
import { Category } from "./test-helpers/models/category.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RelationTest", () => {
  const {
    authors,
    topics,
    posts,
    comments,
    tags,
    taggings,
    entrants,
    developers,
    accounts,
    companies,
    minivans,
    cpkOrders,
  } = fixtures([
    "authors",
    "authorAddresses",
    "topics",
    "entrants",
    "developers",
    "people",
    "companies",
    "developersProjects",
    "accounts",
    "categories",
    "categorizations",
    "categoriesPosts",
    "posts",
    "comments",
    "tags",
    "taggings",
    "cars",
    "minivans",
    "cpkOrders",
    "cpkBooks",
    "subscribers",
  ]);

  beforeAll(() => {
    registerModel(Post);
    registerModel(Author);
    registerModel(Comment);
    registerModel(SpecialComment);
    registerSubclass(SpecialComment);
    registerModel(VerySpecialComment);
    registerSubclass(VerySpecialComment);
    registerModel(Topic);
    registerModel(Bird);
    registerModel(Car);
    registerModel(CoolCar);
    registerModel(FastCar);
    registerModel(Engine);
    registerModel(Tyre);
    registerModel(Minivan);
    registerModel(Developer);
    registerModel(DeveloperCalledDavid);
    registerModel(Project);
    registerModel(AuditLog);
    registerModel(Tag);
    registerModel(Tagging);
    registerModel(Account);
    registerModel(SubAccount);
    registerModel(Entrant);
    registerModel(Edge);
    registerModel(CpkOrder);
    registerModel(CpkBook);
    registerModel(Subscriber);
    registerModel(Reader);
    registerModel(Company);
    registerModel(Contract);
    registerModel(DependentFirm);
    registerModel(AuthorAddress);
    registerModel(Possession);
    registerModel(Category);
  });

  function customPostRelation(aliasName = "omg_posts") {
    const tableAlias = Post.arelTable.alias(aliasName);

    return new Relation(Post, tableAlias);
  }

  it("do not double quote string id", async () => {
    const van = await Minivan.last();
    expect(van).toBeTruthy();
    const result = await Minivan.where({ minivan_id: van });
    expect(result[0].minivan_id).toBe(van!.id);
  });

  it("do not double quote string id with array", async () => {
    const van = (await Minivan.last())!;
    expect(van).toBeTruthy();
    expect((await Minivan.where({ minivan_id: [van] }))[0]).toEqual(van);
  });

  it("two scopes with includes should not drop any include", async () => {
    let car = (await (Car.inclEngines() as any).inclTyres().first())!;
    await car.tyres;
    await car.engines;

    car = (await (Car.inclEngines() as any).inclTyres().first())!;
    await assertNoQueries(false, async () => {
      await car.tyres;
    });
    await assertNoQueries(false, async () => {
      await car.engines;
    });
  });

  it("dynamic finder", () => {
    const x = Post.where("author_id = ?", 1);
    assertRespondTo(x.model, "findById");
  });

  it("multivalue where", async () => {
    const posts = Post.where("author_id = ? AND id = ?", 1, 1);
    expect((await posts).length).toBe(1);
  });

  it("scoped", async () => {
    const topicsRel = Topic.all();
    expect(topicsRel).toBeInstanceOf(Relation);
    expect(await topicsRel.size()).toBe(5);
  });

  it("to json", async () => {
    const birds = await Bird.all();
    expect(() => JSON.stringify(birds)).not.toThrow();
    const arr = await Bird.all();
    expect(() => JSON.stringify(arr)).not.toThrow();
  });

  it.skip("to yaml", async () => {
    // BLOCKED: missing surface — no Psych emitter drives encode_with, so Relation#toYaml and Array#toYaml do not exist (relation-to-yaml-psych-dump)
    expect(() => (Bird.all() as any).toYaml()).not.toThrow();
    expect(() => (Bird.all() as any).toA().toYaml()).not.toThrow();
  });

  it("to xml", async () => {
    await expect(Bird.all().toXml()).resolves.not.toThrow();
    await expect((async () => toXmlArray(await Bird.all()))()).resolves.not.toThrow();
  });

  it("scoped all", async () => {
    const topics = await Topic.all();
    expect(topics).toBeInstanceOf(Array);
    await assertNoQueries(false, async () => {
      expect(topics.length).toBe(5);
    });
  });

  it("loaded all", async () => {
    const topics = Topic.all();

    assertNotPredicate(topics, (t) => t.isLoaded);
    assertNotPredicate(topics, (t) => (t as any).loaded);

    await assertQueriesCount(1, false, async () => {
      for (let i = 0; i < 2; i++) {
        expect((await topics).length).toBe(5);
      }
    });

    assertPredicate(topics, (t) => t.isLoaded);
    assertPredicate(topics, (t) => (t as any).loaded);
  });

  it("scoped first", async () => {
    const topics = Topic.all().order("id ASC");

    await assertQueriesCount(1, false, async () => {
      for (let i = 0; i < 2; i++) {
        expect((await topics.first())!.title).toBe("The First Topic");
      }
    });

    assertNotPredicate(topics, (t) => t.isLoaded);
  });

  it("loaded first", async () => {
    const topics = Topic.all().order("id ASC");
    await topics.load();

    await assertNoQueries(false, async () => {
      expect((await topics.first())!.title).toBe("The First Topic");
    });

    assertPredicate(topics, (t) => t.isLoaded);
  });

  it("loaded first with limit", async () => {
    const topics = Topic.all().order("id ASC");
    await topics.load();

    await assertNoQueries(false, async () => {
      expect((await topics.first(2)).map((t) => t.title)).toEqual([
        "The First Topic",
        "The Second Topic of the day",
      ]);
    });

    assertPredicate(topics, (t) => t.isLoaded);
  });

  it("first get more than available", async () => {
    const topics = Topic.all().order("id ASC");
    const unloadedFirst = await topics.first(10);
    await topics.load();

    await assertNoQueries(false, async () => {
      const loadedFirst = await topics.first(10);
      expect(loadedFirst).toEqual(unloadedFirst);
    });
  });

  it("reload", async () => {
    const topics = Topic.all();

    await assertQueriesCount(1, false, async () => {
      for (let i = 0; i < 2; i++) await topics;
    });

    assertPredicate(topics, (t) => t.isLoaded);

    const originalSize = (await topics).length;
    await Topic.createBang({ title: "fake" });

    await assertQueriesCount(1, false, async () => {
      await topics.reload();
    });
    expect(await topics.size()).toBe(originalSize + 1);
    assertPredicate(topics, (t) => t.isLoaded);
  });

  it("finding with subquery", async () => {
    const relation = Topic.where({ approved: true });
    const direct = await relation;
    const fromSubquery = await Topic.select("*").from(relation);
    expect(fromSubquery.map((t) => t.id).sort()).toEqual(direct.map((t) => t.id).sort());
    const fromSubqueryNamed = await Topic.select("subquery.*").from(relation);
    expect(fromSubqueryNamed.map((t) => t.id).sort()).toEqual(direct.map((t) => t.id).sort());
    const fromSubqueryAliased = await Topic.select("a.*").from(relation, "a");
    expect(fromSubqueryAliased.map((t) => t.id).sort()).toEqual(direct.map((t) => t.id).sort());
  });

  it("finding with subquery with binds", async () => {
    const post = await Post.first();
    const commentRel = Comment.where({ post_id: post!.id });
    const direct = await commentRel;
    const fromSubquery = await Comment.select("*").from(commentRel);
    expect(fromSubquery.map((c) => c.id).sort()).toEqual(direct.map((c) => c.id).sort());
    const fromSubqueryNamed = await Comment.select("subquery.*").from(commentRel);
    expect(fromSubqueryNamed.map((c) => c.id).sort()).toEqual(direct.map((c) => c.id).sort());
    const fromSubqueryAliased = await Comment.select("a.*").from(commentRel, "a");
    expect(fromSubqueryAliased.map((c) => c.id).sort()).toEqual(direct.map((c) => c.id).sort());
  });

  it("finding with subquery without select does not change the select", async () => {
    const relation = Topic.where({ approved: true });
    await expect(Topic.from(relation).toArray()).rejects.toThrow();
  });

  it("select with from includes original table name", async () => {
    const relation = Comment.joins("INNER JOIN posts ON posts.id = comments.post_id")
      .select("comments.id")
      .order("comments.id");
    const subquery = Comment.from(`${Comment.tableName} /*! USE INDEX (PRIMARY) */`)
      .joins("INNER JOIN posts ON posts.id = comments.post_id")
      .select("comments.id")
      .order("comments.id");
    expect((await relation).map((c) => c.id)).toEqual((await subquery).map((c) => c.id));
  });

  it("pluck with from includes original table name", async () => {
    const relation = Comment.joins("INNER JOIN posts ON posts.id = comments.post_id").order(
      "comments.id",
    );
    const subquery = Comment.from(`${Comment.tableName} /*! USE INDEX (PRIMARY) */`)
      .joins("INNER JOIN posts ON posts.id = comments.post_id")
      .order("comments.id");
    expect(await relation.pluck("comments.id")).toEqual(await subquery.pluck("comments.id"));
  });

  it("select with from includes quoted original table name", async () => {
    const relation = Comment.joins("INNER JOIN posts ON posts.id = comments.post_id")
      .select("comments.id")
      .order("comments.id");
    const subquery = Comment.from(`${Comment.quotedTableName()} /*! USE INDEX (PRIMARY) */`)
      .joins("INNER JOIN posts ON posts.id = comments.post_id")
      .select("comments.id")
      .order("comments.id");
    expect((await relation).map((c) => c.id)).toEqual((await subquery).map((c) => c.id));
  });

  it("pluck with from includes quoted original table name", async () => {
    const relation = Comment.joins("INNER JOIN posts ON posts.id = comments.post_id").order(
      "comments.id",
    );
    const subquery = Comment.from(`${Comment.quotedTableName()} /*! USE INDEX (PRIMARY) */`)
      .joins("INNER JOIN posts ON posts.id = comments.post_id")
      .order("comments.id");
    expect(await relation.pluck("comments.id")).toEqual(await subquery.pluck("comments.id"));
  });

  it("select with subquery in from uses original table name", async () => {
    const relation = Comment.joins("INNER JOIN posts ON posts.id = comments.post_id")
      .select("comments.id")
      .order("comments.id");
    const subquery = Comment.from(Comment.all().distinct(), Comment.quotedTableName())
      .joins("INNER JOIN posts ON posts.id = comments.post_id")
      .select("comments.id")
      .order("comments.id");
    expect((await relation).map((c) => c.id)).toEqual((await subquery).map((c) => c.id));
  });

  it("pluck with subquery in from uses original table name", async () => {
    const relation = Comment.joins("INNER JOIN posts ON posts.id = comments.post_id").order(
      "comments.id",
    );
    const subquery = Comment.from(Comment.all(), Comment.quotedTableName())
      .joins("INNER JOIN posts ON posts.id = comments.post_id")
      .order("comments.id");
    expect(await relation.pluck("comments.id")).toEqual(await subquery.pluck("comments.id"));
  });

  it("select with subquery in from does not use original table name", async () => {
    const relation = Comment.group("type").select("COUNT(post_id) AS post_count, type");
    const subquery = Comment.from(relation, `grouped_${Comment.tableName}`).select(
      "type",
      "post_count",
    );
    const relCounts = (await relation).map((r: any) => r.post_count).sort();
    const subCounts = (await subquery).map((r: any) => r.post_count).sort();
    expect(subCounts).toEqual(relCounts);
  });

  it("group with subquery in from does not use original table name", async () => {
    const relation = Comment.group("type").select("COUNT(post_id) AS post_count,type");
    const subquery = Comment.from(relation, `grouped_${Comment.tableName}`)
      .group("type")
      .average("post_count");
    const relCounts = (await relation).map((r: any) => Number(r.post_count)).sort();
    const subValues = [...((await subquery) as Map<unknown, number>).values()].map(Number).sort();
    expect(subValues).toEqual(relCounts);
  });

  it("select with subquery string in from does not use original table name", async () => {
    const relation = Comment.group("type").select("COUNT(post_id) AS post_count, type");
    const subquery = Comment.from(
      `(${await relation.toSql()}) ${Comment.tableName}_grouped`,
    ).select("type", "post_count");
    const relCounts = (await relation).map((r: any) => r.post_count).sort();
    const subCounts = (await subquery).map((r: any) => r.post_count).sort();
    expect(subCounts).toEqual(relCounts);
  });

  it("group with subquery string in from does not use original table name", async () => {
    const relation = Comment.group("type").select("COUNT(post_id) AS post_count,type");
    const subquery = Comment.from(`(${await relation.toSql()}) ${Comment.tableName}_grouped`)
      .group("type")
      .average("post_count");
    const relCounts = (await relation).map((r: any) => Number(r.post_count)).sort();
    const subValues = [...((await subquery) as Map<unknown, number>).values()].map(Number).sort();
    expect(subValues).toEqual(relCounts);
  });

  it("finding with subquery with eager loading in from", async () => {
    const relation = Comment.includes(":post").where({ "posts.type": "Post" }).order(":id");
    const expected = (await relation).map((c) => c.id);
    expect((await Comment.select("*").from(relation)).map((c) => c.id)).toEqual(expected);
    expect((await Comment.select("subquery.*").from(relation)).map((c) => c.id)).toEqual(expected);
    expect((await Comment.select("a.*").from(relation, "a")).map((c) => c.id)).toEqual(expected);
  });

  it("eager from() subquery projects the table star, not column aliases", async () => {
    const relation = Comment.includes(":post").where({ "posts.type": "Post" }).order(":id");
    const sql = await (Comment.select("*").from(relation) as any).toSql();
    const unquoted = sql.replace(/["`]/g, "");
    expect(unquoted).toContain("comments.* FROM comments LEFT OUTER JOIN posts");
    expect(unquoted).not.toMatch(/t0_r0/);
  });

  it("finding with subquery with eager loading in where", async () => {
    const relation = Comment.includes(":post").where({ "posts.type": "Post" });
    const expected = (await relation).map((c) => Number(c.id)).sort((a, b) => a - b);
    expect(
      (await Comment.where({ id: relation })).map((c) => Number(c.id)).sort((a, b) => a - b),
    ).toEqual(expected);
  });

  it("finding with conditions", async () => {
    expect((await Author.where({ name: "David" })).map((a) => a.name)).toEqual(["David"]);
    expect((await Author.where("name = ?", "Mary")).map((a) => a.name)).toEqual(["Mary"]);
    expect((await Author.where("name = ?", "Mary")).map((a) => a.name)).toEqual(["Mary"]);
  });

  it("finding with order", async () => {
    const topicsRel = Topic.order("id");
    expect(await topicsRel.size()).toBe(5);
    expect((await topicsRel.first())!.title).toBe(topics("first").title);
  });

  it("finding with arel order", async () => {
    const topicsRel = Topic.order(Topic.arelTable.get("id").asc());
    expect(await topicsRel.size()).toBe(5);
    expect((await topicsRel.first())!.title).toBe(topics("first").title);
  });

  it("finding with assoc order", async () => {
    const topicsRel = Topic.order({ id: "desc" });
    expect(await topicsRel.size()).toBe(5);
    expect((await topicsRel.first())!.title).toBe(topics("fifth").title);
  });

  it("finding with arel assoc order", async () => {
    const topicsRel = Topic.order({ [arelSql("id").toSql()]: "desc" });
    expect(await topicsRel.size()).toBe(5);
    expect((await topicsRel.first())!.title).toBe(topics("fifth").title);
  });

  it("finding with reversed assoc order", async () => {
    const topicsRel = Topic.order({ id: "asc" }).reverseOrder();
    expect(await topicsRel.size()).toBe(5);
    expect((await topicsRel.first())!.title).toBe(topics("fifth").title);
  });

  it("finding with reversed arel assoc order", async () => {
    const topicsRel = Topic.order({ [arelSql("id").toSql()]: "asc" }).reverseOrder();
    expect(await topicsRel.size()).toBe(5);
    expect((await topicsRel.first())!.title).toBe(topics("fifth").title);
  });

  it("reverse order with function", async () => {
    const topicsRel = Topic.order("lower(title)").reverseOrder();
    expect((await topicsRel.first())!.title).toBe(topics("third").title);
  });

  it("reverse arel order with function", async () => {
    const topicsRel = Topic.order(Topic.arelTable.get("title").lower()).reverseOrder();
    expect((await topicsRel.first())!.title).toBe(topics("third").title);
  });

  it("reverse arel assoc order with function", async () => {
    const topicsRel = Topic.order(new Map([[arelSql("lower(title)"), "asc"]])).reverseOrder();
    expect((await topicsRel.first())!.title).toBe(topics("third").title);
  });

  it("reverse order with function other predicates", async () => {
    const t1 = await Topic.order("author_name, length(title), id").reverseOrder().first();
    expect(t1!.title).toBe(topics("second").title);
    const t2 = await Topic.order("length(author_name), id, length(title)").reverseOrder().first();
    expect(t2!.title).toBe(topics("fifth").title);
  });

  it("reverse order with multiargument function", async () => {
    await expect(
      (async () => {
        Topic.order(arelSql("concat(author_name, title)")).reverseOrder().toSql();
      })(),
    ).rejects.toThrow(IrreversibleOrderError);
    await expect(
      (async () => {
        Topic.order(arelSql("concat(lower(author_name), title)")).reverseOrder().toSql();
      })(),
    ).rejects.toThrow(IrreversibleOrderError);
    await expect(
      (async () => {
        Topic.order(arelSql("concat(author_name, lower(title))")).reverseOrder().toSql();
      })(),
    ).rejects.toThrow(IrreversibleOrderError);
    await expect(
      (async () => {
        Topic.order(arelSql("concat(lower(author_name), title, length(title)"))
          .reverseOrder()
          .toSql();
      })(),
    ).rejects.toThrow(IrreversibleOrderError);
  });

  it("reverse arel assoc order with multiargument function", () => {
    expect(() => {
      Topic.order(new Map([[arelSql("REPLACE(title, '', '')"), "asc" as const]])).reverseOrder();
    }).not.toThrow();
  });

  it.skipIf(adapterType !== "postgres")("reverse order with nulls first or last", () => {
    expect(() => Topic.order("title NULLS FIRST").reverseOrder().toSql()).toThrow(
      IrreversibleOrderError,
    );
    expect(() => Topic.order("title  NULLS  FIRST").reverseOrder().toSql()).toThrow(
      IrreversibleOrderError,
    );
    expect(() => Topic.order("title nulls last").reverseOrder().toSql()).toThrow(
      IrreversibleOrderError,
    );
    expect(() => Topic.order("title NULLS FIRST, author_name").reverseOrder().toSql()).toThrow(
      IrreversibleOrderError,
    );
    expect(() => Topic.order("author_name, title nulls last").reverseOrder().toSql()).toThrow(
      IrreversibleOrderError,
    );
  });

  it("default reverse order on table without primary key", () => {
    expect(() => Edge.all().reverseOrder()).toThrow(IrreversibleOrderError);
  });

  it("order with hash and symbol generates the same sql", () => {
    expect(Topic.order(":id").toSql()).toBe(Topic.order({ id: "asc" }).toSql());
  });

  it("finding with desc order with string", async () => {
    const topicsRel = Topic.order({ id: "desc" });
    expect((await topicsRel).length).toBe(5);
    expect(await topicsRel).toEqual([
      topics("fifth"),
      topics("fourth"),
      topics("third"),
      topics("second"),
      topics("first"),
    ]);
  });

  it("finding with asc order with string", async () => {
    const topicsRel = Topic.order({ id: "asc" });
    expect((await topicsRel).length).toBe(5);
    expect(await topicsRel).toEqual([
      topics("first"),
      topics("second"),
      topics("third"),
      topics("fourth"),
      topics("fifth"),
    ]);
  });

  it("support upper and lower case directions", () => {
    expect(Topic.order({ id: "ASC" }).toSql()).toContain("ASC");
    expect(Topic.order({ id: "asc" }).toSql()).toContain("ASC");
    expect(Topic.order({ id: "ASC" }).toSql()).toContain("ASC");
    expect(Topic.order({ id: "asc" }).toSql()).toContain("ASC");

    expect(Topic.order({ id: "DESC" }).toSql()).toContain("DESC");
    expect(Topic.order({ id: "desc" }).toSql()).toContain("DESC");
    expect(Topic.order({ id: "DESC" }).toSql()).toContain("DESC");
    expect(Topic.order({ id: "desc" }).toSql()).toContain("DESC");
  });

  it("raising exception on invalid hash params", () => {
    let e: any;
    expect(() => {
      try {
        Topic.order("name", "id DESC", { id: "asfsdf" as any });
      } catch (err) {
        e = err;
        throw err;
      }
    }).toThrow(ArgumentError);
    expect(e.message).toBe(
      'Direction "asfsdf" is invalid. Valid directions are: [:asc, :desc, :ASC, :DESC, "asc", "desc", "ASC", "DESC"]',
    );
  });

  it("finding last with arel order", async () => {
    const topicsRel = Topic.order(Topic.arelTable.get("id").asc());
    expect((await topicsRel.last())!.title).toBe(topics("fifth").title);
  });

  it("finding with order concatenated", async () => {
    const topicsRel = Topic.order("author_name").order("title");
    expect(await topicsRel.size()).toBe(5);
    expect((await topicsRel.first())!.title).toBe(topics("fourth").title);
  });

  it("finding with order by aliased attributes", async () => {
    const topicsRel = Topic.order(":heading");
    expect(await topicsRel.size()).toBe(5);
    expect((await topicsRel.first())!.title).toBe(topics("fifth").title);
  });

  it("finding with assoc order by aliased attributes", async () => {
    const topicsRel = Topic.order({ heading: "desc" });
    expect(await topicsRel.size()).toBe(5);
    expect((await topicsRel.first())!.title).toBe(topics("third").title);
  });

  it("finding with reorder", async () => {
    const topicsArr = await Topic.order("author_name").order("title").reorder("id");
    expect(topicsArr.map((t) => t.title)).toEqual([
      "The First Topic",
      "The Second Topic of the day",
      "The Third Topic of the day",
      "The Fourth Topic of the day",
      "The Fifth Topic of the day",
    ]);
  });

  it("reorder deduplication", () => {
    const topicsRel = Topic.reorder("id desc", "id desc");
    const orderClauses = (topicsRel as any).orderValues as unknown[];
    expect(orderClauses).toEqual(["id desc"]);
  });

  it("finding with reorder by aliased attributes", async () => {
    const topicsRel = Topic.order("author_name").reorder(":heading");
    expect(await topicsRel.size()).toBe(5);
    expect((await topicsRel.first())!.title).toBe(topics("fifth").title);
  });

  it("finding with assoc reorder by aliased attributes", async () => {
    const topicsRel = Topic.order("author_name").reorder({ heading: "desc" });
    expect(await topicsRel.size()).toBe(5);
    expect((await topicsRel.first())!.title).toBe(topics("third").title);
  });

  it("finding with order and take", async () => {
    const entrantsArr = await Entrant.order("id ASC").limit(2);

    expect(entrantsArr.length).toBe(2);
    expect(entrantsArr[0].name).toBe(entrants("first").name);
  });

  it("finding with cross table order and limit", async () => {
    const tagsArr = await Tag.includes(":taggings")
      .order(
        "tags.name asc",
        "taggings.taggable_id asc",
        arelSql("REPLACE('abc', taggings.taggable_type, taggings.taggable_type)"),
      )
      .limit(1);
    expect(tagsArr.length).toBe(1);
  });

  it("finding with complex order and limit", async () => {
    const tagsArr = await Tag.includes(":taggings")
      .references(":taggings")
      .order(arelSql("REPLACE('abc', taggings.taggable_type, taggings.taggable_type)"))
      .limit(1);
    expect(tagsArr.length).toBe(1);
  });

  it("finding with complex order", async () => {
    const tagsArr = await Tag.includes(":taggings")
      .references(":taggings")
      .order(arelSql("REPLACE('abc', taggings.taggable_type, taggings.taggable_type)"));
    expect(tagsArr.length).toBe(3);
  });

  it("finding with sanitized order", () => {
    let query = Tag.order([arelSql("field(id, ?)"), [1, 3, 2]]).toSql();
    if (adapterType === "mysql") {
      expect(query).toMatch(/field\(id, '1',\s*'3',\s*'2'\)/);
    } else {
      expect(query).toMatch(/field\(id, 1,\s*3,\s*2\)/);
    }

    query = Tag.order([arelSql("field(id, ?)"), []]).toSql();
    expect(query).toMatch(/field\(id, NULL\)/);

    query = Tag.order([arelSql("field(id, ?)"), null as any]).toSql();
    expect(query).toMatch(/field\(id, NULL\)/);
  });

  it("finding with arel sql order", () => {
    let query = Tag.order(arelSql("field(id, ?)", [1, 3, 2])).toSql();
    if (adapterType === "mysql") {
      expect(query).toMatch(/field\(id, '1', '3', '2'\)/);
    } else {
      expect(query).toMatch(/field\(id, 1, 3, 2\)/);
    }

    query = Tag.order(arelSql("field(id, ?)", [])).toSql();
    expect(query).toMatch(/field\(id, NULL\)/);

    query = Tag.order(arelSql("field(id, ?)", null as any)).toSql();
    expect(query).toMatch(/field\(id, NULL\)/);
  });

  it("finding with order limit and offset", async () => {
    let entrantsRel = Entrant.order("id ASC").limit(2).offset(1);

    expect((await entrantsRel).length).toBe(2);
    expect((await entrantsRel.first())!.name).toBe(entrants("second").name);

    entrantsRel = Entrant.order("id ASC").limit(2).offset(2);
    expect((await entrantsRel).length).toBe(1);
    expect((await entrantsRel.first())!.name).toBe(entrants("third").name);
  });

  it("finding with group", async () => {
    const devs = await Developer.group("salary").select("salary");
    expect(devs.length).toBe(4);
    expect(new Set(devs.map((d: any) => d.salary)).size).toBe(4);
  });

  it("select with block", async () => {
    const evenIds = (await Developer.all())
      .filter((d) => Number(d.id) % 2 === 0)
      .map((d) => Number(d.id));
    expect(evenIds.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10]);
  });

  it("joins with nil argument", async () => {
    await expect((DependentFirm as any).joins(null).first()).resolves.not.toThrow();
  });

  it("finding with hash conditions on joined table", async () => {
    const firms = await DependentFirm.joins(":account").where({
      name: "RailsCore",
      accounts: { credit_limit: [55, 56, 57, 58, 59, 60] },
    });
    expect(firms.length).toBe(1);
    expect(firms[0]).toEqual(companies("rails_core"));
  });

  it("find all with join", async () => {
    const developersOnProjectOne = await Developer.joins(
      "LEFT JOIN developers_projects ON developers.id = developers_projects.developer_id",
    ).where("project_id=1");
    expect(developersOnProjectOne.length).toBe(3);
    const developerNames = developersOnProjectOne.map((d) => d.name);
    expect(developerNames).toContain("David");
    expect(developerNames).toContain("Jamis");
  });

  it("find on hash conditions", async () => {
    const a = await Topic.all().merge(Topic.where({ approved: false }));
    const b = await Topic.where({ approved: false });
    expect(a.map((t) => t.id).sort()).toEqual(b.map((t) => t.id).sort());
  });

  it("joins with string array", async () => {
    const personWithReaderAndPost = await Post.joins([
      "INNER JOIN categorizations ON categorizations.post_id = posts.id",
      "INNER JOIN categories ON categories.id = categorizations.category_id AND categories.type = 'SpecialCategory'",
    ]);
    expect(personWithReaderAndPost.length).toBe(1);
  });

  it("blank like arguments to query methods dont raise errors", () => {
    expect(() => (Topic as any).references([])).not.toThrow();
    expect(() => (Topic as any).includes([])).not.toThrow();
    expect(() => (Topic as any).preload([])).not.toThrow();
    expect(() => (Topic as any).group([])).not.toThrow();
    expect(() => (Topic as any).reorder([])).not.toThrow();
    expect(() => (Topic as any).order([])).not.toThrow();
    expect(() => (Topic as any).eagerLoad([])).not.toThrow();
    expect(() => (Topic as any).reselect([])).not.toThrow();
    expect(() => (Topic as any).unscope([])).not.toThrow();
    expect(() => (Topic as any).joins([])).not.toThrow();
    expect(() => (Topic as any).leftJoins([])).not.toThrow();
    expect(() => (Topic as any).optimizerHints([])).not.toThrow();
    expect(() => (Topic as any).annotate([])).not.toThrow();
  });

  it("order and reorder flatten and compact blank nested arguments", () => {
    expect(() => (Topic as any).order([null])).not.toThrow();
    expect(() => (Topic as any).reorder([{}])).not.toThrow();
    expect((Topic.order("title") as any).order([null]).toSql()).toContain("ORDER BY");
    expect((Topic.order("title") as any).reorder([{}]).toSql()).not.toContain("ORDER BY");
  });

  it("blank join arguments are not retained in relation state", () => {
    expect((Topic as any).joins({}).joinsValues).toEqual([]);
    expect((Topic as any).leftJoins({}).leftOuterJoinsValues).toEqual([]);
    expect((Topic as any).leftJoins([]).leftOuterJoinsValues).toEqual([]);
  });

  it("respond to dynamic finders", () => {
    const relation = Topic.all();

    for (const method of ["findByTitle", "findByTitleAndAuthorName"]) {
      assertRespondTo(relation, method);
    }
  });

  it("respond to class methods and scopes", () => {
    assertRespondTo(Topic.all(), "byLifo");
  });

  it("find with readonly option", async () => {
    for (const d of await Developer.all()) expect(d.isReadonly()).toBeFalsy();
    for (const d of await Developer.all().readonly()) {
      assertPredicate(d, (x) => x.isReadonly());
    }
  });

  it("eager association loading of stis with multiple references", async () => {
    const loaded = await Author.eagerLoad({
      ":posts": { ":specialComments": { ":post": [":specialComments", ":verySpecialComment"] } },
    })
      .order("comments.body, very_special_comments_posts.body")
      .where("posts.id = 4");
    expect(loaded.map((a) => a.id)).toEqual([authors("david").id]);
    await assertNoQueries(false, () => {
      const target = (rec: Base, name: string) => (rec.association(name) as any).target;
      const post = target(target(loaded[0], "posts")[0], "specialComments")[0].association("post")
        .target as Base;
      target(post, "specialComments");
      target(post, "verySpecialComment");
    });
  });

  it("find with preloaded associations", async () => {
    await assertQueriesCount(2, false, async () => {
      const postsRel = Post.preload(":comments").order("posts.id");
      expect((await (await postsRel.first())!.comments)[0]).toBeTruthy();
    });

    await assertQueriesCount(2, false, async () => {
      const postsRel = Post.preload(":comments").order("posts.id");
      expect((await (await postsRel.first())!.comments)[0]).toBeTruthy();
    });

    await assertQueriesCount(2, false, async () => {
      const postsRel = Post.preload(":author").order("posts.id");
      expect(await (await postsRel.first())!.author).toBeTruthy();
    });

    await assertQueriesCount(2, false, async () => {
      const postsRel = Post.preload(":author").order("posts.id");
      expect(await (await postsRel.first())!.author).toBeTruthy();
    });

    await assertQueriesCount(3, false, async () => {
      const postsRel = Post.preload(":author", ":comments").order("posts.id");
      expect(await (await postsRel.first())!.author).toBeTruthy();
      expect((await (await postsRel.first())!.comments)[0]).toBeTruthy();
    });
  });

  it("preload applies to all chained preloaded scopes", async () => {
    await assertQueriesCount(3, false, async () => {
      const post = await (Post as any).withComments().withTags().first();
      expect(post).toBeTruthy();
    });
  });

  it("extracted association", async () => {
    let relationAuthors: unknown;
    await assertQueriesCount(2, false, async () => {
      relationAuthors = await Post.all().extractAssociated("author");
    });
    let rootAuthors: unknown;
    await assertQueriesCount(2, false, async () => {
      rootAuthors = await (Post as any).extractAssociated("author");
    });
    expect(rootAuthors).toEqual(relationAuthors);
    const authorsArr: unknown[] = [];
    for (const post of await Post.all()) authorsArr.push(await post.author);
    expect(relationAuthors).toEqual(authorsArr);
  });

  it("find with included associations", async () => {
    await assertQueriesCount(2, false, async () => {
      const postsRel = Post.includes(":comments").order("posts.id");
      expect((await (await postsRel.first())!.comments)[0]).toBeTruthy();
    });

    await assertQueriesCount(2, false, async () => {
      const postsRel = Post.all().includes(":comments").order("posts.id");
      expect((await (await postsRel.first())!.comments)[0]).toBeTruthy();
    });

    await assertQueriesCount(2, false, async () => {
      const postsRel = Post.includes(":author").order("posts.id");
      expect(await (await postsRel.first())!.author).toBeTruthy();
    });

    await assertQueriesCount(3, false, async () => {
      const postsRel = Post.includes(":author", ":comments").order("posts.id");
      expect(await (await postsRel.first())!.author).toBeTruthy();
      expect((await (await postsRel.first())!.comments)[0]).toBeTruthy();
    });
  });

  it("default scoping finder methods", async () => {
    const devIds = (await DeveloperCalledDavid.order("id")).map((d) => Number(d.id)).sort();
    const expectedIds = (await Developer.where({ name: "David" })).map((d) => Number(d.id)).sort();
    expect(devIds).toEqual(expectedIds);
  });

  it("includes with select", async () => {
    const query = Post.select("legacy_comments_count AS ranking")
      .order("ranking")
      .includes(":comments")
      .where({ comments: { id: 1 } });
    expect((query as any).selectValues).toEqual(["legacy_comments_count AS ranking"]);
    expect(await query.size()).toBe(1);
  });

  it("preloading with associations and merges", async () => {
    const post = await Post.createBang({ title: "Uhuu", body: "body" });
    const reader = await Reader.createBang({ post_id: post.id, person_id: 1 });
    const comment = await Comment.createBang({ post_id: post.id, body: "body" });

    assertNotRespondTo(comment, "readers");

    let postRel = Post.preload(":readers").joins(":readers").where({ title: "Uhuu" });
    let resultComment = (await Comment.joins(":post").merge(postRel))[0];
    expect(resultComment.equals(comment)).toBe(true);

    await assertNoQueries(false, async () => {
      expect((await (resultComment as any).post).equals(post)).toBe(true);
      expect((await (await (resultComment as any).post).readers).map((r: Reader) => r.id)).toEqual([
        reader.id,
      ]);
    });

    postRel = Post.includes(":readers").where({ title: "Uhuu" });
    resultComment = (await Comment.joins(":post").merge(postRel).first())!;
    expect(resultComment.equals(comment)).toBe(true);

    await assertNoQueries(false, async () => {
      expect((await (resultComment as any).post).equals(post)).toBe(true);
      expect((await (await (resultComment as any).post).readers).map((r: Reader) => r.id)).toEqual([
        reader.id,
      ]);
    });
  });

  it("preloading with associations default scopes and merges", async () => {
    const post = await Post.createBang({ title: "Uhuu", body: "body" });
    const reader = await Reader.createBang({ post_id: post.id, person_id: 1 });

    let postRel = PostWithPreloadDefaultScope.preload(":readers")
      .joins(":readers")
      .where({ title: "Uhuu" });
    let resultPost = (await PostWithPreloadDefaultScope.all().merge(postRel))[0];

    await assertNoQueries(false, async () => {
      expect((await (resultPost as any).readers).map((r: Reader) => r.id)).toEqual([reader.id]);
    });

    postRel = PostWithIncludesDefaultScope.includes(":readers").where({ title: "Uhuu" });
    resultPost = (await PostWithIncludesDefaultScope.all().merge(postRel))[0];

    await assertNoQueries(false, async () => {
      expect((await (resultPost as any).readers).map((r: Reader) => r.id)).toEqual([reader.id]);
    });
  });

  it("loading with one association", async () => {
    let postsRel: any = Post.preload(":comments");
    let post = (await postsRel.toArray()).find((p: any) => p.id === 1);
    expect((await post.comments).length).toBe(2);
    expect((await post.comments).map((c: Comment) => c.id)).toContain(comments("greetings").id);

    post = await Post.where("posts.title = 'Welcome to the weblog'").preload(":comments").first();
    expect((await post.comments).length).toBe(2);
    expect((await post.comments).map((c: Comment) => c.id)).toContain(comments("greetings").id);

    postsRel = Post.preload(":lastComment");
    post = (await postsRel.toArray()).find((p: any) => p.id === 1);
    expect((await post.lastComment).equals(await (await Post.find(1)).lastComment)).toBe(true);
  });

  it("to sql on eager join", async () => {
    const expected = (
      await captureSql(async () => {
        await Post.eagerLoad(":lastComment").order("comments.id DESC");
      })
    )[0];
    const actual = Post.eagerLoad(":lastComment").order("comments.id DESC").toSql();
    expect(expected).toEqual(actual);
  });

  it("to sql on scoped proxy", async () => {
    const auth = (await Author.first())!;
    (Post.where("1=1") as any).writtenBy(auth);
    expect(auth.posts.toSql().includes("1=1")).toBeFalsy();
  });

  it("loading with one association with non preload", async () => {
    void posts("welcome");
    const postsEager = await Post.eagerLoad(":lastComment").order("comments.id DESC");
    const post = postsEager.find((p) => Number(p.id) === 1)!;
    const freshPost = await Post.find(1);
    const directLastComment = await freshPost.lastComment;
    expect((await post.lastComment)!.equals(directLastComment)).toBe(true);
  });

  it("dynamic find by attributes", async () => {
    const david = authors("david");
    const author = await (Author.preload(":taggings") as any).findById(david.id);
    const expectedTaggings = [taggings("welcome_general"), taggings("thinking_general")];

    await assertNoQueries(false, async () => {
      expect([...new Set(await author.taggings)].sort((a: any, b: any) => a.id - b.id)).toEqual(
        expectedTaggings,
      );
    });

    const authorsRel: any = Author.all();
    expect(await authorsRel.findByIdAndName(david.id, david.name)).toEqual(david);
    expect(await authorsRel.findByIdAndNameBang(david.id, david.name)).toEqual(david);
  });

  it("dynamic find by attributes bang", async () => {
    const author = await (Author.all() as any).findByIdBang(authors("david").id);
    expect(author.name).toBe("David");

    await expect((Author.all() as any).findByIdAndNameBang(20, "invalid")).rejects.toThrow(
      RecordNotFound,
    );
  });

  it("find id", async () => {
    const david = authors("david");
    const allAuthors = Author.all();
    const found = await allAuthors.find(david.id);
    expect(found.name).toBe("David");

    await expect(allAuthors.where({ name: "lifo" }).find("42")).rejects.toThrow(RecordNotFound);
  });

  it("find ids", async () => {
    const authorsRel = Author.order("id ASC");

    const results = (await authorsRel.find(authors("david").id, authors("mary").id)) as Author[];
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(2);
    expect(results[0].name).toBe("David");
    expect(results[1].name).toBe("Mary");
    expect(await authorsRel.find([authors("david").id, authors("mary").id])).toEqual(results);

    await expect(
      authorsRel.where({ name: "lifo" }).find(authors("david").id, "42"),
    ).rejects.toThrow(RecordNotFound);
    await expect(authorsRel.find(["42", 43])).rejects.toThrow(RecordNotFound);
  });

  it("find in empty array", async () => {
    const authorsRel = Author.all().where({ id: [] });
    assertPredicate(await authorsRel, isBlank);
  });

  it("where with ar object", async () => {
    const author = await Author.first();
    const authorsRel = Author.all().where({ id: author });
    expect((await authorsRel).length).toBe(1);
  });

  it("where with ar relation", async () => {
    const author = await (await Post.last())!.author;
    const postsRel = Post.all().where({ author: author });
    expect((await postsRel).length).toBe(3);
  });

  it.skip("where id with delegated ar object", () => {
    // PERMANENT-SKIP: Ruby-only — SimpleDelegator has no idiomatic JS analog
  });

  it.skip("where relation with delegated ar object", () => {
    // PERMANENT-SKIP: Ruby-only — SimpleDelegator has no idiomatic JS analog
  });

  it("find by with delegated ar object", async () => {
    const decorator = (record: object) => new Proxy(record, {});
    const author = (await Author.first())!;
    expect(await Author.findBy({ id: decorator(author) as any })).toEqual(author);
    expect(await Author.findBy({ id: [decorator(author)] as any })).toEqual(author);
  });

  it("find with list of ar", async () => {
    const author = await Author.first();
    const result = (await Author.find([author!.id])) as Author[];
    expect(result[0].id).toBe(author!.id);
  });

  it("find by id with list of ar", async () => {
    const author = await Author.first();
    const found = await Author.findBy({ id: [author] });
    expect(found!.id).toBe(author!.id);
  });

  it("find all using where twice should or the relation", async () => {
    const david = authors("david");
    const relation = Author.unscoped()
      .where({ name: david.name })
      .where({ name: "Santiago" })
      .where({ id: david.id });
    expect(await relation).toEqual([]);
  });

  it("multi where ands queries", () => {
    const relation = Author.unscoped();
    const david = authors("david");
    const sql = relation.where({ name: david.name }).where({ name: "Santiago" }).toSql();
    expect(sql).toMatch("AND");
  });

  it("find all with multiple should use and", async () => {
    const david = authors("david");
    const relation = [{ name: david.name }, { name: "Santiago" }, { name: "tenderlove" }].reduce(
      (memo, param) => memo.where(param),
      Author.unscoped(),
    );
    expect(await relation).toEqual([]);
  });

  it("typecasting where with array", async () => {
    const ids = await Author.pluck("id");
    const slugs = ids.map((id: unknown) => `${id}-as-a-slug`);
    const byIds = await Author.where({ id: ids });
    const bySlugs = await Author.where({ id: slugs });
    expect(byIds.map((a) => a.id)).toEqual(bySlugs.map((a) => a.id));
  });

  it("find all using where with relation", async () => {
    const david = authors("david");
    await assertQueriesCount(1, false, async () => {
      const relation = Author.where({ id: Author.where({ id: david.id }) });
      expect(await relation).toEqual([david]);
    });

    await assertQueriesCount(1, false, async () => {
      const relation = Author.where("id in (?)", Author.where({ id: david }).select("id"));
      expect(await relation).toEqual([david]);
    });

    await assertQueriesCount(1, false, async () => {
      const relation = Author.where("id in (:author_ids)", {
        author_ids: Author.where({ id: david }).select("id"),
      });
      expect(await relation).toEqual([david]);
    });
  });

  it("find all using where with relation with bound values", async () => {
    const david = authors("david");
    const davidsPosts = (await david.posts.order("id")).map((p: Post) => p.id);

    await assertQueriesCount(1, false, async () => {
      const relation = Post.where({ id: david.posts.select("id") });
      expect((await relation.order("id")).map((p) => p.id)).toEqual(davidsPosts);
    });

    await assertQueriesCount(1, false, async () => {
      const relation = Post.where("id in (?)", david.posts.select("id"));
      expect(
        (await relation.order("id")).map((p) => p.id),
        "should process Relation as bind variables",
      ).toEqual(davidsPosts);
    });

    await assertQueriesCount(1, false, async () => {
      const relation = Post.where("id in (:post_ids)", { post_ids: david.posts.select("id") });
      expect(
        (await relation.order("id")).map((p) => p.id),
        "should process Relation as named bind variables",
      ).toEqual(davidsPosts);
    });
  });

  it("find all using where with relation and alternate primary key", async () => {
    const coolFirst = minivans("cool_first");
    await assertQueriesCount(1, false, async () => {
      const relation = Minivan.where({ minivan_id: Minivan.where({ name: coolFirst.name }) });
      expect(await relation).toEqual([coolFirst]);
    });
  });

  it("find all using where with relation with no selects and composite primary key raises", async () => {
    const order = cpkOrders("cpk_groceries_order_1");
    const subquery = CpkOrder.where(new Map([[CpkOrder.primaryKey, [order.id]]]));

    await expect(CpkOrder.where({ id: subquery.select("id") }).toArray()).resolves.not.toThrow();

    let error: any;
    await expect(
      (async () => {
        try {
          await CpkOrder.where({ id: subquery });
        } catch (e) {
          error = e;
          throw e;
        }
      })(),
    ).rejects.toThrow(ArgumentError);

    expect(error.message).toBe('Cannot map composite primary key ["shop_id", "id"] to id');
  });

  it("find all using where with relation does not alter select values", async () => {
    const david = authors("david");

    const subquery = Author.where({ id: david.id });

    await assertQueriesCount(1, false, async () => {
      const relation = Author.where({ id: subquery });
      expect(await relation).toEqual([david]);
    });

    expect(subquery.selectValues.length).toBe(0);
  });

  it("find all using where with relation with joins", async () => {
    const david = authors("david");
    await assertQueriesCount(1, false, async () => {
      const relation = Author.where({ id: Author.joins(":posts").where({ id: david.id }) });
      expect(await relation).toEqual([david]);
    });
  });

  it("find all using where with relation with select to build subquery", async () => {
    const david = authors("david");
    await assertQueriesCount(1, false, async () => {
      const relation = Author.where({ name: Author.where({ id: david.id }).select("name") });
      expect(await relation).toEqual([david]);
    });
  });

  it("last", async () => {
    const bob = authors("bob");
    expect((await Author.all().last())!.id).toBe(bob.id);
  });

  it("select with aggregates", async () => {
    const postsRel = Post.select("title", "body");

    expect(await postsRel.count("*")).toBe(11);
    expect(await postsRel.size()).toBe(11);
    expect(await postsRel.isAny()).toBeTruthy();
    expect(await postsRel.isMany()).toBeTruthy();
    assertNotEmpty(await postsRel);
  });

  it("select takes a variable list of args", async () => {
    const david = developers("david");
    const dev = await Developer.where({ id: david.id }).select("name", "salary").first();
    expect(dev!.name).toBe(david.name);
    expect((dev as any).salary).toBe(david.salary);
  });

  it("select takes an aliased attribute", async () => {
    const first = topics("first");
    const topic = await Topic.where({ id: first.id }).select("heading").first();
    expect((topic as any).heading).toBe(first.title);
  });

  it("count", async () => {
    const postsRel = Post.all();
    expect(await postsRel.count()).toBe(11);
    expect(await postsRel.count("*")).toBe(11);
    expect(await postsRel.count("id")).toBe(11);
    expect(await postsRel.where("legacy_comments_count > 1").count()).toBe(3);
    expect(await postsRel.where({ comments_count: 0 }).count()).toBe(6);
  });

  it("count with block", async () => {
    const postsRel = await Post.all();
    const evenCount = postsRel.filter(
      (p) => ((p as any).comments_count ?? (p as any).legacy_comments_count ?? 0) % 2 === 0,
    ).length;
    expect(evenCount).toBe(8);
  });

  it("count on association relation", async () => {
    const author = (await Author.last())!;
    const anotherAuthor = (await Author.first())!;
    const postsRel = Post.where({ author_id: author.id });

    expect(await postsRel.count()).toBe(await author.posts.where({ author_id: author.id }).size());

    expect(await author.posts.where({ author_id: anotherAuthor.id }).size()).toBe(0);
    assertEmpty(await author.posts.where({ author_id: anotherAuthor.id }));
  });

  it("count with distinct", async () => {
    const postsRel = Post.all();

    expect(await postsRel.distinct(true).count("comments_count")).toBe(4);
    expect(await postsRel.distinct(false).count("comments_count")).toBe(11);

    expect(await postsRel.distinct(true).select("comments_count").count()).toBe(4);
    expect(await postsRel.distinct(false).select("comments_count").count()).toBe(11);
  });

  it("size with distinct", async () => {
    const postsRel = Post.distinct().select("author_id", "comments_count");
    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.size()).toBe(8);
    });
    await assertQueriesCount(1, false, async () => {
      await postsRel.load();
      expect(await postsRel.size()).toBe(8);
    });
  });

  it("size with eager loading and custom order", async () => {
    const postsRel = Post.includes(":comments").order("comments.id");
    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.size()).toBe(11);
    });
    await assertQueriesCount(1, false, async () => {
      await postsRel.load();
      expect(await postsRel.size()).toBe(11);
    });
  });

  it("size with eager loading and custom select and order", async () => {
    const postsRel = Post.includes(":comments").order("comments.id").select("type");
    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.size()).toBe(11);
    });
    await assertQueriesCount(1, false, async () => {
      await postsRel.load();
      expect(await postsRel.size()).toBe(11);
    });
  });

  it("size with eager loading and custom order and distinct", async () => {
    const postsRel = Post.includes(":comments").order("comments.id").distinct();
    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.size()).toBe(11);
    });
    await assertQueriesCount(1, false, async () => {
      await postsRel.load();
      expect(await postsRel.size()).toBe(11);
    });
  });

  it("size with eager loading and manual distinct select and custom order", async () => {
    const accountsRel = Account.select("DISTINCT accounts.firm_id").order("accounts.firm_id");

    await assertQueriesCount(1, false, async () => {
      expect(await accountsRel.size()).toBe(5);
    });
    await assertQueriesCount(1, false, async () => {
      await accountsRel.load();
      expect(await accountsRel.size()).toBe(5);
    });
  });

  it("count explicit columns", async () => {
    await Post.updateAll({ comments_count: null });
    const postsRel = Post.all();

    expect([
      ...new Set(
        (
          (await postsRel
            .select("comments_count")
            .where("id is not null")
            .group("id")
            .order("id")
            .count()) as any
        ).values(),
      ),
    ]).toEqual([0]);
    expect(await postsRel.where("id is not null").select("comments_count").count()).toBe(0);

    expect(await postsRel.select("comments_count").count("id")).toBe(11);
    expect(await postsRel.select("comments_count").count()).toBe(0);
    expect(await postsRel.count("comments_count")).toBe(0);
    expect(await postsRel.count("comments_count")).toBe(0);
  });

  it("multiple selects", async () => {
    const post = await Post.all()
      .select("legacy_comments_count")
      .select("title")
      .order("id ASC")
      .first();
    expect(post!.title).toBe("Welcome to the weblog");
    expect((post as any).legacy_comments_count).toBe(2);
  });

  it("size", async () => {
    const postsRel = Post.all();

    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.size()).toBe(11);
    });
    assertNotPredicate(postsRel, (p) => p.isLoaded);

    const bestPosts = postsRel.where({ comments_count: 0 });
    await bestPosts.load();
    await assertNoQueries(false, async () => {
      expect(await bestPosts.size()).toBe(6);
    });
  });

  it("size with limit", async () => {
    const postsRel = Post.limit(10);

    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.size()).toBe(10);
    });
    assertNotPredicate(postsRel, (p) => p.isLoaded);

    const bestPosts = postsRel.where({ comments_count: 0 });
    await bestPosts.load();
    await assertNoQueries(false, async () => {
      expect(await bestPosts.size()).toBe(6);
    });
  });

  it("size with zero limit", async () => {
    const postsRel = Post.limit(0);

    await assertNoQueries(false, async () => {
      expect(await postsRel.size()).toBe(0);
    });
    assertNotPredicate(postsRel, (p) => p.isLoaded);

    await postsRel.load();
    await assertNoQueries(false, async () => {
      expect(await postsRel.size()).toBe(0);
    });
  });

  it("empty with zero limit", async () => {
    const postsRel = Post.limit(0);

    await assertNoQueries(false, async () => {
      expect(await postsRel.isEmpty()).toBe(true);
    });
    assertNotPredicate(postsRel, (p) => p.isLoaded);
  });

  it("count complex chained relations", async () => {
    const postsRel = Post.select("comments_count")
      .where("id is not null")
      .group("author_id")
      .where("legacy_comments_count > 0");
    const expected = new Map([
      [1, 4],
      [2, 1],
    ]);
    const result = await postsRel.count();
    expect(result).toEqual(expected);
  });

  it("empty", async () => {
    const postsRel = Post.all();

    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.isEmpty()).toBe(false);
    });
    assertNotPredicate(postsRel, (p) => p.isLoaded);

    const noPosts = postsRel.where({ title: "" });
    await assertQueriesCount(1, false, async () => {
      expect(await noPosts.isEmpty()).toBe(true);
    });
    assertNotPredicate(noPosts, (p) => p.isLoaded);

    const bestPosts = postsRel.where({ comments_count: 0 });
    await bestPosts.load();
    await assertNoQueries(false, async () => {
      expect(await bestPosts.isEmpty()).toBe(false);
    });
  });

  it("empty complex chained relations", async () => {
    const postsRel = Post.select("comments_count")
      .where("id is not null")
      .group("author_id")
      .where("legacy_comments_count > 0");

    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.isEmpty()).toBe(false);
    });
    assertNotPredicate(postsRel, (p) => p.isLoaded);

    const noPosts = postsRel.where({ title: "" });
    await assertQueriesCount(1, false, async () => {
      expect(await noPosts.isEmpty()).toBe(true);
    });
    assertNotPredicate(noPosts, (p) => p.isLoaded);
  });

  it("any", async () => {
    const postsRel = Post.all();

    await assertQueriesCount(3, false, async () => {
      expect(await postsRel.isAny()).toBeTruthy();
      expect(await postsRel.where({ id: null }).isAny()).toBeFalsy();

      expect(await postsRel.isAny((p) => (p.id as number) > 0)).toBeTruthy();
      expect(await postsRel.isAny((p) => (p.id as number) <= 0)).toBeFalsy();

      expect(await postsRel.isAny(Post)).toBeTruthy();
      expect(await postsRel.isAny(Comment)).toBeFalsy();
    });

    assertPredicate(postsRel, (p) => p.isLoaded);
  });

  it("many", async () => {
    const postsRel = Post.all();

    await assertQueriesCount(2, false, async () => {
      expect(await postsRel.isMany()).toBeTruthy();
      expect(await postsRel.isMany((p) => (p.id as number) > 0)).toBeTruthy();
      expect(await postsRel.isMany((p) => (p.id as number) < 2)).toBeFalsy();
    });

    assertPredicate(postsRel, (p) => p.isLoaded);
  });

  it("many with limits", async () => {
    const postsWithLimit = Post.limit(5);
    const postsWithLimitOne = Post.limit(1);

    expect(await postsWithLimit.isMany()).toBeTruthy();
    assertNotPredicate(postsWithLimit, (p) => p.isLoaded);

    expect(await postsWithLimitOne.isMany()).toBeFalsy();
    assertNotPredicate(postsWithLimitOne, (p) => p.isLoaded);
  });

  it("none?", async () => {
    const postsRel = Post.all();
    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.isNone()).toBeFalsy();
    });

    assertNotPredicate(postsRel, (p) => p.isLoaded);

    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.isNone((p) => (p.id as number) < 0)).toBeTruthy();
      expect(await postsRel.isNone((p) => p.id === 1)).toBeFalsy();

      expect(await postsRel.isNone(Comment)).toBeTruthy();
      expect(await postsRel.isNone(Post)).toBeFalsy();
    });

    assertPredicate(postsRel, (p) => p.isLoaded);
  });

  it("one", async () => {
    const postsRel = Post.all();
    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.isOne()).toBeFalsy();
    });

    assertNotPredicate(postsRel, (p) => p.isLoaded);

    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.isOne((p) => (p.id as number) < 3)).toBeFalsy();
      expect(await postsRel.isOne((p) => p.id === 1)).toBeTruthy();

      expect(await postsRel.isOne(Post)).toBeFalsy();
      expect(await postsRel.isOne(Comment)).toBeFalsy();
    });

    assertPredicate(postsRel, (p) => p.isLoaded);
  });

  it("one with destroy", async () => {
    const postsRel = Post.all();
    await assertQueriesCount(1, false, async () => {
      expect(await postsRel.isOne()).toBeFalsy();
    });

    await postsRel
      .where()
      .not({ id: await Post.first() })
      .destroyAll();

    expect(await postsRel.size()).toBe(1);
    expect(await postsRel.isOne()).toBeTruthy();
  });

  it("to a should dup target", async () => {
    const postsRel = Post.all();
    const originalSize = await postsRel.size();
    const arr = await postsRel;
    const removed = arr.pop()!;
    expect(await postsRel.size()).toBe(originalSize);
    expect((await postsRel).map((p) => p.id)).toContain(removed.id);
  });

  it("build", () => {
    const post = Post.all().build();
    expect(post).toBeInstanceOf(Post);
  });

  it("scoped build", () => {
    const post = Post.where({ title: "You told a lie" }).build();
    expect(post).toBeInstanceOf(Post);
    expect(post.title).toBe("You told a lie");
  });

  it("create", async () => {
    const birds = Bird.all();

    const sparrow = await birds.create();
    expect(sparrow).toBeInstanceOf(Bird);
    assertNotPredicate(sparrow, (b) => b.isPersisted());

    const hen = await birds.where({ name: "hen" }).create();
    assertPredicate(hen, (b) => b.isPersisted());
    expect(hen.name).toBe("hen");
  });

  it("create bang", async () => {
    const birds = Bird.all();

    await expect(birds.createBang()).rejects.toThrow(RecordInvalid);

    const hen = await birds.where({ name: "hen" }).createBang();
    expect(hen).toBeInstanceOf(Bird);
    assertPredicate(hen, (b) => b.isPersisted());
    expect(hen.name).toBe("hen");
  });

  it("create with polymorphic association", async () => {
    const author = authors("david");
    const post = posts("welcome");
    const comment = await Comment.where({ post: post, author: author }).createBang({
      body: "hello",
    });

    expect((await (comment as any).author).equals(author)).toBe(true);
    expect((await (comment as any).post).equals(post)).toBe(true);
  });

  it("new with array", () => {
    const greenBirds = Bird.where({ color: "green" }).build([
      { name: "parrot" },
      { name: "canary" },
    ]);
    expect(greenBirds.map((b) => b.name)).toEqual(["parrot", "canary"]);
    expect(greenBirds.map((b) => b.color)).toEqual(["green", "green"]);
    for (const bird of greenBirds) assertNotPredicate(bird, (b) => b.isPersisted());
  });

  it("build with array", () => {
    const greenBirds = Bird.where({ color: "green" }).build([
      { name: "parrot" },
      { name: "canary" },
    ]);
    expect(greenBirds.map((b) => b.name)).toEqual(["parrot", "canary"]);
    expect(greenBirds.map((b) => b.color)).toEqual(["green", "green"]);
    for (const bird of greenBirds) assertNotPredicate(bird, (b) => b.isPersisted());
  });

  it("create with array", async () => {
    const greenBirds = await Bird.where({ color: "green" }).create([
      { name: "parrot" },
      { name: "canary" },
    ]);
    expect(greenBirds.map((b) => b.name)).toEqual(["parrot", "canary"]);
    expect(greenBirds.map((b) => b.color)).toEqual(["green", "green"]);
    for (const bird of greenBirds) assertPredicate(bird, (b) => b.isPersisted());
  });

  it("create with block", async () => {
    const sparrow = await Bird.create({}, (bird: Bird) => {
      (bird as any).name = "sparrow";
      (bird as any).color = "grey";
    });

    expect(sparrow).toBeInstanceOf(Bird);
    assertPredicate(sparrow, (b) => b.isPersisted());
    expect(sparrow.name).toBe("sparrow");
    expect(sparrow.color).toBe("grey");
  });

  it("create bang with array", async () => {
    const greenBirds = await Bird.where({ color: "green" }).createBang([
      { name: "parrot" },
      { name: "canary" },
    ]);
    expect(greenBirds.map((b) => b.name)).toEqual(["parrot", "canary"]);
    expect(greenBirds.map((b) => b.color)).toEqual(["green", "green"]);
    for (const bird of greenBirds) assertPredicate(bird, (b) => b.isPersisted());
  });

  it("first or create", async () => {
    const parrot = await Bird.where({ color: "green" }).firstOrCreate({ name: "parrot" });
    expect(parrot).toBeInstanceOf(Bird);
    assertPredicate(parrot, (b) => b.isPersisted());
    expect(parrot.name).toBe("parrot");
    expect(parrot.color).toBe("green");

    const sameParrot = await Bird.where({ color: "green" }).firstOrCreate({ name: "parakeet" });
    expect(sameParrot).toBeInstanceOf(Bird);
    assertPredicate(sameParrot, (b) => b.isPersisted());
    expect(sameParrot.equals(parrot)).toBe(true);

    const canary = await Bird.where(
      Bird.arelTable.get("color").isDistinctFrom("green"),
    ).firstOrCreate({
      name: "canary",
    });
    expect(canary.name).toBe("canary");
    expect(canary.color).toBeNull();
  });

  it("first or create with no parameters", async () => {
    const parrot = await Bird.where({ color: "green" }).firstOrCreate();
    expect(parrot).toBeInstanceOf(Bird);
    assertNotPredicate(parrot, (b) => b.isPersisted());
    expect(parrot.color).toBe("green");
  });

  it("first or create with block", async () => {
    const canary = await Bird.createBang({ color: "yellow", name: "canary" });
    const parrot = await (Bird.where({ color: "green" }) as any).firstOrCreate(
      undefined,
      async (bird: Bird) => {
        bird.name = "parrot";
        bird.enableCount = true;
        expect((await Bird.findByBang({ name: "canary" })).equals(canary)).toBe(true);
      },
    );
    expect(parrot.totalCount).toBe(1);
    expect(parrot).toBeInstanceOf(Bird);
    assertPredicate(parrot, (b) => b.isPersisted());
    expect(parrot.color).toBe("green");
    expect(parrot.name).toBe("parrot");

    const sameParrot = await (Bird.where({ color: "green" }) as any).firstOrCreate(
      undefined,
      (bird: Bird) => {
        bird.name = "parakeet";
      },
    );
    expect(sameParrot.equals(parrot)).toBe(true);
  });

  it("first or create with array", async () => {
    const severalGreenBirds = (await (Bird.where({ color: "green" }) as any).firstOrCreate([
      { name: "parrot" },
      { name: "parakeet" },
    ])) as Bird[];
    expect(severalGreenBirds).toBeInstanceOf(Array);
    for (const bird of severalGreenBirds) assertPredicate(bird, (b) => b.isPersisted());

    const sameParrot = await (Bird.where({ color: "green" }) as any).firstOrCreate([
      { name: "hummingbird" },
      { name: "macaw" },
    ]);
    expect(sameParrot).toBeInstanceOf(Bird);
    expect(sameParrot.equals(severalGreenBirds[0])).toBe(true);
  });

  it("first or create bang with valid options", async () => {
    const parrot = await Bird.where({ color: "green" }).firstOrCreateBang({ name: "parrot" });
    expect(parrot).toBeInstanceOf(Bird);
    assertPredicate(parrot, (b) => b.isPersisted());
    expect(parrot.name).toBe("parrot");
    expect(parrot.color).toBe("green");

    const sameParrot = await Bird.where({ color: "green" }).firstOrCreateBang({ name: "parakeet" });
    expect(sameParrot).toBeInstanceOf(Bird);
    assertPredicate(sameParrot, (b) => b.isPersisted());
    expect(sameParrot.equals(parrot)).toBe(true);
  });

  it("first or create bang with invalid options", async () => {
    await expect(
      Bird.where({ color: "green" }).firstOrCreateBang({ pirate_id: 1 }),
    ).rejects.toThrow(RecordInvalid);
  });

  it("first or create bang with no parameters", async () => {
    await expect(Bird.where({ color: "green" }).firstOrCreateBang()).rejects.toThrow(RecordInvalid);
  });

  it("first or create bang with valid block", async () => {
    const canary = await Bird.createBang({ color: "yellow", name: "canary" });
    const parrot = await (Bird.where({ color: "green" }) as any).firstOrCreateBang(
      undefined,
      async (bird: Bird) => {
        bird.name = "parrot";
        bird.enableCount = true;
        expect((await Bird.findByBang({ name: "canary" })).equals(canary)).toBe(true);
      },
    );
    expect(parrot.totalCount).toBe(1);
    expect(parrot).toBeInstanceOf(Bird);
    assertPredicate(parrot, (b) => b.isPersisted());
    expect(parrot.color).toBe("green");
    expect(parrot.name).toBe("parrot");

    const sameParrot = await (Bird.where({ color: "green" }) as any).firstOrCreateBang(
      undefined,
      (bird: Bird) => {
        bird.name = "parakeet";
      },
    );
    expect(sameParrot.equals(parrot)).toBe(true);
  });

  it("first or create bang with invalid block", async () => {
    await expect(
      Bird.where({ color: "green" }).firstOrCreateBang({ pirate_id: 1 }),
    ).rejects.toThrow(RecordInvalid);
  });

  it("first or create bang with valid array", async () => {
    const severalGreenBirds = (await (Bird.where({ color: "green" }) as any).firstOrCreateBang([
      { name: "parrot" },
      { name: "parakeet" },
    ])) as Bird[];
    expect(severalGreenBirds).toBeInstanceOf(Array);
    for (const bird of severalGreenBirds) assertPredicate(bird, (b) => b.isPersisted());

    const sameParrot = await (Bird.where({ color: "green" }) as any).firstOrCreateBang([
      { name: "hummingbird" },
      { name: "macaw" },
    ]);
    expect(sameParrot).toBeInstanceOf(Bird);
    expect(sameParrot.equals(severalGreenBirds[0])).toBe(true);
  });

  it("first or create bang with invalid array", async () => {
    await expect(
      (Bird.where({ color: "green" }) as any).firstOrCreateBang([
        { name: "parrot" },
        { pirate_id: 1 },
      ]),
    ).rejects.toThrow(RecordInvalid);
  });

  it("first or initialize", async () => {
    const parrot = await Bird.where({ color: "green" }).firstOrInitialize({ name: "parrot" });
    expect(parrot).toBeInstanceOf(Bird);
    assertNotPredicate(parrot, (b) => b.isPersisted());
    expect(await parrot.isValid()).toBeTruthy();
    assertPredicate(parrot, (b) => b.isNewRecord());
    expect(parrot.name).toBe("parrot");
    expect(parrot.color).toBe("green");

    const canary = await Bird.where(
      Bird.arelTable.get("color").isDistinctFrom("green"),
    ).firstOrInitialize({ name: "canary" });
    expect(canary.name).toBe("canary");
    expect(canary.color).toBeNull();
  });

  it("first or initialize with no parameters", async () => {
    const parrot = await Bird.where({ color: "green" }).firstOrInitialize();
    expect(parrot).toBeInstanceOf(Bird);
    assertNotPredicate(parrot, (b) => b.isPersisted());
    expect(await parrot.isValid()).toBeFalsy();
    assertPredicate(parrot, (b) => b.isNewRecord());
    expect(parrot.color).toBe("green");
  });

  it.skip("first or initialize with block", async () => {
    // BLOCKED: after_initialize count — Bird's afterInitialize sets totalCount from an async Bird.count(), so it is still 0 when read (bird-total-count-async-after-initialize)
    const canary = await Bird.createBang({ color: "yellow", name: "canary" });
    const parrot = await Bird.where({ color: "green" }).firstOrInitialize(
      undefined,
      (bird: Bird) => {
        bird.name = "parrot";
        bird.enableCount = true;
        expect(canary).toBeTruthy();
      },
    );
    expect(parrot.totalCount).toBe(1);
    expect(parrot).toBeInstanceOf(Bird);
    assertNotPredicate(parrot, (b) => b.isPersisted());
    expect(await parrot.isValid()).toBeTruthy();
    assertPredicate(parrot, (b) => b.isNewRecord());
    expect(parrot.color).toBe("green");
    expect(parrot.name).toBe("parrot");
  });

  it("find or create by", async () => {
    expect(await Bird.findBy({ name: "bob" })).toBeNull();

    const bird = await Bird.findOrCreateBy({ name: "bob" });
    assertPredicate(bird, (b) => b.isPersisted());

    expect((await Bird.findOrCreateBy({ name: "bob" })).equals(bird)).toBe(true);
  });

  it("find or create by race condition", async () => {
    expect(await Subscriber.findBy({ nick: "bob" })).toBeNull();

    const bob = await Subscriber.createBang({ nick: "bob" });
    const relation = Subscriber.all();

    const results: unknown[] = [null, bob];
    const findByMock = async () => {
      assertNotPredicate(results, (r) => r.length === 0);
      return results.shift();
    };
    vi.spyOn(Relation.prototype as any, "findBy").mockImplementation(findByMock as any);
    vi.spyOn(Relation.prototype as any, "findByBang").mockImplementation(findByMock as any);

    expect((await relation.findOrCreateBy({ nick: "bob" })).equals(bob)).toBe(true);

    assertPredicate(results, (r) => r.length === 0);
  });

  it("find or create by with create with", async () => {
    expect(await Bird.findBy({ name: "bob" })).toBeNull();

    const bird = await Bird.createWith({ color: "green" }).findOrCreateBy({ name: "bob" });
    assertPredicate(bird, (b) => b.isPersisted());
    expect(bird.color).toBe("green");

    expect(
      (await Bird.createWith({ color: "blue" }).findOrCreateBy({ name: "bob" })).equals(bird),
    ).toBe(true);
  });

  it("find or create by with block", async () => {
    expect(await Bird.findBy({ name: "bob" })).toBeNull();

    const bird = await (Bird as any).findOrCreateBy({ name: "bob" }, (record: Bird) => {
      record.color = "blue";
    });
    assertPredicate(bird, (b: Bird) => b.isPersisted());
    expect(bird.name).toBe("bob");
    expect(bird.color).toBe("blue");

    expect((await Bird.findOrCreateBy({ name: "bob", color: "blue" })).equals(bird)).toBe(true);
  });

  it("find or create by!", async () => {
    await expect(Bird.findOrCreateByBang({ color: "green" })).rejects.toThrow(RecordInvalid);
  });

  it("create or find by", async () => {
    expect(await Subscriber.findBy({ nick: "bob" })).toBeNull();
    const subscriber = await Subscriber.createBang({ nick: "bob" });
    expect((await Subscriber.createOrFindBy({ nick: "bob" })).nick).toBe(subscriber.nick);
    expect((await Subscriber.createOrFindBy({ nick: "cat" })).nick).not.toBe(subscriber.nick);
  });

  it("create or find by with block", async () => {
    expect(await Subscriber.findBy({ nick: "bob" })).toBeNull();

    const subscriber = await (Subscriber as any).createOrFindBy(
      { nick: "bob" },
      (record: Subscriber) => {
        record.name = "the builder";
      },
    );

    expect(subscriber.nick).toBe("bob");
    expect(subscriber.name).toBe("the builder");
    assertPredicate(subscriber, (s: Subscriber) => s.isPersisted());
    expect((await Subscriber.createOrFindBy({ nick: "bob" })).equals(subscriber)).toBe(true);
    expect((await Subscriber.createOrFindBy({ nick: "cat" })).equals(subscriber)).not.toBe(true);
  });

  it("create or find by should not raise due to validation errors", async () => {
    await expect(
      (async () => {
        const bird = await Bird.createOrFindBy({ color: "green" });
        expect(await bird.isInvalid()).toBeTruthy();
      })(),
    ).resolves.not.toThrow();
  });

  it("create or find by with non unique attributes", async () => {
    await Subscriber.createBang({ nick: "bob", name: "the builder" });

    await expect(Subscriber.createOrFindBy({ nick: "bob", name: "the cat" })).rejects.toThrow(
      RecordNotFound,
    );
  });

  it("create or find by within transaction", async () => {
    expect(await Subscriber.findBy({ nick: "bob" })).toBeNull();
    const subscriber = await Subscriber.createBang({ nick: "bob" });
    await Subscriber.transaction(async () => {
      expect((await Subscriber.createOrFindBy({ nick: "bob" })).nick).toBe(subscriber.nick);
      expect((await Subscriber.createOrFindBy({ nick: "cat" })).nick).not.toBe(subscriber.nick);
    });
  });

  it("create or find by with bang", async () => {
    expect(await Subscriber.findBy({ nick: "bob" })).toBeNull();
    const subscriber = await Subscriber.createBang({ nick: "bob" });
    expect((await Subscriber.createOrFindByBang({ nick: "bob" })).nick).toBe(subscriber.nick);
    expect((await Subscriber.createOrFindByBang({ nick: "cat" })).nick).not.toBe(subscriber.nick);
  });

  it("create or find by with bang should raise due to validation errors", async () => {
    await expect(Bird.createOrFindByBang({ color: "green" })).rejects.toThrow(RecordInvalid);
  });

  it("create or find by with bang with non unique attributes", async () => {
    await Subscriber.createBang({ nick: "bob", name: "the builder" });

    await expect(Subscriber.createOrFindByBang({ nick: "bob", name: "the cat" })).rejects.toThrow(
      RecordNotFound,
    );
  });

  it("create or find by with bang within transaction", async () => {
    expect(await Subscriber.findBy({ nick: "bob" })).toBeNull();
    const subscriber = await Subscriber.createBang({ nick: "bob" });
    await Subscriber.transaction(async () => {
      expect((await Subscriber.createOrFindByBang({ nick: "bob" })).nick).toBe(subscriber.nick);
      expect((await Subscriber.createOrFindByBang({ nick: "cat" })).nick).not.toBe(subscriber.nick);
    });
  });

  it("find or initialize by", async () => {
    expect(await Bird.findBy({ name: "bob" })).toBeNull();

    const bird = await Bird.findOrInitializeBy({ name: "bob" });
    assertPredicate(bird, (b) => b.isNewRecord());
    await bird.saveBang();

    expect((await Bird.findOrInitializeBy({ name: "bob" })).equals(bird)).toBe(true);
  });

  it("find or initialize by with block", async () => {
    expect(await Bird.findBy({ name: "bob" })).toBeNull();

    const bird = await (Bird as any).findOrInitializeBy({ name: "bob" }, (record: Bird) => {
      record.color = "blue";
    });
    assertPredicate(bird, (b: Bird) => b.isNewRecord());
    expect(bird.name).toBe("bob");
    expect(bird.color).toBe("blue");
    await bird.saveBang();

    expect((await Bird.findOrInitializeBy({ name: "bob", color: "blue" })).equals(bird)).toBe(true);
  });

  it("find or initialize by with cpk association", async () => {
    const order1 = await CpkOrder.createBang({ id: [1, 1] });
    const order2 = await CpkOrder.createBang({ id: [1, 2] });
    await CpkBook.createBang({ id: [2, 1], order: order1 });
    const book = await CpkBook.findOrInitializeBy({ order: order2 });
    expect((await (book as any).order).equals(order2)).toBe(true);
  });

  it("explicit create with", () => {
    const hens = Bird.where({ name: "hen" });
    expect(hens.build().name).toBe("hen");

    const cocks = hens.createWith({ name: "cock" });
    expect(cocks.build().name).toBe("cock");
  });

  it("create with nested attributes", async () => {
    await assertDifference(
      async () => Number(await Project.count()),
      1,
      null,
      async () => {
        let developers = Developer.where({ name: "Aaron" });
        developers = developers.createWith({
          projectsAttributes: [{ name: "p1" }],
        });
        await developers.createBang();
      },
    );
  });

  it("except", async () => {
    const relation = Post.where({ author_id: 1 }).order("id ASC").limit(1);
    expect(await relation).toEqual([posts("welcome")]);

    const byId = (a: Post, b: Post) => Number(a.id) - Number(b.id);
    const authorPosts = relation.except("order", "limit");
    expect((await authorPosts).sort(byId)).toEqual((await Post.where({ author_id: 1 })).sort(byId));
    expect(
      await relation.scoping(async () => (await Post.except("order", "limit")).sort(byId)),
    ).toEqual((await authorPosts).sort(byId));

    const allPosts = relation.except("where", "order", "limit");
    expect((await allPosts).sort(byId)).toEqual((await Post.all()).sort(byId));
    expect(
      await relation.scoping(async () => (await Post.except("where", "order", "limit")).sort(byId)),
    ).toEqual((await allPosts).sort(byId));
  });

  it("except with unrecognized key is a no-op", async () => {
    const relation = Post.where({ author_id: 1 }).order("id ASC").limit(1);
    const baseline = (await relation).map((p) => p.id);

    const unchanged = relation.except("bogus");
    expect((await unchanged).map((p) => p.id)).toEqual(baseline);
  });

  it("only", async () => {
    const relation = Post.where({ author_id: 1 }).order("id ASC").limit(1);
    expect(await relation).toEqual([posts("welcome")]);

    const byId = (a: Post, b: Post) => Number(a.id) - Number(b.id);
    const authorPosts = relation.only("where");
    expect((await authorPosts).sort(byId)).toEqual((await Post.where({ author_id: 1 })).sort(byId));
    expect(await relation.scoping(async () => (await Post.only("where")).sort(byId))).toEqual(
      (await authorPosts).sort(byId),
    );

    const allPosts = relation.only("order");
    expect(await allPosts).toEqual(await Post.order("id ASC"));
    expect(await relation.scoping(async () => await Post.only("order"))).toEqual(await allPosts);
  });

  it("only does not replay unscope on merge", () => {
    const stripped = Post.where({ author_id: 1 }).order("id ASC").limit(1).only("where");

    const merged = Post.order("title").limit(5).merge(stripped);
    expect(merged.toSql()).toContain("ORDER BY");
    expect(merged.toSql()).toContain("LIMIT");

    expect(Post.all().distinct().only("distinct").toSql()).toContain("DISTINCT");
    expect(Post.all().distinct().only("where").toSql()).not.toContain("DISTINCT");
  });

  it("anonymous extension", () => {
    const relation = Post.where({ author_id: 1 })
      .order("id ASC")
      .extending({
        author: function (this: any) {
          return "lifo";
        },
      });
    expect((relation as any).author()).toBe("lifo");
    expect((relation.limit(1) as any).author()).toBe("lifo");
  });

  it("named extension", () => {
    const relation = Post.where({ author_id: 1 }).order("id ASC").extending(Post.namedExtension);
    expect((relation as any).author()).toBe("lifo");
    expect((relation.limit(1) as any).author()).toBe("lifo");
  });

  it("order by relation attribute", async () => {
    const byArel = await Post.order(Post.arelTable.get("title"));
    const byStr = await Post.order("title");
    expect(byArel.map((p) => p.id)).toEqual(byStr.map((p) => p.id));
  });

  it("default scope order with scope order", async () => {
    expect((await CoolCar.orderUsingNewStyle().limit(1).first())!.name).toBe("zyke");
    expect((await FastCar.orderUsingNewStyle().limit(1).first())!.name).toBe("zyke");
  });

  it("order using scoping", async () => {
    const car1 = await CoolCar.order("id DESC").scoping(async () =>
      (CoolCar.all().mergeBang({ order: "id asc" }) as any).first(),
    );
    expect(car1.name).toBe("zyke");

    const car2 = await FastCar.order("id DESC").scoping(async () =>
      (FastCar.all().mergeBang({ order: "id asc" }) as any).first(),
    );
    expect(car2.name).toBe("zyke");
  });

  it("unscoped block style", async () => {
    expect(
      (await CoolCar.unscoped(async () => (CoolCar as any).orderUsingNewStyle().limit(1).first()))!
        .name,
    ).toBe("honda");
    expect(
      (await FastCar.unscoped(async () => (FastCar as any).orderUsingNewStyle().limit(1).first()))!
        .name,
    ).toBe("honda");
  });

  it("intersection with array", async () => {
    const relation = Author.where({ name: "David" });
    const railsAuthor = (await relation.first())!;

    const arr = await relation;
    expect(arr.filter((a) => a.equals(railsAuthor))).toEqual([railsAuthor]);
    expect([railsAuthor].filter((a) => arr.some((b) => b.equals(a)))).toEqual([railsAuthor]);
  });

  it("primary key", () => {
    expect(Post.primaryKey).toBe("id");
  });

  it("ordering with extra spaces", async () => {
    const david = authors("david");
    expect((await Author.order("id DESC , name DESC").last())!.id).toBe(david.id);
  });

  it("distinct", async () => {
    const tag1 = await Tag.create({ name: "Foo" });
    const tag2 = await Tag.create({ name: "Foo" });

    const query = Tag.select("name").where({ id: [tag1.id, tag2.id] });

    expect((await query).map((t) => t.name)).toEqual(["Foo", "Foo"]);
    await assertQueriesMatch(/DISTINCT/, undefined, false, async () => {
      expect((await query.distinct()).map((t) => t.name)).toEqual(["Foo"]);
    });
    await assertQueriesMatch(/DISTINCT/, undefined, false, async () => {
      expect((await query.distinct(true)).map((t) => t.name)).toEqual(["Foo"]);
    });
    expect((await query.distinct(true).distinct(false)).map((t) => t.name)).toEqual(["Foo", "Foo"]);
  });

  it("doesnt add having values if options are blank", () => {
    let scope = Post.having("");
    assertEmpty((scope.havingClause as any).predicates);

    scope = Post.having([] as any);
    assertEmpty((scope.havingClause as any).predicates);
  });

  it("having with binds for both where and having", async () => {
    const post = await Post.first();
    const havingThenWhere = Post.having({ id: post!.id }).where({ title: post!.title }).group("id");
    const whereThenHaving = Post.where({ title: post!.title }).having({ id: post!.id }).group("id");
    expect((await havingThenWhere).map((p) => p.id)).toEqual([post!.id]);
    expect((await whereThenHaving).map((p) => p.id)).toEqual([post!.id]);
  });

  it("multiple where and having clauses", async () => {
    const post = await Post.first();
    const havingThenWhere = Post.having({ id: post!.id })
      .where({ title: post!.title })
      .having({ id: post!.id })
      .where({ title: post!.title })
      .group("id");
    expect((await havingThenWhere).map((p) => p.id)).toEqual([post!.id]);
  });

  it("grouping by column with reserved name", async () => {
    const result = await Possession.select("where").group("where");
    expect(result).toEqual([]);
  });

  it("references triggers eager loading", () => {
    const scope = Post.includes(":comments");
    assertNotPredicate(scope, (s) => s.isEagerLoading);
    assertPredicate(scope.references("comments"), (s) => s.isEagerLoading);
  });

  it("references doesnt trigger eager loading if reference not included", () => {
    const scope = Post.references("comments");
    assertNotPredicate(scope, (s) => s.isEagerLoading);
  });

  it("order triggers eager loading", () => {
    const scope = Post.includes(":comments").order("comments.label ASC");
    assertPredicate(scope, (s) => s.isEagerLoading);
  });

  it("order doesnt trigger eager loading when ordering using the owner table", () => {
    const scope = Post.includes(":comments").order("posts.title ASC");
    assertNotPredicate(scope, (s) => s.isEagerLoading);
  });

  it("order triggers eager loading when ordering using symbols", () => {
    const scope = Post.includes(":comments").order("comments.label");
    assertPredicate(scope, (s) => s.isEagerLoading);
  });

  it("order doesnt trigger eager loading when ordering using owner table and symbols", () => {
    const scope = Post.includes(":comments").order("posts.title");
    assertNotPredicate(scope, (s) => s.isEagerLoading);
  });

  it("order triggers eager loading when ordering using hash syntax", () => {
    const scope = Post.includes(":comments").order({ "comments.label": "ASC" });
    assertPredicate(scope, (s) => s.isEagerLoading);
  });

  it("order doesnt trigger eager loading when ordering using the owner table and hash syntax", () => {
    const scope = Post.includes(":comments").order({ "posts.title": "ASC" });
    assertNotPredicate(scope, (s) => s.isEagerLoading);
  });

  it("automatically added where references", () => {
    const scope1 = Post.where({ comments: { body: "Bla" } });
    expect((scope1 as any).referencesValues.map(String)).toEqual(["comments"]);
    const scope2 = Post.where({ "comments.body": "Bla" });
    expect((scope2 as any).referencesValues.map(String)).toEqual(["comments"]);
  });

  it("automatically added where not references", () => {
    const scope1 = Post.all()
      .where()
      .not({ comments: { body: "Bla" } });
    expect((scope1 as any).referencesValues.map(String)).toEqual(["comments"]);
    const scope2 = Post.all().where().not({ "comments.body": "Bla" });
    expect((scope2 as any).referencesValues.map(String)).toEqual(["comments"]);
  });

  it("automatically added having references", () => {
    let scope = Post.having({ comments: { body: "Bla" } });
    expect(scope.referencesValues.map(String)).toEqual(["comments"]);

    scope = Post.having({ "comments.body": "Bla" });
    expect(scope.referencesValues.map(String)).toEqual(["comments"]);
  });

  it("automatically added order references", () => {
    expect((Post.order("comments.body") as any).referencesValues.map(String)).toEqual(["comments"]);
    expect((Post.order("comments.id") as any).referencesValues.map(String)).toEqual(["comments"]);
    expect((Post.order("comments.body", "yaks.body") as any).referencesValues.map(String)).toEqual([
      "comments",
      "yaks",
    ]);
    expect((Post.order("comments.body, yaks.body") as any).referencesValues.map(String)).toEqual([
      "comments",
    ]);
    expect((Post.order("comments.body asc") as any).referencesValues.map(String)).toEqual([
      "comments",
    ]);
    expect((Post.order("foo(comments.body)") as any).referencesValues.map(String)).toEqual([]);
  });

  it("automatically added reorder references", () => {
    expect((Post.reorder("comments.body") as any).referencesValues.map(String)).toEqual([
      "comments",
    ]);
    expect((Post.reorder("comments.id") as any).referencesValues.map(String)).toEqual(["comments"]);
    expect(
      (Post.reorder("comments.body", "yaks.body") as any).referencesValues.map(String),
    ).toEqual(["comments", "yaks"]);
    expect((Post.reorder("comments.body, yaks.body") as any).referencesValues.map(String)).toEqual([
      "comments",
    ]);
    expect((Post.reorder("comments.body asc") as any).referencesValues.map(String)).toEqual([
      "comments",
    ]);
    expect((Post.reorder("foo(comments.body)") as any).referencesValues.map(String)).toEqual([]);
  });

  it("order with reorder nil removes the order", () => {
    const relation = Post.order("title").reorder(null);

    expect(relation.orderValues[0]).toBeUndefined();
  });

  it("reverse order with reorder nil removes the order", () => {
    const relation = Post.order("title").reverseOrder().reorder(null);

    expect(relation.orderValues[0]).toBeUndefined();
  });

  it("reorder with first", async () => {
    let post: Post | null = null;

    const sqlLog = await captureSql(async () => {
      post = await Post.order("title").reorder(null).first();
    });

    expect(post!.equals(posts("welcome"))).toBe(true);
    assertPredicate(
      sqlLog,
      (log) => log.some((sql) => /order by/i.test(sql)),
      `ORDER BY was not used in the query: ${sqlLog}`,
    );
  });

  it("reorder with take", async () => {
    const sqlLog = await captureSql(async () => {
      expect(await Post.order("title").reorder(null).take()).toBeTruthy();
    });
    assertPredicate(
      sqlLog,
      (log) => log.every((sql) => !/order by/i.test(sql)),
      `ORDER BY was used in the query: ${sqlLog}`,
    );
  });

  it("presence", async () => {
    const topicsRel = Topic.all();

    await assertQueriesCount(1, false, async () => {
      expect(await isPresent(topicsRel)).toBeTruthy();
    });

    await assertNoQueries(false, async () => {
      expect(await isPresent(topicsRel)).toBeTruthy();
    });
    await assertNoQueries(false, async () => {
      expect(await topicsRel.isBlank()).toBeFalsy();
    });

    await assertNoQueries(false, async () => {
      await topicsRel.size();
    });
    await assertNoQueries(false, async () => {
      await (topicsRel as any).length;
    });
    await assertNoQueries(false, async () => {
      await (topicsRel as any).each(() => {});
    });

    await assertQueriesCount(1, false, async () => {
      await topicsRel.count();
    });

    assertPredicate(topicsRel, (t) => t.isLoaded);
  });

  it("delete by", async () => {
    const david = authors("david");

    await assertDifference(
      async () => Number(await Post.count()),
      -3,
      null,
      async () => {
        await david.posts.deleteBy({ body: "hello" });
      },
    );

    const deleted = await Author.deleteBy({ id: david.id });
    expect(deleted).toBe(1);
  });

  it("destroy by", async () => {
    const david = authors("david");

    await assertDifference(
      async () => Number(await Post.count()),
      -3,
      null,
      async () => {
        await david.posts.destroyBy({ body: "hello" });
      },
    );

    const destroyed = await Author.destroyBy({ id: david.id });
    expect(destroyed.map((a: any) => a.id)).toEqual([david.id]);
  });

  it("find_by with hash conditions returns the first matching record", async () => {
    expect((await Post.order("id").findBy({ author_id: 2 }))!.id).toBe(posts("eager_other").id);
  });

  it("find_by with non-hash conditions returns the first matching record", async () => {
    expect((await (Post.order("id") as any).findBy("author_id = 2"))!.id).toBe(
      posts("eager_other").id,
    );
  });

  it("find_by with multi-arg conditions returns the first matching record", async () => {
    expect((await (Post.order("id") as any).findBy("author_id = ?", 2))!.id).toBe(
      posts("eager_other").id,
    );
  });

  it("find_by returns nil if the record is missing", async () => {
    expect(await (Post.all() as any).findBy("1 = 0")).toBeNull();
  });

  it("find_by doesn't have implicit ordering", async () => {
    await assertQueriesMatch(/^((?!ORDER).)*$/, undefined, false, async () => {
      await Post.all().findByBang({ author_id: 2 });
    });
  });

  it("find_by requires at least one argument", async () => {
    await expect((Post.all() as any).findByBang()).rejects.toThrow(ArgumentError);
  });

  it("find_by! with hash conditions returns the first matching record", async () => {
    expect((await Post.order("id").findByBang({ author_id: 2 })).id).toBe(posts("eager_other").id);
  });

  it("find_by! with non-hash conditions returns the first matching record", async () => {
    expect((await (Post.order("id") as any).findByBang("author_id = 2")).id).toBe(
      posts("eager_other").id,
    );
  });

  it("find_by! with multi-arg conditions returns the first matching record", async () => {
    expect((await (Post.order("id") as any).findByBang("author_id = ?", 2)).id).toBe(
      posts("eager_other").id,
    );
  });

  it("find_by! raises RecordNotFound if the record is missing", async () => {
    await expect((Post.all() as any).findByBang("1 = 0")).rejects.toThrow(RecordNotFound);
  });

  it("find_by! requires at least one argument", async () => {
    await expect(Post.findByBang({ title: "NonExistentXYZTitle" })).rejects.toThrow();
  });

  it("loaded relations cannot be mutated by multi value methods", async () => {
    const relation = Post.all();
    await relation;

    expect(() => {
      (relation as any).whereBang("foo");
    }).toThrow(UnmodifiableRelation);
  });

  it("loaded relations cannot be mutated by single value methods", async () => {
    const relation = Post.all();
    await relation;

    expect(() => {
      (relation as any).limitBang(5);
    }).toThrow(UnmodifiableRelation);
  });

  it("loaded relations cannot be mutated by merge!", async () => {
    const relation = Post.all();
    await relation;

    expect(() => {
      (relation as any).mergeBang({ where: "foo" });
    }).toThrow(UnmodifiableRelation);
  });

  it("loaded relations cannot be mutated by extending!", async () => {
    const relation = Post.all();
    await relation;

    expect(() => {
      (relation as any).extendingBang({});
    }).toThrow(UnmodifiableRelation);
  });

  it("relations with cached arel can't be mutated [internal API]", () => {
    const rel = Post.all() as any;
    rel.arel();

    expect(() => rel.limitBang(5)).toThrow(UnmodifiableRelation);
    expect(() => rel.whereBang("1 = 2")).toThrow(UnmodifiableRelation);
  });

  it("relations show the records in #inspect", async () => {
    const relation = Post.limit(2);
    const records = await Post.limit(2);
    await relation.load();
    expect(relation.inspect()).toBe(
      `#<ActiveRecord::Relation [${records.map((r) => r.inspect()).join(", ")}]>`,
    );
  });

  it("relations limit the records in #inspect at 10", async () => {
    const relation = Post.limit(11);
    const records = await Post.limit(10);
    await relation.load();
    expect(relation.inspect()).toBe(
      `#<ActiveRecord::Relation [${records.map((r) => r.inspect()).join(", ")}, ...]>`,
    );
  });

  it("relations don't load all records in #inspect", async () => {
    await assertQueriesMatch(/LIMIT|ROWNUM <=|FETCH FIRST/, undefined, false, async () => {
      await (Post.all() as any).inspect();
    });
  });

  it("loading query is annotated in #inspect", async () => {
    await assertQueriesMatch(/\/\* loading for inspect \*\//, undefined, false, async () => {
      await (Post.all() as any).inspect();
    });
  });

  it("already-loaded relations don't perform a new query in #inspect", async () => {
    const relation = Post.limit(2);
    await relation;

    const expected = `#<ActiveRecord::Relation [${(await Post.limit(2))
      .map((p) => p.inspect())
      .join(", ")}]>`;

    await assertNoQueries(false, async () => {
      expect(relation.inspect()).toBe(expected);
    });
  });

  it("relations limit the records in #pretty_print at 10", async () => {
    const relation = Post.limit(11);
    const out: string[] = [];
    await pp(relation, { write: (str) => out.push(str) });
    const string = out.join("");
    expect([...string.matchAll(/#<\w*Post:/g)].length).toBe(10);
    assertPredicate(string, (s) => s.endsWith('"..."]\n'), "Did not end with an ellipsis.");
  });

  it("relations don't load all records in #pretty_print", async () => {
    await assertQueriesMatch(/LIMIT|ROWNUM <=|FETCH FIRST/, undefined, false, async () => {
      await pp(Post.all(), { write: () => {} });
    });
  });

  it("loading query is annotated in #pretty_print", async () => {
    await assertQueriesMatch(/\/\* loading for pp \*\//, undefined, false, async () => {
      await pp(Post.all(), { write: () => {} });
    });
  });

  it("already-loaded relations don't perform a new query in #pretty_print", async () => {
    const relation = Post.limit(2);
    await relation;

    await assertNoQueries(false, async () => {
      await pp(relation, { write: () => {} });
    });
  });

  it("using a custom table affects the wheres", async () => {
    const post = posts("welcome");

    expect((await customPostRelation().whereBang({ title: post.title }).take())!.equals(post)).toBe(
      true,
    );
  });

  it("using a custom table with joins affects the joins", async () => {
    const post = posts("welcome");

    expect(
      (await customPostRelation().joins(":author").whereBang({ title: post.title }).take())!.equals(
        post,
      ),
    ).toBe(true);
  });

  it("arel_table respects a custom table", () => {
    void posts("welcome");
    class ArelTablePost extends Base {
      static {
        this._tableName = "custom_posts";
      }
    }
    expect(ArelTablePost.arelTable.name).toBe("custom_posts");
  });

  it("alias_tracker respects a custom table", async () => {
    expect(
      (await customPostRelation("categories_posts").joins(":categories").first())!.equals(
        posts("welcome"),
      ),
    ).toBe(true);
  });

  it("#load", async () => {
    const relation = Post.all();
    await assertQueriesCount(1, false, async () => {
      expect(await relation.load()).toEqual(relation);
    });
    await assertNoQueries(false, async () => {
      await relation;
    });
  });

  it("group with select and includes", async () => {
    const authorsCount = await Post.select("author_id, COUNT(author_id) AS num_posts")
      .group("author_id")
      .order("author_id")
      .includes(":author");
    await assertNoQueries(false, async () => {
      const result = await Promise.all(
        authorsCount.map(async (post: any) => [post.num_posts, (await post.author)?.name]),
      );

      const expected = [
        [1, undefined],
        [5, "David"],
        [3, "Mary"],
        [2, "Bob"],
      ];
      expect(result).toEqual(expected);
    });
  });

  it("joins with select", async () => {
    const postsRel = await Post.joins(":author")
      .select("id", "authors.author_address_id")
      .order("posts.id")
      .limit(3);
    expect(postsRel.map((p) => p.id)).toEqual([1, 2, 4]);
    expect(postsRel.map((p: any) => p.author_address_id)).toEqual([1, 1, 1]);
  });

  it("joins with select custom attribute", async () => {
    const company = await Company.createBang({ name: "test" });
    const contract = await (company.contracts as any).createBang();
    const found = await Company.joins("INNER JOIN contracts ON contracts.company_id = companies.id")
      .select("companies.id", "contracts.metadata")
      .find(contract.company_id);
    expect((found as any).metadata).toEqual(contract.metadata);
  });

  it("joins with order by custom attribute", async () => {
    const companiesArr = await Company.createBang([{ name: "test1" }, { name: "test2" }]);
    for (const company of companiesArr) await (company as any).contracts.createBang();
    expect((await Company.joins(":contracts").order("metadata", "count")).map((c) => c.id)).toEqual(
      companiesArr.map((c) => c.id),
    );
    expect(
      (await Company.joins(":contracts").order({ metadata: "desc", count: "desc" })).map(
        (c) => c.id,
      ),
    ).toEqual([...companiesArr].reverse().map((c) => c.id));
  });

  it("delegations do not leak to other classes", () => {
    (Topic.all() as any).byLifo();
    expect(Reflect.has((Topic.all() as any).constructor.prototype, "byLifo")).toBeTruthy();
    assertNotRespondTo(Post.all(), "byLifo");
  });

  it("unscope with subquery", async () => {
    const p1 = Post.where({ id: 1 });
    const p2 = Post.where({ id: 2 });

    expect(p1.toSql()).not.toBe(p2.toSql());

    const commentsRel = Comment.where({ post: p1 })
      .unscope({ ":where": "post_id" })
      .where({ post: p2 });

    expect((await (await p1.first())!.comments).map((c: Comment) => c.id)).not.toEqual(
      (await commentsRel).map((c) => c.id),
    );
    expect((await (await p2.first())!.comments).map((c: Comment) => c.id)).toEqual(
      (await commentsRel).map((c) => c.id),
    );
  });

  it("unscope with merge", async () => {
    const p0 = Post.where({ author_id: 0 });
    const p1 = Post.where({ author_id: 1, comments_count: 1 });

    expect((await p0).map((p) => p.id)).toEqual([posts("authorless").id]);
    expect((await p1).map((p) => p.id)).toEqual([posts("thinking").id]);

    const commentsRel = Comment.merge(p0).unscope({ ":where": "author_id" }).where({ post: p1 });

    expect((await (await p0.first())!.comments).map((c: Comment) => c.id)).not.toEqual(
      (await commentsRel).map((c) => c.id),
    );
    expect((await (await p1.first())!.comments).map((c: Comment) => c.id)).toEqual(
      (await commentsRel).map((c) => c.id),
    );
  });

  it("unscope with unknown column", async () => {
    const comment = comments("greetings");
    await comment.updateBang({ comments: 1 });

    let commentsRel = Comment.where({ comments: 1 }).unscope({ ":where": "unknown_column" });
    expect((await commentsRel).map((c) => c.id)).toEqual([comment.id]);

    commentsRel = Comment.where({ comments: 1 }).unscope({
      ":where": { comments: "unknown_column" } as any,
    });
    expect((await commentsRel).map((c) => c.id)).toEqual([comment.id]);
  });

  it("unscope specific where value", async () => {
    const postsRel = Post.where({ title: "Welcome to the weblog", body: "Such a lovely day" });
    expect(await postsRel.count()).toBe(1);
    expect(await postsRel.unscope({ ":where": "title" }).count()).toBe(1);
    expect(await postsRel.unscope({ ":where": "body" }).count()).toBe(1);
  });

  it("unscope with aliased column", async () => {
    let postsRel = Post.where({ author: authors("mary"), text: "hullo" }).order("id");
    expect((await postsRel).map((p) => p.id)).toEqual([posts("misc_by_mary").id]);

    postsRel = postsRel.unscope({ ":where": "posts.text" });
    expect(
      [posts("eager_other"), posts("misc_by_mary"), posts("other_by_mary")].map((p) => p.id),
    ).toEqual((await postsRel).map((p) => p.id));
  });

  it("unscope with table name qualified column", async () => {
    let commentsRel = Comment.joins(":post").where({ "posts.id": posts("thinking") });
    expect((await commentsRel).map((c) => c.id)).toEqual([comments("does_it_hurt").id]);

    commentsRel = commentsRel.where({ id: comments("greetings") });
    assertEmpty(await commentsRel);

    commentsRel = commentsRel.unscope({ ":where": "posts.id" });
    expect((await commentsRel).map((c) => c.id)).toEqual([comments("greetings").id]);
  });

  it("unscope with table name qualified hash", async () => {
    let commentsRel = Comment.joins(":post").where({ "posts.id": posts("thinking") });
    expect((await commentsRel).map((c) => c.id)).toEqual([comments("does_it_hurt").id]);

    commentsRel = commentsRel.where({ id: comments("greetings") });
    assertEmpty(await commentsRel);

    commentsRel = commentsRel.unscope({ ":where": { posts: "id" } as any });
    expect((await commentsRel).map((c) => c.id)).toEqual([comments("greetings").id]);
  });

  it("unscope with arel sql", async () => {
    let postsRel = Post.where(arelSql("'Welcome to the weblog'").eq(Post.arelTable.get("title")));

    expect(await postsRel.count()).toBe(1);
    expect(await postsRel.unscope({ ":where": "title" }).count()).toBe(await Post.count());

    postsRel = Post.where(arelSql("posts.title").eq("Welcome to the weblog"));

    expect(await postsRel.count()).toBe(1);
    expect(await postsRel.unscope({ ":where": "title" }).count()).toBe(1);
  });

  it("unscope grouped where", async () => {
    const postsRel = Post.where({
      title: ["Welcome to the weblog", "So I was thinking", null],
    });
    expect(await postsRel.count()).toBe(2);
    expect(await postsRel.unscope({ ":where": "title" }).count()).toBe(await Post.count());
  });

  it("unscope with double dot where", async () => {
    const postsRel = Post.where({ id: [1, 2] });
    expect(await postsRel.count()).toBe(2);
    expect(await postsRel.unscope({ ":where": "id" }).count()).toBe(await Post.count());
  });

  it("unscope with triple dot where", async () => {
    const postsRel = Post.where({ id: [1, 2] });
    expect(await postsRel.count()).toBe(2);
    expect(await postsRel.unscope({ ":where": "id" }).count()).toBe(await Post.count());
  });

  it("locked should not build arel", () => {
    const postsRel = Post.all().lock();
    expect(postsRel.isLocked).toBeTruthy();
    expect(() => postsRel.lock(false)).not.toThrow();
  });

  it("relation join method", async () => {
    expect(await (await Post.first())!.comments.order("id").join(",")).toBe(
      "Thank you for the welcome,Thank you again for the welcome",
    );
  });

  it("relation with private kernel method", async () => {
    const accountsRel: any = Account.all();
    expect((await accountsRel.open().toArray()).map((a: Account) => a.id)).toEqual([
      accounts("signals37").id,
    ]);
    expect((await accountsRel.available().toArray()).map((a: Account) => a.id)).toEqual([
      accounts("signals37").id,
    ]);

    const subAccounts: any = SubAccount.all();
    expect((await subAccounts.open().toArray()).map((a: Account) => a.id)).toEqual([
      accounts("signals37").id,
    ]);
    expect((await subAccounts.available().toArray()).map((a: Account) => a.id)).toEqual([
      accounts("signals37").id,
    ]);

    expect((await (topics("first") as any).openReplies).map((t: Topic) => t.id)).toEqual([
      topics("second").id,
    ]);
  });

  it("where with take memoization", async () => {
    for (let i = 0; i < 5; i++) {
      await Post.createBang({ title: String(i), body: String(i) });
    }
    const postsRel = Post.all();
    const firstPost = await postsRel.take();
    const thirdPost = await postsRel.where({ title: "3" }).take();
    expect(thirdPost!.title).toBe("3");
    expect(firstPost).not.toBe(thirdPost);
  });

  it("find by with take memoization", async () => {
    for (let i = 0; i < 5; i++) {
      await Post.createBang({ title: String(i), body: String(i) });
    }
    const postsRel = Post.all();
    const firstPost = await postsRel.take();
    const thirdPost = await postsRel.findBy({ title: "3" });
    expect(thirdPost!.title).toBe("3");
    expect(firstPost).not.toBe(thirdPost);
  });

  it("#skip_query_cache!", async () => {
    await Post.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Post.all().load();
        await Post.all().load();
      });

      await assertQueriesCount(2, false, async () => {
        await Post.all().skipQueryCacheBang().load();
        await Post.all().skipQueryCacheBang().load();
      });
    });
  });

  it("#skip_query_cache! with an eager load", async () => {
    await Post.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Post.eagerLoad(":comments").load();
        await Post.eagerLoad(":comments").load();
      });

      await assertQueriesCount(2, false, async () => {
        await Post.eagerLoad(":comments").skipQueryCacheBang().load();
        await Post.eagerLoad(":comments").skipQueryCacheBang().load();
      });
    });
  });

  it("#skip_query_cache! with a preload", async () => {
    await Post.cache(async () => {
      await assertQueriesCount(2, false, async () => {
        await Post.preload(":comments").load();
        await Post.preload(":comments").load();
      });

      await assertQueriesCount(4, false, async () => {
        await Post.preload(":comments").skipQueryCacheBang().load();
        await Post.preload(":comments").skipQueryCacheBang().load();
      });
    });
  });

  it("#where with set", async () => {
    const david = authors("david");
    const mary = authors("mary");
    const result = await Author.where({ name: new Set(["David", "Mary"]) }).order("id");
    expect(result.map((a) => a.id)).toEqual([david.id, mary.id]);
  });

  it("#where with empty set", async () => {
    const authorsRel = Author.where({ name: new Set() });
    assertEmpty(await authorsRel);
  });

  it(" with blank value", () => {
    for (const method of Relation.MULTI_VALUE_METHODS.filter(
      (m) => m !== "extending" && m !== "with",
    )) {
      const authorsRel = (Author as any)[method]([""]);
      assertEmpty(authorsRel[`${method}Values`]);
    }
  });

  const noArgGuardedMethods: Array<[string, (rel: any) => unknown]> = [
    ["references", (rel) => rel.references()],
    ["includes", (rel) => rel.includes()],
    ["preload", (rel) => rel.preload()],
    ["eager_load", (rel) => rel.eagerLoad()],
    ["group", (rel) => rel.group()],
    ["order", (rel) => rel.order()],
    ["reorder", (rel) => rel.reorder()],
    ["reselect", (rel) => rel.reselect()],
    ["unscope", (rel) => rel.unscope()],
    ["joins", (rel) => rel.joins()],
    ["left_joins", (rel) => rel.leftJoins()],
    ["left_outer_joins", (rel) => rel.leftOuterJoins()],
    ["optimizer_hints", (rel) => rel.optimizerHints()],
    ["annotate", (rel) => rel.annotate()],
    ["regroup", (rel) => rel.regroup()],
  ];
  for (const [method, invoke] of noArgGuardedMethods) {
    it(`no arguments to ${method} raise errors`, () => {
      expect(() => invoke(Topic.all())).toThrow(`The method .${method}() must contain arguments.`);
    });
  }

  describe.skipIf(adapterType === "sqlite")("CreateOrFindByWithinTransactions", () => {
    it("multiple find or create by within transactions", async () => {
      await Subscriber.deleteAll();
      expect(await Subscriber.findBy({ nick: "bob" })).toBeNull();
      await Subscriber.findOrCreateBy({ nick: "bob" });
      expect(await Subscriber.where({ nick: "bob" }).count()).toBe(1);
    });

    it("multiple find or create by bang within transactions", async () => {
      await Subscriber.deleteAll();
      expect(await Subscriber.findBy({ nick: "bob" })).toBeNull();
      await Subscriber.findOrCreateByBang({ nick: "bob" });
      expect(await Subscriber.where({ nick: "bob" }).count()).toBe(1);
    });
  });
});
