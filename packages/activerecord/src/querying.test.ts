import { describe, it, expect, afterEach, vi } from "vitest";
import { Base, Relation } from "./index.js";
import { _queryBySql, _loadFromSql } from "./querying.js";
import { Result } from "./result.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Reply } from "./test-helpers/models/reply.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";

// Rails `fixtures :topics`. Recreate the canonical topics table empty so the
// forwarder/aggregate assertions run against a clean shape on the shared worker
// DB; the static forwarders only assert relation/promise types, not row data.
fixtures({ topics: [Topic, {}] }, { schema: canonicalSchema });

describe("QueryingTest — static forwarders on Base", () => {
  it("includes() returns a Relation without throwing", () => {
    expect(Topic.includes("author")).toBeInstanceOf(Relation);
  });

  it("preload() returns a Relation", () => {
    expect(Topic.preload("comments")).toBeInstanceOf(Relation);
  });

  it("eagerLoad() returns a Relation", () => {
    expect(Topic.eagerLoad("author")).toBeInstanceOf(Relation);
  });

  it("references() returns a Relation", () => {
    expect(Topic.references("authors")).toBeInstanceOf(Relation);
  });

  it("extending() returns a Relation", () => {
    expect(Topic.extending()).toBeInstanceOf(Relation);
  });

  it("unscope() static forwarder returns a Relation", () => {
    expect(Topic.unscope("where")).toBeInstanceOf(Relation);
  });

  it("reselect() returns a Relation", () => {
    expect(Topic.reselect("title")).toBeInstanceOf(Relation);
  });

  it("reorder() returns a Relation", () => {
    expect(Topic.reorder("title ASC")).toBeInstanceOf(Relation);
  });

  it("rewhere() returns a Relation", () => {
    expect(Topic.rewhere({ title: "x" })).toBeInstanceOf(Relation);
  });

  it("regroup() returns a Relation", () => {
    expect(Topic.regroup("approved")).toBeInstanceOf(Relation);
  });

  it("having() returns a Relation", () => {
    expect(Topic.having("COUNT(*) > 1")).toBeInstanceOf(Relation);
  });

  it("lock() returns a Relation", () => {
    expect(Topic.lock()).toBeInstanceOf(Relation);
  });

  it("readonly() returns a Relation", () => {
    expect(Topic.readonly()).toBeInstanceOf(Relation);
  });

  it("annotate() returns a Relation", () => {
    expect(Topic.annotate("hint")).toBeInstanceOf(Relation);
  });

  it("or() returns a Relation", () => {
    expect(Topic.where({ approved: true }).or(Topic.where({ approved: false }))).toBeInstanceOf(
      Relation,
    );
  });

  it("and() returns a Relation", () => {
    expect(Topic.where({ approved: true }).and(Topic.where({ title: "x" }))).toBeInstanceOf(
      Relation,
    );
  });

  it("inOrderOf() returns a Relation", () => {
    expect(Topic.inOrderOf("approved", [true, false])).toBeInstanceOf(Relation);
  });

  it("strictLoading() returns a Relation", () => {
    expect(Topic.strictLoading()).toBeInstanceOf(Relation);
  });

  it("createWith() returns a Relation", () => {
    expect(Topic.createWith({ approved: true })).toBeInstanceOf(Relation);
  });

  it("createWith(null) resets create-with attrs and returns a Relation", () => {
    expect(Topic.createWith(null)).toBeInstanceOf(Relation);
  });

  it("excluding() returns a Relation", () => {
    expect(Topic.excluding()).toBeInstanceOf(Relation);
  });

  it("withCte() returns a Relation", () => {
    expect(Topic.withCte({ recent: "SELECT 1" })).toBeInstanceOf(Relation);
  });

  it("Post.with (Rails alias for withCte) is wired and returns a Relation", () => {
    expect(Topic["with"]({ recent: "SELECT 1" })).toBeInstanceOf(Relation);
  });

  it("withRecursive() returns a Relation", () => {
    expect(Topic.withRecursive({ tree: "SELECT 1" })).toBeInstanceOf(Relation);
  });

  it("asyncIds() returns a Promise", async () => {
    const p = Topic.asyncIds();
    expect(p).toBeInstanceOf(Promise);
    await p;
  });

  it("includes().where() chains and produces valid SQL", () => {
    const rel = Topic.includes("author").where({ title: "published" });
    expect(rel).toBeInstanceOf(Relation);
    const sql = rel.toSql();
    expect(sql).toContain("topics");
  });

  it("invertWhere() static forwarder returns a Relation", () => {
    expect(Topic.invertWhere()).toBeInstanceOf(Relation);
  });

  it("without() returns a Relation", () => {
    expect(Topic.without()).toBeInstanceOf(Relation);
  });

  it("only() returns a Relation", () => {
    expect(Topic.only("where")).toBeInstanceOf(Relation);
  });

  it("merge() returns a Relation", () => {
    expect(Topic.merge(Topic.where({ approved: true }))).toBeInstanceOf(Relation);
  });

  it("except() removes the named query part (SpawnMethods#except)", () => {
    const sql = Topic.order("id").except("order").toSql();
    expect(sql).not.toContain("ORDER BY");
  });

  it("except() does not re-erase the part when later merged (unlike unscope)", () => {
    // Rails `except(:order)` deletes values one-shot; it must not record
    // unscope_values, so merging the result preserves the other side's order.
    const merged = Topic.except("order").merge(Topic.order("id"));
    expect(merged.toSql()).toContain("ORDER BY");
  });

  it("extractAssociated() returns a Promise", async () => {
    const p = Topic.extractAssociated("replies");
    expect(p).toBeInstanceOf(Promise);
    expect(await p).toEqual([]);
  });

  it("calculate() returns a Promise", async () => {
    const p = Topic.calculate("count");
    expect(p).toBeInstanceOf(Promise);
    await p;
  });

  it("asyncCount() returns a Promise", async () => {
    const p = Topic.asyncCount();
    expect(p).toBeInstanceOf(Promise);
    await p;
  });

  it("asyncAverage() returns a Promise", async () => {
    const p = Topic.asyncAverage("id");
    expect(p).toBeInstanceOf(Promise);
    await p;
  });

  it("asyncMinimum() returns a Promise", async () => {
    const p = Topic.asyncMinimum("id");
    expect(p).toBeInstanceOf(Promise);
    await p;
  });

  it("asyncMaximum() returns a Promise", async () => {
    const p = Topic.asyncMaximum("id");
    expect(p).toBeInstanceOf(Promise);
    await p;
  });

  it("asyncSum() returns a Promise", async () => {
    const p = Topic.asyncSum("id");
    expect(p).toBeInstanceOf(Promise);
    await p;
  });

  it("asyncPluck() returns a Promise", async () => {
    const p = Topic.asyncPluck("id");
    expect(p).toBeInstanceOf(Promise);
    await p;
  });

  it("asyncPick() returns a Promise", async () => {
    const p = Topic.asyncPick("id");
    expect(p).toBeInstanceOf(Promise);
    await p;
  });
});

