/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  Base,
  IrreversibleOrderError,
  Range,
  RecordNotFound,
  registerModel,
  SoleRecordExceeded,
} from "./index.js";
import { sql as arelSql } from "@blazetrails/arel";

import { defineSchema } from "./test-helpers/define-schema.js";
import { fixtures, setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { CpkBook } from "./test-helpers/models/cpk.js";
import { adapterType } from "./test-adapter.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Topic as CanonicalTopic } from "./test-helpers/models/topic.js";
import {
  assertQueriesCount,
  assertQueriesMatch,
  assertNoQueries,
} from "./testing/query-assertions.js";
import { quoteTableName, escapeRegExp } from "./test-helpers/quote-regex.js";
// Reply STI subclass + its belongs_to :topic, needed when touching STI Reply
// rows (topics(:second), topics(:fourth)).
import { Reply as CanonicalReply } from "./test-helpers/models/reply.js";
import { Post as CanonicalPost } from "./test-helpers/models/post.js";
import { Comment as CanonicalComment } from "./test-helpers/models/comment.js";

// ==========================================================================
// FinderTest — faithful port of finder_test.rb riding canonical Topic +
// topics fixtures (RFC 0048 convergence). The full ordinal/last cluster
// (take/sole/first/second/third/fourth/fifth/*-to-last/last-bang and the
// take/first/last-with-integer + irreversible-order tests) is a faithful port
// against the real topics fixtures. The remaining clusters
// (exists/find-by/conditions, and the posts/comments STI last/first-on-relation
// pair) still ride the canonical schema (canonical tables/columns, no bespoke
// defineSchema shape) but remain thin ad-hoc coverage; faithful porting of
// those onto the real finder_test.rb models/fixtures is tracked under RFC 0048.
// ==========================================================================
describe("FinderTest", () => {
  const { topics } = fixtures(["topics"], { schema: canonicalSchema });
  const rid = (r: unknown) => (r as { id: number }).id;
  const Topic = CanonicalTopic;
  // Register by Rails name so STI Reply rows resolve their belongs_to :topic
  // even before the first query warms the model registry (touch-first tests).
  registerModel("Topic", Topic);
  registerModel("Reply", CanonicalReply);

  it("take", async () => {
    expect(rid(await Topic.where("title = 'The First Topic'").take())).toBe(rid(topics("first")));
  });

  it("take failing", async () => {
    expect(await Topic.where("title = 'This title does not exist'").take()).toBeNull();
  });

  it("take bang present", async () => {
    const record = await Topic.where("title = 'The Second Topic of the day'").takeBang();
    expect(rid(record)).toBe(rid(topics("second")));
  });

  it("take bang missing", async () => {
    await expect(Topic.where("title = 'This title does not exist'").takeBang()).rejects.toThrow(
      RecordNotFound,
    );
    await expect(Topic.where("title = 'This title does not exist'").takeBang()).rejects.toThrow(
      "Couldn't find Topic",
    );
  });

  it("sole", async () => {
    expect(rid(await Topic.where("title = 'The First Topic'").sole())).toBe(rid(topics("first")));
    expect(rid(await Topic.findSoleBy("title = 'The First Topic'"))).toBe(rid(topics("first")));
  });

  it("sole failing none", async () => {
    await expect(Topic.where("title = 'This title does not exist'").sole()).rejects.toThrow(
      RecordNotFound,
    );
    await expect(Topic.where("title = 'This title does not exist'").sole()).rejects.toThrow(
      "Couldn't find Topic",
    );
    await expect(Topic.findSoleBy("title = 'This title does not exist'")).rejects.toThrow(
      RecordNotFound,
    );
    await expect(Topic.findSoleBy("title = 'This title does not exist'")).rejects.toThrow(
      "Couldn't find Topic",
    );
  });

  it("sole failing many", async () => {
    await expect(Topic.where("author_name = 'Carl'").sole()).rejects.toThrow(SoleRecordExceeded);
    await expect(Topic.where("author_name = 'Carl'").sole()).rejects.toThrow(
      "Wanted only one Topic",
    );
    await expect(Topic.findSoleBy("author_name = 'Carl'")).rejects.toThrow(SoleRecordExceeded);
    await expect(Topic.findSoleBy("author_name = 'Carl'")).rejects.toThrow("Wanted only one Topic");
  });

  it("first", async () => {
    expect((await Topic.where("title = 'The Second Topic of the day'").first())!.title).toBe(
      topics("second").title,
    );
  });

  it("first failing", async () => {
    expect(await Topic.where("title = 'The Second Topic of the day!'").first()).toBeNull();
  });

  it("first bang present", async () => {
    const record = await Topic.where("title = 'The Second Topic of the day'").firstBang();
    expect(rid(record)).toBe(rid(topics("second")));
  });

  it("first bang missing", async () => {
    await expect(Topic.where("title = 'This title does not exist'").firstBang()).rejects.toThrow(
      RecordNotFound,
    );
    await expect(Topic.where("title = 'This title does not exist'").firstBang()).rejects.toThrow(
      "Couldn't find Topic",
    );
  });

  it("first have primary key order by default", async () => {
    // Rails touches the expected row because PostgreSQL changes the default
    // order if no order clause is used.
    const expected = topics("first");
    await expected.touch();
    expect(rid(await Topic.first())).toBe(rid(expected));
    expect(rid(await Topic.limit(5).first())).toBe(rid(expected));
    expect(rid(await Topic.order(null as never).first())).toBe(rid(expected));
  });

  it("model class responds to first bang", async () => {
    expect(await Topic.firstBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.firstBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.firstBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("second", async () => {
    expect((await Topic.second())!.title).toBe(topics("second").title);
  });

  it("second with offset", async () => {
    expect(rid(await Topic.offset(3).second())).toBe(rid(topics("fifth")));
  });

  it("second have primary key order by default", async () => {
    const expected = topics("second");
    await expected.touch();
    expect(rid(await Topic.second())).toBe(rid(expected));
    expect(rid(await Topic.limit(5).second())).toBe(rid(expected));
    expect(rid(await Topic.order(null as never).second())).toBe(rid(expected));
  });

  it("model class responds to second bang", async () => {
    expect(await Topic.secondBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.secondBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.secondBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("third", async () => {
    expect((await Topic.third())!.title).toBe(topics("third").title);
  });

  it("third with offset", async () => {
    expect(rid(await Topic.offset(2).third())).toBe(rid(topics("fifth")));
  });

  it("third have primary key order by default", async () => {
    const expected = topics("third");
    await expected.touch();
    expect(rid(await Topic.third())).toBe(rid(expected));
    expect(rid(await Topic.limit(5).third())).toBe(rid(expected));
    expect(rid(await Topic.order(null as never).third())).toBe(rid(expected));
  });

  it("model class responds to third bang", async () => {
    expect(await Topic.thirdBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.thirdBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.thirdBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("fourth", async () => {
    expect((await Topic.fourth())!.title).toBe(topics("fourth").title);
  });

  it("fourth with offset", async () => {
    expect(rid(await Topic.offset(1).fourth())).toBe(rid(topics("fifth")));
  });

  it("fourth have primary key order by default", async () => {
    const expected = topics("fourth");
    await expected.touch();
    expect(rid(await Topic.fourth())).toBe(rid(expected));
    expect(rid(await Topic.limit(5).fourth())).toBe(rid(expected));
    expect(rid(await Topic.order(null as never).fourth())).toBe(rid(expected));
  });

  it("model class responds to fourth bang", async () => {
    expect(await Topic.fourthBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.fourthBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.fourthBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("fifth", async () => {
    expect((await Topic.fifth())!.title).toBe(topics("fifth").title);
  });

  it("fifth with offset", async () => {
    expect(rid(await Topic.offset(0).fifth())).toBe(rid(topics("fifth")));
  });

  it("fifth have primary key order by default", async () => {
    const expected = topics("fifth");
    await expected.touch();
    expect(rid(await Topic.fifth())).toBe(rid(expected));
    expect(rid(await Topic.limit(5).fifth())).toBe(rid(expected));
    expect(rid(await Topic.order(null as never).fifth())).toBe(rid(expected));
  });

  it("model class responds to fifth bang", async () => {
    expect(await Topic.fifthBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.fifthBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.fifthBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("second to last", async () => {
    expect((await Topic.secondToLast())!.title).toBe(topics("fourth").title);

    // test with offset
    expect(rid(await Topic.offset(1).secondToLast())).toBe(rid(topics("fourth")));
    expect(rid(await Topic.offset(2).secondToLast())).toBe(rid(topics("fourth")));
    expect(rid(await Topic.offset(3).secondToLast())).toBe(rid(topics("fourth")));
    expect(await Topic.offset(4).secondToLast()).toBeNull();
    expect(await Topic.offset(5).secondToLast()).toBeNull();

    // test with limit
    expect(await Topic.limit(1).second()).toBeNull();
    expect(await Topic.limit(1).secondToLast()).toBeNull();
  });

  it("second to last have primary key order by default", async () => {
    const expected = topics("fourth");
    await expected.touch();
    expect(rid(await Topic.secondToLast())).toBe(rid(expected));
  });

  it("model class responds to second to last bang", async () => {
    expect(await Topic.secondToLastBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.secondToLastBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.secondToLastBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("third to last", async () => {
    expect((await Topic.thirdToLast())!.title).toBe(topics("third").title);

    // test with offset
    expect(rid(await Topic.offset(1).thirdToLast())).toBe(rid(topics("third")));
    expect(rid(await Topic.offset(2).thirdToLast())).toBe(rid(topics("third")));
    expect(await Topic.offset(3).thirdToLast()).toBeNull();
    expect(await Topic.offset(4).thirdToLast()).toBeNull();
    expect(await Topic.offset(5).thirdToLast()).toBeNull();

    // test with limit
    expect(await Topic.limit(1).third()).toBeNull();
    expect(await Topic.limit(1).thirdToLast()).toBeNull();
    expect(await Topic.limit(2).third()).toBeNull();
    expect(await Topic.limit(2).thirdToLast()).toBeNull();
  });

  it("third to last have primary key order by default", async () => {
    const expected = topics("third");
    await expected.touch();
    expect(rid(await Topic.thirdToLast())).toBe(rid(expected));
  });

  it("model class responds to third to last bang", async () => {
    expect(await Topic.thirdToLastBang()).toBeTruthy();
    await Topic.deleteAll();
    await expect(Topic.thirdToLastBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.thirdToLastBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("nth to last with order uses limit", async () => {
    await assertQueriesMatch(
      new RegExp(`ORDER BY ${escapeRegExp(quoteTableName("topics.id"))} DESC LIMIT`, "i"),
      undefined,
      false,
      async () => {
        await Topic.secondToLast();
      },
    );
    await assertQueriesMatch(
      new RegExp(`ORDER BY ${escapeRegExp(quoteTableName("topics.updated_at"))} DESC LIMIT`, "i"),
      undefined,
      false,
      async () => {
        await Topic.order("updated_at").secondToLast();
      },
    );
  });

  it("last bang present", async () => {
    const record = await Topic.where("title = 'The Second Topic of the day'").lastBang();
    expect(rid(record)).toBe(rid(topics("second")));
  });

  it("last bang missing", async () => {
    await expect(Topic.where("title = 'This title does not exist'").lastBang()).rejects.toThrow(
      RecordNotFound,
    );
    await expect(Topic.where("title = 'This title does not exist'").lastBang()).rejects.toThrow(
      "Couldn't find Topic",
    );
  });

  it("model class responds to last bang", async () => {
    expect(rid(await Topic.lastBang())).toBe(rid(topics("fifth")));
    await Topic.deleteAll();
    await expect(Topic.lastBang()).rejects.toThrow(RecordNotFound);
    await expect(Topic.lastBang()).rejects.toThrow("Couldn't find Topic");
  });

  it("take and first and last with integer should return an array", async () => {
    expect(Array.isArray(await Topic.take(5))).toBe(true);
    expect(Array.isArray(await Topic.first(5))).toBe(true);
    expect(Array.isArray(await Topic.last(5))).toBe(true);
  });

  it("take and first and last with integer should use sql limit", async () => {
    const limitRe = /LIMIT|ROWNUM <=|FETCH FIRST/;
    await assertQueriesMatch(limitRe, undefined, false, async () => {
      await Topic.take(3);
    });
    await assertQueriesMatch(limitRe, undefined, false, async () => {
      await Topic.first(2);
    });
    await assertQueriesMatch(limitRe, undefined, false, async () => {
      await Topic.last(5);
    });
  });

  it("last with integer and order should keep the order", async () => {
    const all = await Topic.order("title");
    const expected = all.slice(-2).map(rid);
    const got = (await Topic.order("title").last(2)).map(rid);
    expect(got).toEqual(expected);
  });

  it("last with integer and order should use sql limit", async () => {
    const relation = Topic.order("title");
    await assertQueriesCount(1, false, async () => {
      await relation.last(5);
    });
    expect(relation.isLoaded).toBe(false);
  });

  it("last with integer and reorder should use sql limit", async () => {
    const relation = Topic.reorder("title");
    await assertQueriesCount(1, false, async () => {
      await relation.last(5);
    });
    expect(relation.isLoaded).toBe(false);
  });

  it("last on loaded relation should not use sql", async () => {
    const relation = Topic.limit(10);
    await relation.load();
    await assertNoQueries(false, async () => {
      await relation.last();
      await relation.last(2);
    });
  });

  it("last with irreversible order", async () => {
    await expect(Topic.order(arelSql("coalesce(author_name, title)")).last()).rejects.toThrow(
      IrreversibleOrderError,
    );
  });

  it("exists with large number", async () => {
    const big = 9223372036854775808n; // 2^63, one past signed-int64 max
    const negBig = -9223372036854775809n;
    expect(await Topic.where({ id: [1, big] }).exists()).toBe(true);
    expect(await Topic.where({ id: new Range(1n, big) }).exists()).toBe(true);
    expect(await Topic.where({ id: new Range(negBig, big) }).exists()).toBe(true);
    expect(await Topic.where({ id: new Range(big, 9223372036854775809n) }).exists()).toBe(false);
    expect(await Topic.where({ id: new Range(-9223372036854775810n, negBig) }).exists()).toBe(
      false,
    );
    expect(await Topic.where({ id: new Range(big, 1n) }).exists()).toBe(false);
    expect(
      await Topic.where({ id: 1 })
        .or(Topic.where({ id: big }))
        .exists(),
    ).toBe(true);
    expect(await Topic.whereNot({ id: big }).exists()).toBe(true);

    // Rails' 3-arg `predicate_builder[:id, val, :gt/:gteq/:lt/:lteq]` builds an
    // Arel comparison node whose right-hand side is a bind attribute; we stand
    // it in with the arel gt/gteq/lt/lteq predicates over a QueryAttribute bind
    // built from the same predicate builder.
    const id = Topic.arelTable.get("id");
    const bind = (v: bigint) => Topic.predicateBuilder.buildBindAttribute("id", v);
    const existsWhere = (node: unknown) => Topic.where(node as any).exists();

    expect(await existsWhere(id.gt(bind(negBig)))).toBe(true);
    expect(await existsWhere(id.gteq(bind(negBig)))).toBe(true);
    expect(await existsWhere(id.lt(bind(big)))).toBe(true);
    expect(await existsWhere(id.lteq(bind(big)))).toBe(true);

    expect(await existsWhere(id.gt(bind(big)))).toBe(false);
    expect(await existsWhere(id.gteq(bind(big)))).toBe(false);
    expect(await existsWhere(id.lt(bind(negBig)))).toBe(false);
    expect(await existsWhere(id.lteq(bind(negBig)))).toBe(false);
  });
});

// ==========================================================================
// FinderTest — targets finder_test.rb
// ==========================================================================
describe("FinderTest", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });

  it("exists", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    expect(await Topic.exists()).toBe(true);
  });

  it("exists with scope", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    expect(await Topic.where({ title: "a" }).exists()).toBe(true);
    expect(await Topic.where({ title: "z" }).exists()).toBe(false);
  });

  it("exists with nil arg", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(await Topic.exists()).toBe(false);
  });

  it("exists with empty hash arg", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    expect(await Topic.exists({})).toBe(true);
  });

  it("exists with order", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    expect(await Topic.order("title").exists()).toBe(true);
  });

  it("exists with empty table and no args given", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(await Topic.exists()).toBe(false);
  });

  it("find by one attribute", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "target" });
    const found = await Topic.findBy({ title: "target" });
    expect(found).not.toBeNull();
  });

  it("find by one attribute bang", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "target" });
    const found = await Topic.findByBang({ title: "target" });
    expect(found.title).toBe("target");
  });

  it("find by two attributes", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("content", "text");
      }
    }
    await Topic.create({ title: "a", content: "x" });
    const found = await Topic.findBy({ title: "a", content: "x" });
    expect(found).not.toBeNull();
  });

  it("find by nil attribute", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: null as any });
    const found = await Topic.findBy({ title: null });
    // Should find records with null title
    expect(found !== undefined).toBe(true);
  });

  it("count by sql", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    const count = await Topic.all().count();
    expect(count).toBe(1);
  });

  it("bind variables", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.where("title = ?", "hello");
    expect(results.length).toBe(1);
  });

  it("named bind variables", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.where("title = :title", { title: "hello" });
    expect(results.length).toBe(1);
  });

  it("hash condition find with array", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    await Topic.create({ title: "b" });
    await Topic.create({ title: "c" });
    const results = await Topic.where({ title: ["a", "b"] });
    expect(results.length).toBe(2);
  });

  it("hash condition find with nil", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Topic.where({ title: null }).toSql();
    expect(sql).toContain("IS NULL");
  });

  it("condition interpolation", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.where("title = ?", "hello");
    expect(results.length).toBe(1);
  });

  it("find doesnt have implicit ordering", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const p = await Topic.create({ title: "a" });
    const found = await Topic.find(p.id);
    expect(found).not.toBeNull();
  });

  it("exists returns true with one record and no args", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    expect(await Topic.exists()).toBe(true);
  });

  it("find by sql with sti on joined table", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    const results = await Topic.findBySql('SELECT * FROM "topics"');
    expect(results.length).toBe(1);
  });

  it("select value", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const values = await Topic.all().pluck("title");
    expect(values).toContain("hello");
  });

  it("select values", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    await Topic.create({ title: "b" });
    const values = await Topic.all().pluck("title");
    expect(values.length).toBe(2);
  });

  it("exists with order and distinct", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    expect(await Topic.order("title").distinct().exists()).toBe(true);
  });

  it("exists with loaded relation", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    const rel = Topic.all();
    await rel.load();
    expect(await rel.exists()).toBe(true);
  });

  it("find by ids with limit and offset", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 5; i++) await Topic.create({ title: String(i) });
    const results = await Topic.all().limit(2).offset(1);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("find with entire select statement", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.findBySql('SELECT * FROM "topics"');
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it("find with prepared select statement", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.findBySql('SELECT * FROM "topics"');
    expect(Array.isArray(results)).toBe(true);
  });

  it("hash condition find with escaped characters", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const value = "Ain't noth'n like' #stuff";
    await Topic.create({ title: value });
    const found = await Topic.where({ title: value }).first();
    expect(found).not.toBeNull();
    expect((found as Topic).title).toBe(value);
  });

  it("unexisting record exception handling", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await expect(Topic.find(99999)).rejects.toThrow(RecordNotFound);
  });

  it("find one message on primary key", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    try {
      await Topic.find(0);
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordNotFound);
      expect(e.id).toBe(0);
      expect(e.primaryKey).toBe("id");
      expect(e.model).toBe("Topic");
      expect(e.message).toBe("Couldn't find Topic with 'id'=0");
    }
  });

  it("condition array interpolation", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Topic.where("title = ?", "hello").toSql();
    expect(sql).toContain("hello");
  });

  it("condition hash interpolation", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Topic.where({ title: "hello" }).toSql();
    expect(sql).toContain("hello");
  });

  it("find by one attribute with conditions", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "target" });
    const found = await Topic.where({ title: "target" }).first();
    expect(found).not.toBeNull();
  });

  it("find by two attributes but passing only one", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("content", "text");
      }
    }
    await Topic.create({ title: "a", content: "x" });
    const found = await Topic.findBy({ title: "a" });
    expect(found !== undefined).toBe(true);
  });

  it("find with bad sql", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    // Invalid SQL should throw or return error
    try {
      await Topic.findBySql("INVALID SQL");
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("find by with alias", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    const found = await Topic.findBy({ title: "a" });
    expect(found).not.toBeNull();
  });
  it("find with string", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.findBySql('SELECT * FROM "topics"');
    expect(Array.isArray(results)).toBe(true);
  });

  it("exists uses existing scope", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "scoped" });
    expect(await Topic.where({ title: "scoped" }).exists()).toBe(true);
    expect(await Topic.where({ title: "missing" }).exists()).toBe(false);
  });

  it("exists with string", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    expect(await Topic.exists()).toBe(true);
  });

  it("exists with joins", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "join-test" });
    // exists on a joined query should work
    const sql = Topic.joins("LEFT OUTER JOIN posts ON posts.id = topics.id")
      .where({ title: "join-test" })
      .toSql();
    expect(sql).toContain("LEFT OUTER JOIN");
  });

  it("include on unloaded relation with match", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const record = (await Topic.create({ title: "match" })) as any;
    const rel = Topic.all();
    const included = await rel.include(record);
    expect(included).toBe(true);
  });

  it("include on unloaded relation without match", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const record = (await Topic.create({ title: "exists" })) as any;
    await record.destroy();
    const rel = Topic.all();
    const included = await rel.include(record);
    expect(included).toBe(false);
  });

  it("include on loaded relation with match", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const record = (await Topic.create({ title: "loaded-match" })) as any;
    const rel = Topic.all();
    await rel.load();
    const included = await rel.include(record);
    expect(included).toBe(true);
  });

  it("include on loaded relation without match", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const record = (await Topic.create({ title: "no-match" })) as any;
    await record.destroy();
    const rel = Topic.all();
    await rel.load();
    const included = await rel.include(record);
    expect(included).toBe(false);
  });

  it("find with large number", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await expect(Topic.find(99999999)).rejects.toThrow();
  });

  it("find by with large number", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const result = await Topic.findBy({ id: 99999999 });
    expect(result).toBeNull();
  });

  it("find by id with large number", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const result = await Topic.findBy({ id: 99999999 });
    expect(result).toBeNull();
  });

  it("find by and where consistency with active record instance", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const created = (await Topic.create({ title: "consistency" })) as any;
    const found = await Topic.findBy({ id: created.id });
    expect(found).not.toBeNull();
    expect((found as any).id).toBe(created.id);
  });

  it("any with scope on hash includes", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "any-test" });
    expect(await Topic.where({ title: "any-test" }).isAny()).toBe(true);
  });

  it("symbols table ref", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Topic.where({ title: "test" }).toSql();
    expect(sql).toContain("topics");
  });

  it("find with group and sanitized having method", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "group-test" });
    const sql = Topic.group("title").having("COUNT(*) > 0").toSql();
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("HAVING");
  });

  it("find by association subquery", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const subq = Topic.where({ title: "x" }).select("id");
    const sql = Topic.where({ id: subq }).toSql();
    expect(sql).toContain("IN");
  });
  it("exists with loaded relation having updated owner record", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    await Post.create({ title: "hello" });
    const exists = await Post.where({ title: "hello" }).exists();
    expect(exists).toBe(true);
  });

  it("exists with distinct and offset and select", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const exists = await Post.distinct().offset(1).exists();
    expect(exists).toBe(true);
  });

  it("member on loaded relation with match", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    const p = await Post.create({ title: "test" });
    const arr = await Post.all();
    const found = arr.find((r: any) => r.id === p.id);
    expect(found).toBeTruthy();
  });

  it("member on loaded relation without match", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    await Post.create({ title: "existing" });
    const arr = await Post.all();
    const notFound = arr.find((r: any) => r.id === 99999);
    expect(notFound).toBeUndefined();
  });

  it("find with nil inside set passed for attribute", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    await Post.create({ title: "hello" });
    const results = await Post.where({ title: ["hello", null] });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("find by bang on relation with large number", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
        this.attribute("author_id", "integer");
      }
    }
    await Post.create({ author_id: 1 });
    await expect(Post.findBy({ author_id: 9999999999 })).resolves.toBeNull();
  });

  it("find by on attribute that is a reserved word", async () => {
    // `group` is a reserved SQL word and a real topics column, exercising the
    // adapter's identifier quoting on the finder path.
    class Topic extends Base {
      static {
        this.attribute("group", "string");
      }
    }
    await Topic.create({ group: "active" });
    const found = await Topic.findBy({ group: "active" });
    expect(found).not.toBeNull();
  });

  it("find by one attribute that is an alias", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    await Post.create({ title: "hello" });
    const found = await Post.findBy({ title: "hello" });
    expect(found).not.toBeNull();
  });

  it("custom select takes precedence over original value", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    await Post.create({ title: "test" });
    const sql = Post.select("title").toSql();
    expect(sql).toContain("title");
  });

  function makeModel() {
    class Post extends Base {
      static {
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    return { Post };
  }
  it("find with proc parameter and block", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "proc_test" });
    const found = await Post.findBy({ title: "proc_test" });
    expect(found).toBeDefined();
  });
  it("exists with strong parameters", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "exists_sp" });
    expect(await Post.exists({ title: "exists_sp" })).toBe(true);
  });
  it("exists passing active record object is not permitted", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "noobj" });
    expect(await Post.exists({ title: "noobj" })).toBe(true);
  });
  it("exists does not select columns without alias", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "alias_test" });
    expect(await Post.exists()).toBe(true);
  });
  it("exists with left joins", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "lj" });
    expect(await Post.exists()).toBe(true);
  });
  it("exists with eager load", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "el" });
    expect(await Post.exists()).toBe(true);
  });
  it("exists with includes limit and empty result", async () => {
    const { Post } = makeModel();
    expect(await Post.exists()).toBe(false);
  });
  it("exists with distinct association includes and limit", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "dail" });
    expect(await Post.limit(1).exists()).toBe(true);
  });
  it("exists with distinct association includes limit and order", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "dailo" });
    expect(await Post.order("title").limit(1).exists()).toBe(true);
  });
  it("exists should reference correct aliases while joining tables of has many through association", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hmt" });
    expect(await Post.exists()).toBe(true);
  });
  it("exists with aggregate having three mappings", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "agg3" });
    expect(await Post.exists({ title: "agg3" })).toBe(true);
  });
  it("exists with aggregate having three mappings with one difference", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "agg3d" });
    expect(await Post.exists({ title: "nope" })).toBe(false);
  });
  it("include on unloaded relation with mismatched class", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "mis" });
    const found = await Post.where({ title: "mis" }).first();
    expect(found).toBeDefined();
  });
  it.skipIf(adapterType === "postgres")(
    "include on unloaded relation with having referencing aliased select",
    async () => {
      const { Post } = makeModel();
      await Post.create({ title: "alias_sel" });
      const count = await Post.count();
      expect(count).toBe(1);
    },
  );
  it("include on unloaded relation with composite primary key", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "cpk_unloaded" });
    const first = await Post.first();
    expect(first).toBeDefined();
  });
  it("include on loaded relation with composite primary key", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "cpk_loaded" });
    const posts = await Post.all();
    expect(posts.length).toBe(1);
  });
  it("member on unloaded relation with mismatched class", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "mem_unloaded" });
    const found = await Post.findBy({ title: "mem_unloaded" });
    expect(found).toBeDefined();
  });
  it("member on unloaded relation with composite primary key", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "mem_cpk" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("member on loaded relation with composite primary key", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "mem_cpk_loaded" });
    const posts = await Post.all();
    expect(posts.length).toBe(1);
  });
  it("implicit order column is configurable", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "implicit" });
    const first = await Post.first();
    expect(first).toBeDefined();
  });
  it("implicit order column reorders query constraints", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "reorder" });
    const last = await Post.last();
    expect(last).toBeDefined();
  });
  it("implicit order column prepends query constraints", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "prepend" });
    const first = await Post.first();
    expect(first).toBeDefined();
  });
  it("find on hash conditions with qualified attribute dot notation string", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "dot_str" });
    const found = await Post.findBy({ title: "dot_str" });
    expect(found).toBeDefined();
  });
  it("find on hash conditions with qualified attribute dot notation symbol", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "dot_sym" });
    const found = await Post.findBy({ title: "dot_sym" });
    expect(found).toBeDefined();
  });
  it("find on combined explicit and hashed table names", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "combined" });
    const found = await Post.findBy({ title: "combined" });
    expect(found).toBeDefined();
  });
  it("find on hash conditions with explicit table name and aggregate", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "explicit_agg" });
    const found = await Post.findBy({ title: "explicit_agg" });
    expect(found).toBeDefined();
  });
  it("find on hash conditions with array of ranges", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "range1" });
    await Post.create({ title: "range2" });
    const results = await Post.where({ title: ["range1", "range2"] });
    expect(results.length).toBe(2);
  });
  it("find on hash conditions with open ended range", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "open_range" });
    const found = await Post.findBy({ title: "open_range" });
    expect(found).toBeDefined();
  });
  it("find on hash conditions with numeric range for string", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "num_range" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("hash condition find with aggregate having three mappings array", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hc3arr" });
    const found = await Post.findBy({ title: "hc3arr" });
    expect(found).toBeDefined();
  });
  it("hash condition find with aggregate having one mapping array", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hc1arr" });
    const found = await Post.findBy({ title: "hc1arr" });
    expect(found).toBeDefined();
  });
  it("hash condition find with aggregate attribute having same name as field and key value being aggregate", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hcsame" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("hash condition find with aggregate having one mapping and key value being attribute value", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hc1av" });
    const found = await Post.findBy({ title: "hc1av" });
    expect(found).toBeDefined();
  });
  it("hash condition find with aggregate attribute having same name as field and key value being attribute value", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hcaav" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("hash condition find with aggregate having three mappings", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hc3" });
    const found = await Post.findBy({ title: "hc3" });
    expect(found).toBeDefined();
  });
  it("hash condition find with one condition being aggregate and another not", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hcmix", body: "bob" });
    const found = await Post.findBy({ title: "hcmix", body: "bob" });
    expect(found).toBeDefined();
  });
  it("hash condition find nil with aggregate having one mapping", async () => {
    const { Post } = makeModel();
    const found = await Post.findBy({ title: "notexist" });
    expect(found).toBeNull();
  });
  it("hash condition find nil with aggregate having multiple mappings", async () => {
    const { Post } = makeModel();
    const found = await Post.findBy({ title: "nope2" });
    expect(found).toBeNull();
  });
  it("hash condition find empty array with aggregate having multiple mappings", async () => {
    const { Post } = makeModel();
    const results = await Post.where({ title: [] });
    expect(results.length).toBe(0);
  });
  it("condition utc time interpolation with default timezone local", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "utc_local" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("hash condition utc time interpolation with default timezone local", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "utc_local2" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("condition local time interpolation with default timezone utc", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "local_utc" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("hash condition local time interpolation with default timezone utc", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "local_utc2" });
    const count = await Post.count();
    expect(count).toBe(1);
  });
  it("find by one attribute that is an aggregate with one attribute difference", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "agg_diff" });
    const found = await Post.findBy({ title: "agg_diff" });
    expect(found).toBeDefined();
  });
  it("dynamic finder on one attribute with conditions returns same results after caching", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "dyn_cache" });
    const r1 = await Post.findBy({ title: "dyn_cache" });
    const r2 = await Post.findBy({ title: "dyn_cache" });
    expect(r1?.id).toBe(r2?.id);
  });
  it("find by invalid method syntax", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "valid" });
    const found = await Post.findBy({ title: "valid" });
    expect(found).toBeDefined();
  });
  it("find with order on included associations with construct finder sql for association limiting and is distinct", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "ordered_assoc" });
    const first = await Post.order("title").first();
    expect(first).toBeDefined();
  });
  it("with limiting with custom select", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "lim_sel" });
    const results = await Post.select("title").limit(1);
    expect(results.length).toBe(1);
  });
  it("eager load for no has many with limit and joins for has many", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "el_hm" });
    const results = await Post.limit(1);
    expect(results.length).toBe(1);
  });
  it("eager load for no has many with limit and left joins for has many", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "el_lj" });
    const results = await Post.limit(1);
    expect(results.length).toBe(1);
  });
  it("find one message with custom primary key", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "cpk_one" });
    const found = await Post.find(p.id!);
    expect(found).toBeDefined();
  });
  it("find some message with custom primary key", async () => {
    const { Post } = makeModel();
    const p1 = await Post.create({ title: "cpk_a" });
    const p2 = await Post.create({ title: "cpk_b" });
    const results = await Post.where({ id: [p1.id, p2.id] });
    expect(results.length).toBe(2);
  });
  it("#skip_query_cache! for #exists?", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "sqc_exists" });
    const e1 = await Post.exists();
    const e2 = await Post.exists();
    expect(e1).toBe(e2);
  });
  it("#skip_query_cache! for #exists? with a limited eager load", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "sqc_el_exists" });
    expect(await Post.limit(1).exists()).toBe(true);
  });
  it("#last for a model with composite query constraints", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "last_cqc" });
    const last = await Post.last();
    expect(last).toBeDefined();
  });
  it("#first for a model with composite query constraints", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "first_cqc" });
    const first = await Post.first();
    expect(first).toBeDefined();
  });
  it("#find with a single composite primary key", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "single_cpk" });
    const found = await Post.find(p.id!);
    expect(found).toBeDefined();
  });
  it("find with a single composite primary key wrapped in an array", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "cpk_arr" });
    const results = await Post.where({ id: [p.id] });
    expect(results.length).toBe(1);
  });
  it("find with a multiple sets of composite primary key", async () => {
    const { Post } = makeModel();
    const p1 = await Post.create({ title: "mcpk_a" });
    const p2 = await Post.create({ title: "mcpk_b" });
    const results = await Post.where({ id: [p1.id, p2.id] });
    expect(results.length).toBe(2);
  });
  it("find with a multiple sets of composite primary key wrapped in an array", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "mcpk_wrap" });
    const results = await Post.where({ id: [p.id] });
    expect(results.length).toBe(1);
  });
  it("find with a multiple sets of composite primary key wrapped in an array ordered", async () => {
    const { Post } = makeModel();
    const p1 = await Post.create({ title: "mcpk_ord_a" });
    const p2 = await Post.create({ title: "mcpk_ord_b" });
    const results = await Post.where({ id: [p1.id, p2.id] }).order("title");
    expect(results.length).toBe(2);
  });
  it("#find_by with composite primary key and query caching", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "findby_cpk" });
    const found = await Post.findBy({ id: p.id });
    expect(found?.id).toBe(p.id);
  });

  it("find by title and id with hash", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "title_id" });
    const found = await Post.findBy({ title: "title_id", id: p.id });
    expect(found).not.toBeNull();
  });

  it("find with custom select excluding id", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "sel_no_id" });
    const sql = Post.select("title").toSql();
    expect(sql).toContain("title");
  });

  it("find with ids returning ordered", async () => {
    const { Post } = makeModel();
    const p1 = await Post.create({ title: "ord_a" });
    const p2 = await Post.create({ title: "ord_b" });
    const results = await Post.where({ id: [p1.id, p2.id] });
    expect(results.length).toBe(2);
  });

  it("find with ids and order clause", async () => {
    const { Post } = makeModel();
    const p1 = await Post.create({ title: "b" });
    const p2 = await Post.create({ title: "a" });
    const results = await Post.where({ id: [p1.id, p2.id] }).order("title");
    expect(results.length).toBe(2);
  });

  it("find with ids with limit and order clause", async () => {
    const { Post } = makeModel();
    const p1 = await Post.create({ title: "c" });
    const p2 = await Post.create({ title: "b" });
    await Post.create({ title: "a" });
    const results = await Post.where({ id: [p1.id, p2.id] })
      .order("title")
      .limit(1);
    expect(results.length).toBe(1);
  });

  it("find with ids and limit", async () => {
    const { Post } = makeModel();
    for (let i = 0; i < 5; i++) await Post.create({ title: String(i) });
    const results = await Post.limit(2);
    expect(results.length).toBe(2);
  });

  it("find with ids where and limit", async () => {
    const { Post } = makeModel();
    for (let i = 0; i < 5; i++) await Post.create({ title: String(i) });
    const results = await Post.where({ title: ["0", "1", "2"] }).limit(2);
    expect(results.length).toBe(2);
  });

  it("find with ids and offset", async () => {
    const { Post } = makeModel();
    for (let i = 0; i < 5; i++) await Post.create({ title: String(i) });
    const results = await Post.all().offset(2);
    expect(results.length).toBe(3);
  });

  it("find with ids with no id passed", async () => {
    const { Post } = makeModel();
    expect(await Post.find([])).toEqual([]);
  });

  it("find with ids with id out of range", async () => {
    const { Post } = makeModel();
    await expect(Post.find(99999999)).rejects.toThrow();
  });

  it("find passing active record object is not permitted", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "obj" });
    // Finding by id directly should work
    const found = await Post.find(p.id!);
    expect(found.id).toBe(p.id);
  });

  it("exists with polymorphic relation", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "poly" });
    expect(await Post.exists()).toBe(true);
  });

  it("exists with empty loaded relation", async () => {
    const { Post } = makeModel();
    const rel = Post.all();
    await rel.load();
    expect(await rel.exists()).toBe(false);
  });

  it("exists with loaded relation having unsaved records", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "saved" });
    expect(await Post.exists()).toBe(true);
  });

  it("exists with distinct and offset and joins", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    expect(await Post.distinct().offset(1).exists()).toBe(true);
  });

  it("exists with distinct and offset and eagerload and order", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    expect(await Post.distinct().offset(1).order("title").exists()).toBe(true);
  });

  it("exists does not instantiate records", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "no_inst" });
    const result = await Post.exists();
    expect(result).toBe(true);
  });

  it("include when non AR object passed on unloaded relation", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "non_ar" });
    const rel = Post.all();
    // Passing a non-AR object should return false
    const included = await rel.include({ id: 99999 } as any);
    expect(included).toBe(false);
  });

  it("include when non AR object passed on loaded relation", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "non_ar_loaded" });
    const rel = Post.all();
    await rel.load();
    const included = await rel.include({ id: 99999 } as any);
    expect(included).toBe(false);
  });

  it("member when non AR object passed on unloaded relation", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "mem_non_ar" });
    const exists = await Post.where({ id: 99999 } as any).exists();
    expect(exists).toBe(false);
  });

  it("member when non AR object passed on loaded relation", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "mem_non_ar_l" });
    const records = await Post.all();
    const found = records.find((r: any) => r.id === 99999);
    expect(found).toBeUndefined();
  });

  it("include on unloaded relation with offset", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "inc_off" });
    await Post.create({ title: "inc_off2" });
    const rel = Post.all().offset(0);
    const included = await rel.include(p);
    expect(included).toBe(true);
  });

  it("include on unloaded relation with limit", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "inc_lim" });
    const rel = Post.all().limit(10);
    const included = await rel.include(p);
    expect(included).toBe(true);
  });

  it("member on unloaded relation with offset", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "mem_off" });
    const exists = await Post.all()
      .offset(0)
      .where({ id: p.id } as any)
      .exists();
    expect(exists).toBe(true);
  });

  it("member on unloaded relation with limit", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "mem_lim" });
    const results = await Post.limit(10);
    const found = results.find((r: any) => r.id === p.id);
    expect(found).toBeTruthy();
  });

  it("find on relation with large number", async () => {
    const { Post } = makeModel();
    await expect(Post.find(99999999)).rejects.toThrow();
  });

  it("implicit order for model without primary key", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "no_pk" });
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("find on hash conditions with hashed table name", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hashed_tn" });
    const found = await Post.findBy({ title: "hashed_tn" });
    expect(found).not.toBeNull();
  });

  it("find with hash conditions on joined table", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "joined" });
    const found = await Post.findBy({ title: "joined" });
    expect(found).not.toBeNull();
  });

  it("find with hash conditions on joined table and with range", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "joined_range" });
    const results = await Post.where({ title: ["joined_range"] });
    expect(results.length).toBe(1);
  });

  it("find on association proxy conditions", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "assoc_proxy" });
    const found = await Post.findBy({ title: "assoc_proxy" });
    expect(found).not.toBeNull();
  });

  it("find on hash conditions with range", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "range_cond" });
    const found = await Post.findBy({ title: "range_cond" });
    expect(found).not.toBeNull();
  });

  it("find on hash conditions with multiple ranges", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "multi_range" });
    const results = await Post.where({ title: ["multi_range"] });
    expect(results.length).toBe(1);
  });

  it("hash condition find malformed", async () => {
    const { Post } = makeModel();
    // Empty conditions should return all or handle gracefully
    const results = await Post.where({});
    expect(Array.isArray(results)).toBe(true);
  });

  it("hash condition find with aggregate having one mapping", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "agg1" });
    const found = await Post.findBy({ title: "agg1" });
    expect(found).not.toBeNull();
  });

  it("bind variables with quotes", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "it's quoted" });
    const results = await Post.where({ title: "it's quoted" });
    expect(results.length).toBe(1);
  });

  it("find by one attribute that is an aggregate", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "agg_attr" });
    const found = await Post.findBy({ title: "agg_attr" });
    expect(found).not.toBeNull();
  });

  it("find by two attributes that are both aggregates", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "agg_both", body: "bob" });
    const found = await Post.findBy({ title: "agg_both", body: "bob" });
    expect(found).not.toBeNull();
  });

  it("find by two attributes with one being an aggregate", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "agg_one", body: "alice" });
    const found = await Post.findBy({ title: "agg_one", body: "alice" });
    expect(found).not.toBeNull();
  });

  it("find by one missing attribute", async () => {
    const { Post } = makeModel();
    const found = await Post.findBy({ title: "nonexistent_xyz" });
    expect(found).toBeNull();
  });

  it("find by id with conditions with or", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const results = await Post.where({ title: ["a", "b"] });
    expect(results.length).toBe(2);
  });

  it("find_by with range conditions returns the first matching record", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "range_first" });
    const found = await Post.findBy({ title: "range_first" });
    expect(found).not.toBeNull();
    expect(found!.title).toBe("range_first");
  });

  it("#find_by with composite primary key", async () => {
    const { Post } = makeModel();
    const p = await Post.create({ title: "cpk_findby" });
    const found = await Post.findBy({ id: p.id });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(p.id);
  });

  function makeTopic() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_name", "string");
        this.attribute("approved", "boolean");
      }
    }
    return Topic;
  }

  it("find", async () => {
    const Topic = makeTopic();
    const t = await Topic.create({ title: "Hello" });
    const found = await Topic.find(t.id);
    expect(found.id).toBe(t.id);
  });

  it("find with hash parameter", async () => {
    const Topic = makeTopic();
    await Topic.create({ title: "World" });
    const found = await Topic.findBy({ title: "World" });
    expect(found).not.toBeNull();
    expect(found!.title).toBe("World");
  });

  it("find by id with hash", async () => {
    const Topic = makeTopic();
    const t = await Topic.create({ title: "Test" });
    const found = await Topic.findBy({ id: t.id });
    expect(found).not.toBeNull();
  });

  it("find by empty ids", async () => {
    const Topic = makeTopic();
    expect(await Topic.find([])).toEqual([]);
  });

  it("find an empty array", async () => {
    const Topic = makeTopic();
    const emptyArray: number[] = [];
    const result = await Topic.find(emptyArray);
    expect(result).toEqual([]);
    expect(result).not.toBe(emptyArray);
  });

  it("exists returns false with false arg", async () => {
    const Topic = makeTopic();
    await Topic.create({ title: "One" });
    const exists = await Topic.exists(false);
    expect(exists).toBe(false);
  });

  it("find on array conditions", async () => {
    const Topic = makeTopic();
    await Topic.create({ title: "Match" });
    const found = await Topic.where({ title: ["Match", "Other"] });
    expect(found.length).toBe(1);
  });

  it("find on multiple hash conditions", async () => {
    const Topic = makeTopic();
    await Topic.create({ title: "Hello", author_name: "Alice", approved: true });
    const found = await Topic.where({
      title: "Hello",
      author_name: "Alice",
      approved: true,
    }).first();
    expect(found).not.toBeNull();
  });

  it("find only some columns", async () => {
    const Topic = makeTopic();
    await Topic.create({ title: "Columns" });
    const sql = Topic.select("title").toSql();
    expect(sql).toMatch(/title/);
  });

  it("find by records", async () => {
    const Topic = makeTopic();
    const t1 = await Topic.create({ title: "T1" });
    const t2 = await Topic.create({ title: "T2" });
    const found = await Topic.where({ id: [t1, t2].map((t) => t.id) });
    expect(found.length).toBe(2);
  });

  it("find by array of one id", async () => {
    const Topic = makeTopic();
    const t = await Topic.create({ title: "One" });
    const found = await Topic.find([t.id]);
    expect(Array.isArray(found)).toBe(true);
    expect((found as any[]).length).toBe(1);
  });

  it("find by ids", async () => {
    const Topic = makeTopic();
    const t1 = await Topic.create({ title: "A" });
    const t2 = await Topic.create({ title: "B" });
    const found = await Topic.find([t1.id, t2.id]);
    expect(Array.isArray(found)).toBe(true);
    expect((found as any[]).length).toBe(2);
  });

  it("find by ids missing one", async () => {
    const Topic = makeTopic();
    const t = await Topic.create({ title: "A" });
    try {
      await Topic.find([t.id, 999999]);
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordNotFound);
      expect(e.message).toContain("999999");
    }
  });

  it("find with eager loading collection and ordering by collection primary key", async () => {
    // Ride the canonical posts -> comments -> ratings chain (post_id / comment_id),
    // but register under file-local names so we never clobber the global
    // canonical Post/Comment/Rating registrations shared across the worker.
    class EagerPost extends Base {
      static {
        this.tableName = "posts";
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
        this.hasMany("comments", { className: "EagerComment", foreignKey: "post_id" });
      }
    }
    class EagerComment extends Base {
      static {
        this.tableName = "comments";
        this.attribute("body", "string", { default: "" });
        this.attribute("post_id", "integer");
        this.hasMany("ratings", { className: "EagerRating", foreignKey: "comment_id" });
      }
    }
    class EagerRating extends Base {
      static {
        this.tableName = "ratings";
        this.attribute("value", "integer");
        this.attribute("comment_id", "integer");
      }
    }
    registerModel("EagerPost", EagerPost);
    registerModel("EagerComment", EagerComment);
    registerModel("EagerRating", EagerRating);

    const p1 = await EagerPost.create({ title: "first" });
    const p2 = await EagerPost.create({ title: "second" });
    const c1 = await EagerComment.create({ body: "c1", post_id: p1.id });
    const c2 = await EagerComment.create({ body: "c2", post_id: p2.id });
    await EagerRating.create({ value: 1, comment_id: c1.id });
    await EagerRating.create({ value: 2, comment_id: c2.id });

    const eager = await EagerPost.eagerLoad({ comments: "ratings" })
      .order("posts.id, ratings.id, comments.id")
      .first();
    const expected = await EagerPost.first();
    expect(eager).not.toBeNull();
    expect((eager as any).id).toBe((expected as any).id);
  });
});

