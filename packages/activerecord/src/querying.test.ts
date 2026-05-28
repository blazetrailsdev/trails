import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { Base, Relation } from "./index.js";
import { registerModel } from "./associations.js";
import { _queryBySql, _loadFromSql } from "./querying.js";
import { createTestAdapter } from "./test-adapter.js";
import { Result } from "./result.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({
    post_classes: { title: "string", status: "string" },
  });
});
describe("QueryingTest — static forwarders on Base", () => {
  let Post: typeof Base;

  beforeAll(() => {
    class PostClass extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("status", "string");
      }
    }
    Post = PostClass;
  });

  it("includes() returns a Relation without throwing", () => {
    expect(Post.includes("author")).toBeInstanceOf(Relation);
  });

  it("preload() returns a Relation", () => {
    expect(Post.preload("comments")).toBeInstanceOf(Relation);
  });

  it("eagerLoad() returns a Relation", () => {
    expect(Post.eagerLoad("author")).toBeInstanceOf(Relation);
  });

  it("references() returns a Relation", () => {
    expect(Post.references("authors")).toBeInstanceOf(Relation);
  });

  it("extending() returns a Relation", () => {
    expect(Post.extending()).toBeInstanceOf(Relation);
  });

  it("unscope() static forwarder returns a Relation", () => {
    expect(Post.unscope("where")).toBeInstanceOf(Relation);
  });

  it("reselect() returns a Relation", () => {
    expect(Post.reselect("title")).toBeInstanceOf(Relation);
  });

  it("reorder() returns a Relation", () => {
    expect(Post.reorder("title ASC")).toBeInstanceOf(Relation);
  });

  it("rewhere() returns a Relation", () => {
    expect(Post.rewhere({ title: "x" })).toBeInstanceOf(Relation);
  });

  it("regroup() returns a Relation", () => {
    expect(Post.regroup("status")).toBeInstanceOf(Relation);
  });

  it("having() returns a Relation", () => {
    expect(Post.having("COUNT(*) > 1")).toBeInstanceOf(Relation);
  });

  it("lock() returns a Relation", () => {
    expect(Post.lock()).toBeInstanceOf(Relation);
  });

  it("readonly() returns a Relation", () => {
    expect(Post.readonly()).toBeInstanceOf(Relation);
  });

  it("annotate() returns a Relation", () => {
    expect(Post.annotate("hint")).toBeInstanceOf(Relation);
  });

  it("or() returns a Relation", () => {
    expect(Post.where({ status: "a" }).or(Post.where({ status: "b" }))).toBeInstanceOf(Relation);
  });

  it("and() returns a Relation", () => {
    expect(Post.where({ status: "a" }).and(Post.where({ title: "x" }))).toBeInstanceOf(Relation);
  });

  it("inOrderOf() returns a Relation", () => {
    expect(Post.inOrderOf("status", ["draft", "published"])).toBeInstanceOf(Relation);
  });

  it("strictLoading() returns a Relation", () => {
    expect(Post.strictLoading()).toBeInstanceOf(Relation);
  });

  it("createWith() returns a Relation", () => {
    expect(Post.createWith({ status: "draft" })).toBeInstanceOf(Relation);
  });

  it("createWith(null) resets create-with attrs and returns a Relation", () => {
    expect(Post.createWith(null)).toBeInstanceOf(Relation);
  });

  it("excluding() returns a Relation", () => {
    expect(Post.excluding()).toBeInstanceOf(Relation);
  });

  it("withCte() returns a Relation", () => {
    expect(Post.withCte({ recent: "SELECT 1" })).toBeInstanceOf(Relation);
  });

  it("Post.with (Rails alias for withCte) is wired and returns a Relation", () => {
    expect(Post["with"]({ recent: "SELECT 1" })).toBeInstanceOf(Relation);
  });

  it("withRecursive() returns a Relation", () => {
    expect(Post.withRecursive({ tree: "SELECT 1" })).toBeInstanceOf(Relation);
  });

  it("asyncIds() returns a Promise", async () => {
    const p = Post.asyncIds();
    expect(p).toBeInstanceOf(Promise);
    await p;
  });

  it("includes().where() chains and produces valid SQL", () => {
    const rel = Post.includes("author").where({ status: "published" });
    expect(rel).toBeInstanceOf(Relation);
    const sql = rel.toSql();
    expect(sql).toContain("post_classes");
  });

  it("invertWhere() static forwarder returns a Relation", () => {
    expect(Post.invertWhere()).toBeInstanceOf(Relation);
  });

  it("without() returns a Relation", () => {
    expect(Post.without()).toBeInstanceOf(Relation);
  });

  it("only() returns a Relation", () => {
    expect(Post.only("where")).toBeInstanceOf(Relation);
  });

  it("merge() returns a Relation", () => {
    expect(Post.merge(Post.where({ status: "draft" }))).toBeInstanceOf(Relation);
  });
});

describe("_queryBySql — kwargs pass-through (Story J gap 1)", () => {
  let Model: typeof Base;

  afterEach(() => vi.restoreAllMocks());

  beforeAll(() => {
    const a = createTestAdapter();
    class M extends Base {
      static {
        this.adapter = a;
        this.attribute("id", "integer");
      }
    }
    Model = M;
  });

  it("accepts preparable/async/allowRetry opts without error", async () => {
    vi.spyOn(Model.adapter, "execQuery").mockResolvedValueOnce(Result.fromRowHashes([]));
    await expect(
      _queryBySql.call(Model, "SELECT 1", [], { preparable: true, async: false, allowRetry: true }),
    ).resolves.toEqual([]);
  });

  it("opts default to empty object — omitting opts still works", async () => {
    vi.spyOn(Model.adapter, "execQuery").mockResolvedValueOnce(Result.fromRowHashes([{ id: 1 }]));
    const rows = await _queryBySql.call(Model, "SELECT 1");
    expect(rows).toEqual([{ id: 1 }]);
  });
});

describe("_loadFromSql — STI detection (Story J gap 2)", () => {
  let Animal: typeof Base;
  let Dog: typeof Base;

  beforeAll(() => {
    const a = createTestAdapter();
    class AnimalClass extends Base {
      static {
        this.adapter = a;
        this.inheritanceColumn = "type";
        this.attribute("id", "integer");
        this.attribute("type", "string");
        this.attribute("name", "string");
      }
    }
    class DogClass extends AnimalClass {}
    Animal = AnimalClass;
    Dog = DogClass;
    registerModel(Animal);
    registerModel(Dog);
  });

  it("dispatches to the correct STI subclass when inheritance column is present", () => {
    const rows = [{ id: 1, type: Dog.name, name: "Rex" }];
    const records = _loadFromSql.call(Animal, rows);
    expect(records[0]).toBeInstanceOf(Dog);
  });

  it("instantiates as the base class when inheritance column is absent from result set", () => {
    const rows = [{ id: 1, name: "Rex" }];
    const records = _loadFromSql.call(Animal, rows);
    expect(records[0]).toBeInstanceOf(Animal);
  });

  it("returns empty array for empty result set", () => {
    expect(_loadFromSql.call(Animal, [])).toEqual([]);
  });
});