describe("_queryBySql — kwargs pass-through (Story J gap 1)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts preparable/async/allowRetry opts without error", async () => {
    vi.spyOn(Topic.connection, "execQuery").mockResolvedValueOnce(Result.fromRowHashes([]));
    // _queryBySql returns the full Result so _loadFromSql can read column_types.
    const result = await _queryBySql.call(Topic, "SELECT 1", [], {
      preparable: true,
      async: false,
      allowRetry: true,
    });
    expect(result.toArray()).toEqual([]);
  });

  it("opts default to empty object — omitting opts still works", async () => {
    vi.spyOn(Topic.connection, "execQuery").mockResolvedValueOnce(
      Result.fromRowHashes([{ id: 1 }]),
    );
    const result = await _queryBySql.call(Topic, "SELECT 1");
    expect(result.toArray()).toEqual([{ id: 1 }]);
  });
});

describe("_loadFromSql — STI detection (Story J gap 2)", () => {
  it("dispatches to the correct STI subclass when inheritance column is present", () => {
    const rows = [{ id: 1, type: Reply.name, title: "Rex" }];
    const records = _loadFromSql.call(Topic as typeof Base, rows);
    expect(records[0]).toBeInstanceOf(Reply);
  });

  it("instantiates as the base class when inheritance column is absent from result set", () => {
    const rows = [{ id: 1, title: "Rex" }];
    const records = _loadFromSql.call(Topic as typeof Base, rows);
    expect(records[0]).toBeInstanceOf(Topic);
  });

  it("returns empty array for empty result set", () => {
    expect(_loadFromSql.call(Topic as typeof Base, [])).toEqual([]);
  });
});
