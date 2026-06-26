/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/batches_test.rb
 */
import { describe, it, expect } from "vitest";
import { Relation } from "./index.js";
import { errorOnIgnoredOrder, setErrorOnIgnoredOrder } from "./ar-config.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { assertQueriesCount, assertQueriesMatch } from "./testing/query-assertions.js";
import { quoteTableName, escapeRegExp } from "./test-helpers/quote-regex.js";
import {
  Post,
  PostWithDefaultScope,
  SpecialPostWithDefaultScope,
  PostWithDestroyCallback,
} from "./test-helpers/models/post.js";
import { Subscriber } from "./test-helpers/models/subscriber.js";
import { Developer } from "./test-helpers/models/developer.js";
import { CpkOrder, CpkBook } from "./test-helpers/models/cpk.js";
import { Tagging } from "./test-helpers/models/tagging.js";
import { Tag } from "./test-helpers/models/tag.js";
import { registerModel } from "./associations.js";

// ==========================================================================
// EachTest — targets batches_test.rb
// ==========================================================================
// Tagging and Tag must be in the model registry so Post's hasManyTaggings
// dependent:destroy cascade can resolve them.
registerModel([Tagging, Tag]);

describe("EachTest", () => {
  const { posts } = useHandlerFixtures(
    [
      "posts",
      "taggings",
      "developers",
      "subscribers",
      "cpkOrders",
      "cpkBooks",
      "cpkAuthors",
    ] as const,
    { schema: canonicalSchema },
  );

  it("each should execute one query per batch", async () => {
    const total = Number(await Post.count());
    await assertQueriesCount(total + 1, false, async () => {
      for await (const post of Post.findEach({ batchSize: 1 })) {
        expect(post).toBeInstanceOf(Post);
      }
    });
  });

  it("each should not return query chain and execute only one query", async () => {
    await assertQueriesCount(1, false, async () => {
      for await (const _post of Post.findEach({ batchSize: 100000 })) {
      }
    });
  });

  it("each should return an enumerator if no block is present", async () => {
    await assertQueriesCount(1, false, async () => {
      let index = 0;
      for await (const post of Post.findEach({ batchSize: 100000 })) {
        expect(post).toBeInstanceOf(Post);
        expect(typeof index).toBe("number");
        index++;
      }
    });
  });

  it("each should return a sized enumerator", async () => {
    const total = Number(await Post.count());
    let count = 0;
    for await (const _post of Post.findEach({ batchSize: 1 })) {
      count++;
    }
    expect(count).toBe(total);

    const posts7 = await Post.order("id asc").where("id >= ?", 7).toArray();
    let count7 = 0;
    for await (const _post of Post.findEach({ batchSize: 2, start: 7 })) {
      count7++;
    }
    expect(count7).toBe(posts7.length);

    let countAll = 0;
    for await (const _post of Post.findEach({ batchSize: 10000 })) {
      countAll++;
    }
    expect(countAll).toBe(total);
  });

  it("each enumerator should execute one query per batch", async () => {
    const total = Number(await Post.count());
    await assertQueriesCount(total + 1, false, async () => {
      let index = 0;
      for await (const post of Post.findEach({ batchSize: 1 })) {
        expect(post).toBeInstanceOf(Post);
        expect(typeof index).toBe("number");
        index++;
      }
    });
  });

  it("each should raise if select is set without id", async () => {
    await expect(async () => {
      for await (const _post of Post.select("title").findEach({ batchSize: 1 })) {
        throw new Error("should not call this block");
      }
    }).rejects.toThrow();
  });

  it("each should execute if id is in select", async () => {
    await assertQueriesCount(6, false, async () => {
      for await (const post of Post.select("id, title, type").findEach({ batchSize: 2 })) {
        expect(post).toBeInstanceOf(Post);
      }
    });
  });

  it("find_each should honor limit if passed a block", async () => {
    const total = Number(await Post.count());
    const limit = total - 1;
    let count = 0;
    for await (const _post of Post.limit(limit).findEach({})) {
      count++;
    }
    expect(count).toBe(limit);
  });

  it("find_each should honor limit if no block is passed", async () => {
    const total = Number(await Post.count());
    const limit = total - 1;
    let count = 0;
    for await (const _post of Post.limit(limit).findEach({})) {
      count++;
    }
    expect(count).toBe(limit);
  });

  it("warn if order scope is set", async () => {
    for await (const _post of Post.order("title").findEach({})) {
    }
  });

  it("logger not required", async () => {
    for await (const _post of Post.order("legacy_comments_count DESC").findEach({})) {
    }
  });

  it("find in batches should return batches", async () => {
    const total = Number(await Post.count());
    await assertQueriesCount(total + 1, false, async () => {
      for await (const batch of Post.findInBatches({ batchSize: 1 })) {
        expect(Array.isArray(batch)).toBe(true);
        expect(batch[0]).toBeInstanceOf(Post);
      }
    });
  });

  it("find in batches should start from the start option", async () => {
    const total = Number(await Post.count());
    await assertQueriesCount(total, false, async () => {
      for await (const batch of Post.findInBatches({ batchSize: 1, start: 2 })) {
        expect(Array.isArray(batch)).toBe(true);
        expect(batch[0]).toBeInstanceOf(Post);
      }
    });
  });

  it("find in batches should end at the finish option", async () => {
    await assertQueriesCount(6, false, async () => {
      for await (const batch of Post.findInBatches({ batchSize: 1, finish: 5 })) {
        expect(Array.isArray(batch)).toBe(true);
        expect(batch[0]).toBeInstanceOf(Post);
      }
    });
  });

  it("find in batches shouldnt execute query unless needed", async () => {
    const total = Number(await Post.count());
    await assertQueriesCount(2, false, async () => {
      for await (const batch of Post.findInBatches({ batchSize: total })) {
        expect(Array.isArray(batch)).toBe(true);
      }
    });

    await assertQueriesCount(1, false, async () => {
      for await (const batch of Post.findInBatches({ batchSize: total + 1 })) {
        expect(Array.isArray(batch)).toBe(true);
      }
    });
  });

  it("find in batches should quote batch order", async () => {
    await assertQueriesMatch(
      new RegExp(`ORDER BY ${escapeRegExp(quoteTableName("posts.id"))}`, "i"),
      undefined,
      false,
      async () => {
        for await (const batch of Post.findInBatches({ batchSize: 1 })) {
          expect(Array.isArray(batch)).toBe(true);
          expect(batch[0]).toBeInstanceOf(Post);
        }
      },
    );
  });

  it("find in batches should quote batch order with desc order", async () => {
    await assertQueriesMatch(
      new RegExp(`ORDER BY ${escapeRegExp(quoteTableName("posts.id"))} DESC`),
      undefined,
      false,
      async () => {
        for await (const batch of Post.findInBatches({ batchSize: 1, order: "desc" })) {
          expect(Array.isArray(batch)).toBe(true);
          expect(batch[0]).toBeInstanceOf(Post);
        }
      },
    );
  });

  it("each should raise if order is invalid", async () => {
    await expect(async () => {
      for await (const _post of Post.select("title").findEach({
        batchSize: 1,
        order: "invalid" as any,
      })) {
        throw new Error("should not call this block");
      }
    }).rejects.toThrow();
  });

  it("in batches without block should raise if order is invalid", async () => {
    await expect(async () => {
      for await (const _rel of Post.select("title").inBatches({ order: "invalid" as any })) {
      }
    }).rejects.toThrow();
  });

  it("find in batches should not use records after yielding them in case original array is modified", async () => {
    for await (const batch of Post.findInBatches({ batchSize: 1 })) {
      expect(Array.isArray(batch)).toBe(true);
      expect(batch[0]).toBeInstanceOf(Post);
      batch.splice(0, batch.length); // mutate batch; next iteration should not be affected
    }
  });

  it("find in batches should ignore the order default scope", async () => {
    const firstPost = await PostWithDefaultScope.first();
    const batchPosts: any[] = [];
    for await (const batch of PostWithDefaultScope.findInBatches({})) {
      batchPosts.push(...batch);
    }
    expect(firstPost).not.toBeNull();
    expect(batchPosts[0]).not.toEqual(firstPost);
    expect(batchPosts[0].id).toBe(posts("welcome").id);
  });

  it("find in batches should error on ignore the order", async () => {
    await expect(async () => {
      for await (const _b of PostWithDefaultScope.findInBatches({ errorOnIgnore: true })) {
      }
    }).rejects.toThrow();
  });

  it("find in batches should not error if config overridden", async () => {
    const prev = errorOnIgnoredOrder;
    setErrorOnIgnoredOrder(true);
    let threw = false;
    try {
      for await (const _b of PostWithDefaultScope.findInBatches({ errorOnIgnore: false })) {
      }
    } catch {
      threw = true;
    } finally {
      setErrorOnIgnoredOrder(prev);
    }
    expect(threw).toBe(false);
  });

  it("find in batches should error on config specified to error", async () => {
    const prev = errorOnIgnoredOrder;
    setErrorOnIgnoredOrder(true);
    try {
      await expect(async () => {
        for await (const _b of PostWithDefaultScope.findInBatches({})) {
        }
      }).rejects.toThrow();
    } finally {
      setErrorOnIgnoredOrder(prev);
    }
  });

  it("find in batches should not error by default", async () => {
    let threw = false;
    try {
      for await (const _b of PostWithDefaultScope.findInBatches({})) {
      }
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("find in batches should not ignore the default scope if it is other then order", async () => {
    const defaultScope = await SpecialPostWithDefaultScope.all().toArray();
    const batchPosts: any[] = [];
    for await (const batch of SpecialPostWithDefaultScope.findInBatches({})) {
      batchPosts.push(...batch);
    }
    const defaultIds = defaultScope
      .map((p: any) => Number(p.id))
      .sort((a: number, b: number) => a - b);
    const batchIds = batchPosts.map((p: any) => Number(p.id)).sort((a: number, b: number) => a - b);
    expect(batchIds).toEqual(defaultIds);
  });

  it("find in batches should use any column as primary key", async () => {
    const nickOrderSubscribers = await Subscriber.order("nick asc").toArray();
    const startNick = nickOrderSubscribers[1].readAttribute("nick") as string;
    const collected: any[] = [];
    for await (const batch of Subscriber.findInBatches({ batchSize: 1, start: startNick })) {
      collected.push(...batch);
    }
    const expected = nickOrderSubscribers.slice(1).map((s: any) => s.id);
    expect(collected.map((s: any) => s.id)).toEqual(expected);
  });

  it("find in batches should use any column as primary key when start is not specified", async () => {
    const count = Number(await Subscriber.count());
    await assertQueriesCount(count + 1, false, async () => {
      for await (const batch of Subscriber.findInBatches({ batchSize: 1 })) {
        expect(Array.isArray(batch)).toBe(true);
        expect(batch[0]).toBeInstanceOf(Subscriber);
      }
    });
  });

  it("find in batches should return an enumerator", async () => {
    const gen = Post.findInBatches({ batchSize: 1 });
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
    let count = 0;
    for await (const batch of gen) {
      count++;
      if (count >= 4) break;
    }
    expect(count).toBe(4);
  });

  it("find_in_batches should honor limit if passed a block", async () => {
    const total = Number(await Post.count());
    const limit = total - 1;
    let count = 0;
    for await (const batch of Post.limit(limit).findInBatches({})) {
      count += batch.length;
    }
    expect(count).toBe(limit);
  });

  it("find_in_batches should honor limit if no block is passed", async () => {
    const total = Number(await Post.count());
    const limit = total - 1;
    let count = 0;
    for await (const batch of Post.limit(limit).findInBatches({})) {
      count += batch.length;
    }
    expect(count).toBe(limit);
  });

  it("in batches should not execute any query", async () => {
    const gen = Post.inBatches({ batchSize: 2 });
    expect(gen).toBeDefined();
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
  });

  it("in batches should error on ignore the order", async () => {
    await expect(async () => {
      for await (const _rel of PostWithDefaultScope.inBatches({ errorOnIgnore: true })) {
      }
    }).rejects.toThrow();
  });

  it("in batches has attribute readers", async () => {
    const relation = Post.all();
    const enumerator = relation.inBatches({ batchSize: 2, start: 42, finish: 84 });
    expect(enumerator.relation).toBe(relation);
    expect(enumerator.batchSize).toBe(2);
    expect(enumerator.start).toBe(42);
    expect(enumerator.finish).toBe(84);
  });

  it("in batches should yield relation if block given", async () => {
    await assertQueriesCount(6, false, async () => {
      for await (const relation of Post.inBatches({ batchSize: 2 })) {
        expect(relation).toBeInstanceOf(Relation);
      }
    });
  });

  it("in batches should be enumerable if no block given", async () => {
    await assertQueriesCount(6, false, async () => {
      for await (const relation of Post.inBatches({ batchSize: 2 })) {
        expect(relation).toBeInstanceOf(Relation);
      }
    });
  });

  it("in batches each record should yield record if block is given", async () => {
    for await (const post of Post.inBatches({ batchSize: 2 }).eachRecord()) {
      const title = post.readAttribute("title") as string;
      expect(title.length).toBeGreaterThan(0);
      expect(post).toBeInstanceOf(Post);
    }
  });

  it("in batches each record should return enumerator if no block given", async () => {
    let index = 0;
    for await (const post of Post.inBatches({ batchSize: 2 }).eachRecord()) {
      const title = post.readAttribute("title") as string;
      expect(title.length).toBeGreaterThan(0);
      expect(post).toBeInstanceOf(Post);
      index++;
    }
    expect(index).toBeGreaterThan(0);
  });

  it("in batches each record should be ordered by id", async () => {
    const ids = (await Post.order("id ASC").toArray()).map((p: any) => p.id);
    let i = 0;
    for await (const post of Post.inBatches({ batchSize: 2 }).eachRecord()) {
      expect(post.id).toBe(ids[i]);
      i++;
    }
  });

  it("in batches update all affect all records", async () => {
    await assertQueriesCount(6 + 6, false, async () => {
      await Post.inBatches({ batchSize: 2 }).updateAll({ title: "updated-title" });
    });
    const all = await Post.all().toArray();
    expect(all.every((p: any) => p.readAttribute("title") === "updated-title")).toBe(true);
  });

  it("in batches update all returns rows affected", async () => {
    const result = await Post.inBatches({ batchSize: 2 }).updateAll({ title: "updated-title" });
    expect(result).toBe(11);
  });

  it("in batches update all returns zero when no batches", async () => {
    const result = await Post.where("1=0")
      .inBatches({ batchSize: 2 })
      .updateAll({ title: "updated-title" });
    expect(result).toBe(0);
  });

  it("in batches touch all affect all records", async () => {
    await assertQueriesCount(6 + 6, false, async () => {
      await Developer.inBatches({ batchSize: 2 }).touchAll();
    });
  });

  it("in batches touch all returns rows affected", async () => {
    const result = await Developer.inBatches({ batchSize: 2 }).touchAll();
    expect(result).toBe(11);
  });

  it("in batches touch all returns zero when no batches", async () => {
    const result = await Developer.where("1=0").inBatches({ batchSize: 2 }).touchAll();
    expect(result).toBe(0);
  });

  it("in batches delete all should not delete records in other batches", async () => {
    const notDeletedCount = Number(await Post.where("id <= 2").count());
    await Post.where("id > 2").inBatches({ batchSize: 2 }).deleteAll();
    expect(Number(await Post.where("id > 2").count())).toBe(0);
    expect(Number(await Post.count())).toBe(notDeletedCount);
  });

  it("in batches delete all returns rows affected", async () => {
    const count = await Post.inBatches({ batchSize: 2 }).deleteAll();
    expect(count).toBe(11);
  });

  it("in batches delete all returns zero when no batches", async () => {
    const count = await Post.where("1=0").inBatches({ batchSize: 2 }).deleteAll();
    expect(count).toBe(0);
  });

  it("in batches destroy all should not destroy records in other batches", async () => {
    const notDestroyedCount = Number(await Post.where("id <= 2").count());
    await Post.where("id > 2").inBatches({ batchSize: 2 }).destroyAll();
    expect(Number(await Post.where("id > 2").count())).toBe(0);
    expect(Number(await Post.count())).toBe(notDestroyedCount);
  });

  it("in batches destroy all returns rows affected", async () => {
    // 1 record is not destroyed because of the callback (id === 1 throws abort)
    const count = await PostWithDestroyCallback.inBatches({ batchSize: 2 }).destroyAll();
    expect(count).toBe(10);
  });

  it("in batches destroy all returns zero when no batches", async () => {
    const count = await Post.where("1=0").inBatches({ batchSize: 2 }).destroyAll();
    expect(count).toBe(0);
  });

  it("in batches should not be loaded", async () => {
    for await (const relation of Post.inBatches({ batchSize: 1 })) {
      expect(relation).toBeInstanceOf(Relation);
    }
    for await (const relation of Post.inBatches({ batchSize: 1, load: false })) {
      expect(relation).toBeInstanceOf(Relation);
    }
  });

  it("in batches should be loaded", async () => {
    for await (const relation of Post.inBatches({ batchSize: 1, load: true })) {
      const records = await relation.toArray();
      expect(Array.isArray(records)).toBe(true);
    }
  });

  it("in batches if not loaded executes more queries", async () => {
    const total = Number(await Post.count());
    await assertQueriesCount(total + 1, false, async () => {
      for await (const relation of Post.inBatches({ batchSize: 1, load: false })) {
        expect(relation).toBeInstanceOf(Relation);
      }
    });
  });

  it("in batches when loaded runs no queries", async () => {
    const posts = Post.all();
    await posts.toArray(); // load
    const total = Number(await Post.count());
    let batchCount = 0;
    await assertQueriesCount(0, false, async () => {
      for await (const relation of posts.inBatches({ batchSize: 1 })) {
        batchCount++;
        expect(relation).toBeInstanceOf(Relation);
      }
    });
    expect(batchCount).toBe(total);
  });

  it("in batches when loaded runs no queries with order argument", async () => {
    const allPosts = Post.all().order("id asc");
    await allPosts.toArray(); // load
    const total = Number(await Post.count());
    let batchCount = 0;
    await assertQueriesCount(0, false, async () => {
      for await (const relation of allPosts.inBatches({ batchSize: 1, order: "desc" })) {
        batchCount++;
        expect(relation).toBeInstanceOf(Relation);
      }
    });
    expect(batchCount).toBe(total);
  });

  it("in batches when loaded runs no queries with start and end arguments", async () => {
    const allPosts = Post.all().order("id asc");
    const loadedPosts = await allPosts.toArray();
    const startId = loadedPosts[1].id as number;
    const finishId = loadedPosts[loadedPosts.length - 2].id as number;
    let batchCount = 0;
    await assertQueriesCount(0, false, async () => {
      for await (const relation of allPosts.inBatches({
        batchSize: 1,
        start: startId,
        finish: finishId,
      })) {
        batchCount++;
        expect(relation).toBeInstanceOf(Relation);
      }
    });
    expect(batchCount).toBe(loadedPosts.length - 2);
  });

  it("in batches when loaded runs no queries with start and end arguments and reverse order", async () => {
    const allPosts = Post.all().order("id asc");
    const loadedPosts = await allPosts.toArray();
    const startId = loadedPosts[loadedPosts.length - 2].id as number;
    const finishId = loadedPosts[1].id as number;
    let batchCount = 0;
    await assertQueriesCount(0, false, async () => {
      for await (const relation of allPosts.inBatches({
        batchSize: 1,
        start: startId,
        finish: finishId,
        order: "desc",
      })) {
        batchCount++;
        expect(relation).toBeInstanceOf(Relation);
      }
    });
    expect(batchCount).toBe(loadedPosts.length - 2);
  });

  it("in batches when loaded can return an enum", async () => {
    const allPosts = Post.all();
    await allPosts.toArray(); // load
    const total = Number(await Post.count());
    let batchCount = 0;
    await assertQueriesCount(0, false, async () => {
      for await (const relation of allPosts.inBatches({ batchSize: 1 })) {
        batchCount++;
        expect(relation).toBeInstanceOf(Relation);
      }
    });
    expect(batchCount).toBe(total);
  });

  it("in batches when loaded runs no queries when batching over cpk model", async () => {
    const incorrectlySorted = CpkOrder.order({ shop_id: "asc", id: "desc" });
    await incorrectlySorted.toArray(); // load
    const correctlySorted = await CpkOrder.order({ shop_id: "desc", id: "asc" }).toArray();
    const expected = correctlySorted.slice(1, correctlySorted.length - 1);
    const startId = (expected[0] as any).id;
    const finishId = (expected[expected.length - 1] as any).id;
    const collected: any[] = [];
    await assertQueriesCount(0, false, async () => {
      for await (const order of incorrectlySorted.findEach({
        batchSize: 1,
        start: startId,
        finish: finishId,
        order: ["desc", "asc"] as any,
      })) {
        collected.push(order);
      }
    });
    expect(collected.map((o: any) => String(o.id))).toEqual(expected.map((o: any) => String(o.id)));
  });

  it("in batches when loaded iterates using custom column", async () => {
    await Post.withConnection(async (conn) => {
      await (conn as any).addIndex("posts", "title", {
        unique: true,
        name: "idx_posts_title_batches",
      });
    });
    try {
      const orderedPosts = Post.order("id desc");
      await orderedPosts.toArray(); // load
      const expected = await Post.order("id desc").toArray();
      const collected: any[] = [];
      for await (const post of orderedPosts
        .inBatches({ batchSize: 1, cursor: "id", order: "desc" })
        .eachRecord()) {
        collected.push(post);
      }
      expect(collected.map((p: any) => p.id)).toEqual(expected.map((p: any) => p.id));
    } finally {
      await Post.withConnection(async (conn) => {
        await (conn as any).removeIndex("posts", { name: "idx_posts_title_batches" });
      });
    }
  });

  it("in batches should return relations", async () => {
    const total = Number(await Post.count());
    await assertQueriesCount(total + 1, false, async () => {
      for await (const relation of Post.inBatches({ batchSize: 1 })) {
        expect(relation).toBeInstanceOf(Relation);
      }
    });
  });

  it("in batches should start from the start option", async () => {
    const post = await Post.order("id ASC").where("id >= ?", 2).first();
    await assertQueriesCount(2, false, async () => {
      let firstRelation: any = null;
      for await (const rel of Post.inBatches({ batchSize: 1, start: 2 })) {
        firstRelation = rel;
        break;
      }
      expect(await firstRelation.first()).toEqual(post);
    });
  });

  it("in batches should end at the finish option", async () => {
    const post = await Post.order("id DESC").where("id <= ?", 5).first();
    const batches: any[] = [];
    for await (const rel of Post.inBatches({ batchSize: 1, finish: 5, load: true })) {
      batches.push(rel);
    }
    const lastBatch = batches[batches.length - 1];
    const records = await lastBatch.toArray();
    expect(records[records.length - 1].id).toBe((post as any).id);
  });

  it("in batches executes range queries when unconstrained", async () => {
    const quoted = escapeRegExp(quoteTableName("posts.id"));
    await assertQueriesMatch(
      new RegExp(`WHERE ${quoted} >=? .+ AND ${quoted} <= .+`, "i"),
      undefined,
      false,
      async () => {
        for await (const relation of Post.inBatches({ batchSize: 2 })) {
          await relation.toArray();
          break;
        }
      },
    );
  });

  it("in batches executes in queries when unconstrained and opted out of ranges", async () => {
    const quoted = escapeRegExp(quoteTableName("posts.id"));
    await assertQueriesMatch(
      new RegExp(`${quoted} IN \\(.+\\)`, "i"),
      undefined,
      false,
      async () => {
        for await (const relation of Post.inBatches({ batchSize: 2, useRanges: false })) {
          await relation.toArray();
          break;
        }
      },
    );
  });

  it("in batches executes in queries when constrained", async () => {
    const quoted = escapeRegExp(quoteTableName("posts.id"));
    await assertQueriesMatch(
      new RegExp(`${quoted} IN \\(.+\\)`, "i"),
      undefined,
      false,
      async () => {
        for await (const relation of Post.where("id < ?", 5).inBatches({ batchSize: 2 })) {
          await relation.toArray();
          break;
        }
      },
    );
  });

  it("in batches executes range queries when constrained and opted in into ranges", async () => {
    const quoted = escapeRegExp(quoteTableName("posts.id"));
    await assertQueriesMatch(
      new RegExp(`${quoted} >=? .+ AND ${quoted} <= .+`, "i"),
      undefined,
      false,
      async () => {
        for await (const relation of Post.where("id < ?", 5).inBatches({
          batchSize: 2,
          useRanges: true,
        })) {
          await relation.toArray();
          break;
        }
      },
    );
  });

  it("in batches no subqueries for whole tables batching", async () => {
    const quotedPosts = escapeRegExp(quoteTableName("posts"));
    await assertQueriesMatch(
      new RegExp(`DELETE FROM ${quotedPosts}`, "i"),
      undefined,
      false,
      async () => {
        await Post.inBatches({ batchSize: 2 }).deleteAll();
      },
    );
  });

  it("in batches shouldnt execute query unless needed", async () => {
    const total = Number(await Post.count());
    await assertQueriesCount(2, false, async () => {
      for await (const relation of Post.inBatches({ batchSize: total })) {
        expect(relation).toBeInstanceOf(Relation);
      }
    });

    await assertQueriesCount(1, false, async () => {
      for await (const relation of Post.inBatches({ batchSize: total + 1 })) {
        expect(relation).toBeInstanceOf(Relation);
      }
    });
  });

  it("in batches should quote batch order", async () => {
    await assertQueriesMatch(
      new RegExp(`ORDER BY ${escapeRegExp(quoteTableName("posts.id"))}`),
      undefined,
      false,
      async () => {
        for await (const relation of Post.inBatches({ batchSize: 1 })) {
          expect(relation).toBeInstanceOf(Relation);
          break;
        }
      },
    );
  });

  it("in batches should quote batch order with desc order", async () => {
    await assertQueriesMatch(
      new RegExp(`ORDER BY ${escapeRegExp(quoteTableName("posts.id"))} DESC`),
      undefined,
      false,
      async () => {
        for await (const relation of Post.inBatches({ batchSize: 1, order: "desc" })) {
          expect(relation).toBeInstanceOf(Relation);
          break;
        }
      },
    );
  });

  it("in batches enumerator should quote batch order with desc order", async () => {
    await assertQueriesMatch(
      new RegExp(`ORDER BY ${escapeRegExp(quoteTableName("posts.id"))} DESC`),
      undefined,
      false,
      async () => {
        let first: any = null;
        for await (const rel of Post.inBatches({ batchSize: 1, order: "desc" })) {
          first = rel;
          break;
        }
        expect(first).toBeInstanceOf(Relation);
        expect(await first.first()).toBeInstanceOf(Post);
      },
    );
  });

  it("in batches enumerator each record should quote batch order with desc order", async () => {
    await assertQueriesMatch(
      new RegExp(`ORDER BY ${escapeRegExp(quoteTableName("posts.id"))} DESC`),
      undefined,
      false,
      async () => {
        for await (const record of Post.inBatches({ batchSize: 1, order: "desc" }).eachRecord()) {
          expect(record).toBeInstanceOf(Post);
        }
      },
    );
  });

  it("in batches should not use records after yielding them in case original array is modified", async () => {
    for await (const relation of Post.inBatches({ batchSize: 1 })) {
      expect(relation).toBeInstanceOf(Relation);
      expect(await relation.first()).toBeInstanceOf(Post);
    }
  });

  it("in batches should not ignore default scope without order statements", async () => {
    const defaultScope = await SpecialPostWithDefaultScope.all().toArray();
    const batchPosts: any[] = [];
    for await (const relation of SpecialPostWithDefaultScope.inBatches({})) {
      const records = await relation.toArray();
      batchPosts.push(...records);
    }
    const defaultIds = defaultScope
      .map((p: any) => Number(p.id))
      .sort((a: number, b: number) => a - b);
    const batchIds = batchPosts.map((p: any) => Number(p.id)).sort((a: number, b: number) => a - b);
    expect(batchIds).toEqual(defaultIds);
  });

  it("in batches should use any column as primary key", async () => {
    const nickOrderSubscribers = await Subscriber.order("nick asc").toArray();
    const startNick = nickOrderSubscribers[1].readAttribute("nick") as string;
    const collected: any[] = [];
    for await (const relation of Subscriber.inBatches({ batchSize: 1, start: startNick })) {
      const records = await relation.toArray();
      collected.push(...records);
    }
    const expected = nickOrderSubscribers.slice(1).map((s: any) => s.id);
    expect(collected.map((s: any) => s.id)).toEqual(expected);
  });

  it("in batches should use any column as primary key when start is not specified", async () => {
    const count = Number(await Subscriber.count());
    await assertQueriesCount(count + 1, false, async () => {
      for await (const relation of Subscriber.inBatches({ batchSize: 1, load: true })) {
        expect(relation).toBeInstanceOf(Relation);
        expect(await relation.first()).toBeInstanceOf(Subscriber);
      }
    });
  });

  it("in batches should return an enumerator", async () => {
    const gen = Post.inBatches({ batchSize: 1 });
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
    let count = 0;
    for await (const relation of gen) {
      expect(relation).toBeInstanceOf(Relation);
      expect(await relation.first()).toBeInstanceOf(Post);
      count++;
      if (count >= 4) break;
    }
    expect(count).toBe(4);
  });

  it("in batches relations should not overlap with each other", async () => {
    const seenIds = new Set<any>();
    for await (const relation of Post.inBatches({ batchSize: 2, load: true })) {
      const records = await relation.toArray();
      for (const post of records) {
        expect(seenIds.has((post as any).id)).toBe(false);
        seenIds.add((post as any).id);
      }
    }
  });

  it("in batches relations with condition should not overlap with each other", async () => {
    const authorId = (await Post.first())?.readAttribute("author_id");
    const postsByAuthor = await Post.where({ author_id: authorId }).toArray();
    const seenPosts: any[] = [];
    for await (const batch of Post.inBatches({ batchSize: 2 })) {
      const records = await batch.where({ author_id: authorId }).toArray();
      seenPosts.push(...records);
    }
    const expectedIds = postsByAuthor
      .map((p: any) => Number(p.id))
      .sort((a: number, b: number) => a - b);
    const seenIds = seenPosts.map((p: any) => Number(p.id)).sort((a: number, b: number) => a - b);
    expect(seenIds).toEqual(expectedIds);
  });

  it("in batches relations update all should not affect matching records in other batches", async () => {
    await Post.updateAll({ author_id: 0 });
    const person = await Post.last();
    await person!.update({ author_id: 1 });

    for await (const batch of Post.inBatches({ batchSize: 2 })) {
      await batch.where({ author_id: 1 }).updateAll({ author_id: 2 });
    }
    await person!.reload();
    expect(person!.readAttribute("author_id")).toBe(2); // updated only once
  });

  it("in batches with custom columns raises when start missing items", async () => {
    await expect(async () => {
      for await (const _rel of Post.inBatches({ start: 1, cursor: ["author_id", "id"] as any })) {
      }
    }).rejects.toThrow();
  });

  it("in batches with custom columns raises when finish missing items", async () => {
    await expect(async () => {
      for await (const _rel of Post.inBatches({ finish: 10, cursor: ["author_id", "id"] as any })) {
      }
    }).rejects.toThrow();
  });

  it("in batches with custom columns raises when non unique columns", async () => {
    // primary key column: should not raise
    let threw = false;
    try {
      for await (const _rel of Post.inBatches({ cursor: "id" })) {
        break;
      }
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("in batches iterating using custom columns", async () => {
    await Post.withConnection(async (conn) => {
      await (conn as any).addIndex("posts", "title", {
        unique: true,
        name: "idx_posts_title_custom_cols",
      });
    });
    try {
      const expected = await Post.order("id desc").toArray();
      const collected: any[] = [];
      for await (const post of Post.inBatches({
        batchSize: 1,
        cursor: "id",
        order: "desc",
      }).eachRecord()) {
        collected.push(post);
      }
      expect(collected.map((p: any) => p.id)).toEqual(expected.map((p: any) => p.id));
    } finally {
      await Post.withConnection(async (conn) => {
        await (conn as any).removeIndex("posts", { name: "idx_posts_title_custom_cols" });
      });
    }
  });

  it("find in batches should return a sized enumerator", async () => {
    const total = Number(await Post.count());
    let c1 = 0;
    for await (const _b of Post.findInBatches({ batchSize: 1 })) {
      c1++;
    }
    expect(c1).toBe(total);

    let c2 = 0;
    for await (const _b of Post.findInBatches({ batchSize: 2 })) {
      c2++;
    }
    expect(c2).toBe(Math.ceil(total / 2));
  });

  it("in_batches should return limit records when limit is less than batch size and load is", async () => {
    const limit = 3;
    const batchSize = 5;
    for (const load of [true, false]) {
      let count = 0;
      for await (const batch of Post.limit(limit).inBatches({ batchSize, load })) {
        count += Number(await batch.count());
      }
      expect(count).toBe(limit);
    }
  });

  it("in_batches should return limit records when limit is greater than batch size and load is", async () => {
    const limit = 5;
    const batchSize = 3;
    for (const load of [true, false]) {
      let count = 0;
      for await (const batch of Post.limit(limit).inBatches({ batchSize, load })) {
        count += Number(await batch.count());
      }
      expect(count).toBe(limit);
    }
  });

  it("in_batches should return limit records when limit is a multiple of the batch size and load is", async () => {
    const limit = 6;
    const batchSize = 3;
    for (const load of [true, false]) {
      let count = 0;
      for await (const batch of Post.limit(limit).inBatches({ batchSize, load })) {
        count += Number(await batch.count());
      }
      expect(count).toBe(limit);
    }
  });

  it("in_batches should return no records if the limit is 0 and load is", async () => {
    for (const load of [true, false]) {
      let count = 0;
      for await (const batch of Post.limit(0).inBatches({ batchSize: 1, load })) {
        count += Number(await batch.count());
      }
      expect(count).toBe(0);
    }
  });

  it("in_batches should return all if the limit is greater than the number of records when load is", async () => {
    const total = Number(await Post.count());
    for (const load of [true, false]) {
      let count = 0;
      for await (const batch of Post.limit(total + 1).inBatches({ batchSize: 1, load })) {
        count += Number(await batch.count());
      }
      expect(count).toBe(total);
    }
  });

  it(".find_each respects table alias", async () => {
    await assertQueriesCount(1, false, async () => {
      const tableAlias = Post.arelTable.alias("omg_posts");
      const postRel = new Relation(Post, tableAlias as any);
      for await (const _post of postRel.findEach({})) {
      }
    });
  });

  it(".find_each bypasses the query cache for its own queries", async () => {
    await assertQueriesCount(2, false, async () => {
      for await (const _post of Post.findEach({})) {
      }
      for await (const _post of Post.findEach({})) {
      }
    });
  });

  it(".find_each does not disable the query cache inside the given block", async () => {
    const postId = posts("welcome").id as number;
    await assertQueriesCount(1, false, async () => {
      for await (const p of Post.findEach({ start: postId, finish: postId })) {
        await p.readAttribute("legacy_comments_count");
        await p.readAttribute("legacy_comments_count");
        break;
      }
    });
  });

  it(".find_in_batches bypasses the query cache for its own queries", async () => {
    await assertQueriesCount(2, false, async () => {
      for await (const _b of Post.findInBatches({})) {
      }
      for await (const _b of Post.findInBatches({})) {
      }
    });
  });

  it(".find_in_batches does not disable the query cache inside the given block", async () => {
    const postId = posts("welcome").id as number;
    await assertQueriesCount(1, false, async () => {
      for await (const batch of Post.findInBatches({ start: postId, finish: postId })) {
        await batch[0].readAttribute("legacy_comments_count");
        await batch[0].readAttribute("legacy_comments_count");
        break;
      }
    });
  });

  it(".in_batches bypasses the query cache for its own queries", async () => {
    await assertQueriesCount(2, false, async () => {
      for await (const _rel of Post.inBatches({})) {
      }
      for await (const _rel of Post.inBatches({})) {
      }
    });
  });

  it(".in_batches does not disable the query cache inside the given block", async () => {
    const postId = posts("welcome").id as number;
    for await (const rel of Post.inBatches({ start: postId, finish: postId })) {
      const c1 = Number(await rel.count());
      const c2 = Number(await rel.count());
      expect(c1).toBe(c2);
      break;
    }
  });

  it(".find_each iterates over composite primary key", async () => {
    const orders = await CpkOrder.order(...(CpkOrder.primaryKey as string[])).toArray();
    const orderIds = orders.map((o: any) => JSON.stringify(o.id));
    let index = 0;
    for await (const order of CpkOrder.findEach({ batchSize: 1 })) {
      expect(JSON.stringify((order as any).id)).toBe(orderIds[index]);
      index++;
    }
    expect(index).toBe(orders.length);
  });

  it(".in_batches should start from the start option when using composite primary key", async () => {
    // Fixture cpk_orders have null shop_ids (schema uses single-pk id); create
    // explicit records with non-null composite keys so start: works correctly.
    await CpkOrder.deleteAll();
    await CpkOrder.create({ shop_id: 1, id: 1, status: "paid" });
    await CpkOrder.create({ shop_id: 1, id: 2, status: "paid" });
    await CpkOrder.create({ shop_id: 2, id: 3, status: "cancelled" });
    const allOrders = await CpkOrder.order(...(CpkOrder.primaryKey as string[])).toArray();
    const order = allOrders[1]; // second
    let firstRelation: any = null;
    for await (const rel of CpkOrder.inBatches({ batchSize: 1, start: (order as any).id })) {
      firstRelation = rel;
      break;
    }
    const first = await firstRelation.first();
    expect(JSON.stringify(first.id)).toBe(JSON.stringify((order as any).id));
  });

  it(".in_batches should end at the finish option when using composite primary key", async () => {
    await CpkOrder.deleteAll();
    await CpkOrder.create({ shop_id: 1, id: 1, status: "paid" });
    await CpkOrder.create({ shop_id: 1, id: 2, status: "paid" });
    await CpkOrder.create({ shop_id: 2, id: 3, status: "cancelled" });
    const allOrders = await CpkOrder.order(...(CpkOrder.primaryKey as string[])).toArray();
    const order = allOrders[allOrders.length - 2]; // second_to_last
    const batches: any[] = [];
    for await (const rel of CpkOrder.inBatches({ batchSize: 1, finish: (order as any).id })) {
      batches.push(rel);
    }
    const lastBatch = batches[batches.length - 1];
    const records = await lastBatch.toArray();
    const last = records[records.length - 1];
    expect(JSON.stringify(last.id)).toBe(JSON.stringify((order as any).id));
  });

  it(".in_batches with scope and using composite primary key", async () => {
    await CpkOrder.deleteAll();
    await CpkOrder.create({ shop_id: 1, id: 1, status: "paid" });
    await CpkOrder.create({ shop_id: 1, id: 2, status: "paid" });
    await CpkOrder.create({ shop_id: 2, id: 3, status: "cancelled" });
    const allOrders = await CpkOrder.order(...(CpkOrder.primaryKey as string[])).toArray();
    const [order1, order2] = allOrders;
    const [shopId, id] = (order1 as any).id as [number, number];
    let firstRelation: any = null;
    for await (const rel of CpkOrder.where(
      "shop_id > ? OR shop_id = ? AND id > ?",
      shopId,
      shopId,
      id,
    ).inBatches({ batchSize: 1 })) {
      firstRelation = rel;
      break;
    }
    expect(firstRelation).not.toBeNull();
    const first = await firstRelation.first();
    expect(JSON.stringify(first.id)).toBe(JSON.stringify((order2 as any).id));
  });

  it(".find_each with multiple column ordering and using composite primary key", async () => {
    await CpkBook.create({ author_id: 1, id: 1 });
    await CpkBook.create({ author_id: 2, id: 1 });
    await CpkBook.create({ author_id: 2, id: 2 });
    const books = await CpkBook.order({ author_id: "asc", id: "desc" }).toArray();
    const bookIds = books.map((b: any) => JSON.stringify(b.id));
    let index = 0;
    for await (const book of CpkBook.findEach({ batchSize: 1, order: ["asc", "desc"] as any })) {
      expect(JSON.stringify((book as any).id)).toBe(bookIds[index]);
      index++;
    }
    expect(index).toBe(books.length);
  });

  it(".in_batches should start from the start option when using composite primary key with multiple column ordering", async () => {
    await CpkBook.create({ author_id: 1, id: 1 });
    await CpkBook.create({ author_id: 1, id: 2 });
    await CpkBook.create({ author_id: 1, id: 3 });
    const secondBook = await CpkBook.order({ author_id: "asc", id: "desc" }).offset(1).first();
    let firstRelation: any = null;
    for await (const rel of CpkBook.inBatches({
      batchSize: 1,
      start: (secondBook as any).id,
      order: ["asc", "desc"] as any,
    })) {
      firstRelation = rel;
      break;
    }
    const first = await firstRelation.first();
    expect(JSON.stringify(first.id)).toBe(JSON.stringify((secondBook as any).id));
  });

  it(".in_batches should end at the finish option when using composite primary key with multiple column ordering", async () => {
    await CpkBook.create({ author_id: 1, id: 1 });
    await CpkBook.create({ author_id: 1, id: 2 });
    await CpkBook.create({ author_id: 1, id: 3 });
    const secondBook = await CpkBook.order({ author_id: "asc", id: "desc" }).offset(1).first();
    const batches: any[] = [];
    for await (const rel of CpkBook.inBatches({
      batchSize: 1,
      finish: (secondBook as any).id,
      order: ["asc", "desc"] as any,
    })) {
      batches.push(rel);
    }
    const lastBatch = batches[batches.length - 1];
    const first = await lastBatch.first();
    expect(JSON.stringify(first.id)).toBe(JSON.stringify((secondBook as any).id));
  });

  it(".in_batches with scope and multiple column ordering and using composite primary key", async () => {
    await CpkBook.create({ author_id: 1, id: 1 });
    await CpkBook.create({ author_id: 1, id: 2 });
    await CpkBook.create({ author_id: 1, id: 3 });
    const [book1, book2] = await CpkBook.order({ author_id: "asc", id: "desc" }).limit(2).toArray();
    const [authorId, id] = (book1 as any).id as [number, number];
    let firstRelation: any = null;
    for await (const rel of CpkBook.where("author_id >= ? AND id < ?", authorId, id).inBatches({
      batchSize: 1,
      order: ["asc", "desc"] as any,
    })) {
      firstRelation = rel;
      break;
    }
    const first = await firstRelation.first();
    expect(JSON.stringify(first.id)).toBe(JSON.stringify((book2 as any).id));
  });
});