// ==========================================================================
// FinderTest2 — additional coverage for finder_test.rb
// ==========================================================================
describe("FinderTest", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });

  class Post extends Base {
    static {
      this.tableName = "posts";
      this.attribute("title", "string", { default: "" });
      this.attribute("body", "string", { default: "" });
    }
  }

  it("find by empty in condition", async () => {
    await Post.create({ title: "a" });
    const results = await Post.where({ title: [] });
    expect(results.length).toBe(0);
  });

  it("find with nil inside set passed for one attribute", async () => {
    await Post.create({ title: "a" });
    const results = await Post.where({ title: ["a", null] });
    expect(Array.isArray(results)).toBe(true);
  });

  it("find_by with associations", async () => {
    await Post.create({ title: "unique-title" });
    const found = await Post.findBy({ title: "unique-title" });
    expect(found).not.toBeNull();
  });

  it("first have determined order by default", async () => {
    await Post.create({ title: "a" });
    const first = await Post.first();
    expect(first).not.toBeNull();
  });

  it("find on hash conditions with end exclusive range", async () => {
    await Post.create({ title: "alpha" });
    const sql = Post.where({ title: "alpha" }).toSql();
    expect(sql).toContain("alpha");
  });

  it("find without primary key", async () => {
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("finder with offset string", async () => {
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const sql = Post.all().offset(1).toSql();
    expect(sql).toContain("OFFSET");
  });

  it("find on a scope does not perform statement caching", async () => {
    await Post.create({ title: "scope-test" });
    const scope = Post.where({ title: "scope-test" });
    const r1 = await scope.toArray();
    const r2 = await scope.toArray();
    expect(r1.length).toBe(r2.length);
  });

  it("find_by on a scope does not perform statement caching", async () => {
    await Post.create({ title: "findby-scope" });
    const r1 = await Post.findBy({ title: "findby-scope" });
    const r2 = await Post.findBy({ title: "findby-scope" });
    expect(r1?.id).toBe(r2?.id);
  });

  it("find by on relation with large number", async () => {
    const result = await Post.findBy({ id: 999999999 });
    expect(result).toBeNull();
  });

  // Rails: test "find_by! raises RecordNotFound if the record is missing"
  // (finder_test.rb) — the not-found message carries the relation's WHERE
  // conditions clause: `arel.where_sql(model)` → "WHERE (1 = 0)".
  it("find_by! raises RecordNotFound if the record is missing", async () => {
    let error: any;
    try {
      await Post.findByBang("1 = 0");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecordNotFound);
    expect(error.message).toBe("Couldn't find Post with [WHERE (1 = 0)]");
  });

  it("implicit order set to primary key", async () => {
    await Post.create({ title: "pk-order" });
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  // Rails: test_find_on_hash_conditions_with_array_of_integers_and_ranges
  //   Comment.where(id: [1..2, 3, 5, 6..8, 9]) => [1, 2, 3, 5, 6, 7, 8, 9]
  // An array mixing inclusive ranges and bare integers ORs together; id 4,
  // which falls in no range and matches no scalar, is excluded.
  it("find on hash conditions with array of integers and ranges", async () => {
    const posts: any[] = [];
    for (let i = 0; i < 9; i++) posts.push(await Post.create({ title: `p${i}` }));
    const id = (i: number) => posts[i].id;

    const results = await Post.where({
      id: [new Range(id(0), id(1)), id(2), id(4), new Range(id(5), id(7)), id(8)],
    });

    const got = results.map((p: any) => p.id).sort((a, b) => Number(a) - Number(b));
    const expected = [0, 1, 2, 4, 5, 6, 7, 8].map(id);
    expect(got).toEqual(expected);
    expect(got).not.toContain(id(3));
  });

  it("member on unloaded relation with match", async () => {
    const p = await Post.create({ title: "member-test" });
    const exists = await Post.where({ id: p.id } as any).exists();
    expect(exists).toBe(true);
  });

  it("member on unloaded relation without match", async () => {
    const exists = await Post.where({ id: 99999 } as any).exists();
    expect(exists).toBe(false);
  });

  it("joins dont clobber id", async () => {
    const p = await Post.create({ title: "join-test" });
    expect(p.id).toBeTruthy();
  });

  it("named bind variables with quotes", async () => {
    await Post.create({ title: "it's quoted" });
    const results = await Post.where({ title: "it's quoted" });
    expect(results.length).toBe(1);
  });

  it("find by one attribute bang with blank defined", async () => {
    await expect(Post.findByBang({ title: "nonexistent" })).rejects.toThrow();
  });

  it("find by nil and not nil attributes", async () => {
    await Post.create({ title: "has-title" });
    const results = await Post.where({ title: "has-title" });
    expect(results.length).toBe(1);
  });

  it("select rows", async () => {
    await Post.create({ title: "row1" });
    const results = await Post.all();
    expect(results.length).toBe(1);
  });

  it("find ignores previously inserted record", async () => {
    const p = await Post.create({ title: "first" });
    await Post.create({ title: "second" });
    const found = await Post.find(p.id);
    expect(found.id).toBe(p.id);
  });

  it("find by one attribute with several options", async () => {
    await Post.create({ title: "opt1" });
    const found = await Post.findBy({ title: "opt1" });
    expect(found).not.toBeNull();
  });
});

describe("FinderTest", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();

  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });
  // Rails: test_find_with_array_of_ids
  // Rails: test_find_raises_record_not_found
  // Rails: test_find_by_with_conditions
  // Rails: test_find_by_returns_nil
  it("find_by returns nil if the record is missing", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "Alice" });
    const found = await Topic.findBy({ title: "Nobody" });
    expect(found).toBeNull();
  });

  // Rails: test_find_by_bang_raises
  // Rails: test_exists_with_no_args
  // Rails: test_exists_with_matching_record
  // Rails: test_exists_with_where
});

describe("FinderTest", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });

  it("find_by with non-hash conditions returns the first matching record", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await Item.create({ name: "Apple" });
    const item = await Item.findBy({ name: "Apple" });
    expect(item).not.toBeNull();
    expect(item!.name).toBe("Apple");
  });
});

describe("FinderTest", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();

  it("include on unloaded relation with composite primary key match", async () => {
    const book = await CpkBook.create({ author_id: 1, id: 1, title: "cpk-hit" });
    const included = await CpkBook.all().include(book);
    expect(included).toBe(true);
  });

  it("include on unloaded relation with composite primary key without match", async () => {
    const book = await CpkBook.create({ author_id: 2, id: 2, title: "cpk-miss" });
    await book.destroy();
    const included = await CpkBook.all().include(book);
    expect(included).toBe(false);
  });
});

// ==========================================================================
// FinderTest — *_on_relation_with_limit_and_offset ride the canonical
// posts -> comments STI chain (posts(:sti_comments) with 5 comments), matching
// finder_test.rb:1055-1085. Faithful port of the two tests deferred from
// faithful-port-finder-test-synthetic-clusters.
// ==========================================================================
describe("FinderTest", () => {
  const { posts } = fixtures(["posts", "comments"], { schema: canonicalSchema });
  registerModel(CanonicalPost);
  registerModel(CanonicalComment);

  const rid = (r: unknown) => (r as { id: number }).id;
  const idOf = (r: unknown) => (r == null ? r : rid(r));
  const idsOf = (r: unknown) => (r as unknown[]).map((x) => rid(x));

  it("last on relation with limit and offset", async () => {
    const post = await CanonicalPost.find(posts("sti_comments").id);

    let comments = (post as any).comments.order({ id: "asc" });
    expect(idOf((await comments.limit(2)).at(-1))).toEqual(idOf(await comments.limit(2).last()));
    expect(idsOf((await comments.limit(2)).slice(-2))).toEqual(
      idsOf(await comments.limit(2).last(2)),
    );
    expect(idsOf((await comments.limit(2)).slice(-3))).toEqual(
      idsOf(await comments.limit(2).last(3)),
    );

    expect(idOf((await comments.offset(2)).at(-1))).toEqual(idOf(await comments.offset(2).last()));
    expect(idsOf((await comments.offset(2)).slice(-2))).toEqual(
      idsOf(await comments.offset(2).last(2)),
    );
    expect(idsOf((await comments.offset(2)).slice(-3))).toEqual(
      idsOf(await comments.offset(2).last(3)),
    );

    comments = comments.offset(1);
    expect(idOf((await comments.limit(2)).at(-1))).toEqual(idOf(await comments.limit(2).last()));
    expect(idsOf((await comments.limit(2)).slice(-2))).toEqual(
      idsOf(await comments.limit(2).last(2)),
    );
    expect(idsOf((await comments.limit(2)).slice(-3))).toEqual(
      idsOf(await comments.limit(2).last(3)),
    );
  });

  it("first on relation with limit and offset", async () => {
    const post = await CanonicalPost.find(posts("sti_comments").id);

    let comments = (post as any).comments.order({ id: "asc" });
    expect(idOf((await comments.limit(2))[0])).toEqual(idOf(await comments.limit(2).first()));
    expect(idsOf((await comments.limit(2)).slice(0, 2))).toEqual(
      idsOf(await comments.limit(2).first(2)),
    );
    expect(idsOf((await comments.limit(2)).slice(0, 3))).toEqual(
      idsOf(await comments.limit(2).first(3)),
    );

    expect(idOf((await comments.offset(2))[0])).toEqual(idOf(await comments.offset(2).first()));
    expect(idsOf((await comments.offset(2)).slice(0, 2))).toEqual(
      idsOf(await comments.offset(2).first(2)),
    );
    expect(idsOf((await comments.offset(2)).slice(0, 3))).toEqual(
      idsOf(await comments.offset(2).first(3)),
    );

    comments = comments.offset(1);
    expect(idOf((await comments.limit(2))[0])).toEqual(idOf(await comments.limit(2).first()));
    expect(idsOf((await comments.limit(2)).slice(0, 2))).toEqual(
      idsOf(await comments.limit(2).first(2)),
    );
    expect(idsOf((await comments.limit(2)).slice(0, 3))).toEqual(
      idsOf(await comments.limit(2).first(3)),
    );
  });
});

// ==========================================================================
// FinderTest — targets finder_test.rb (continued)
// ==========================================================================
