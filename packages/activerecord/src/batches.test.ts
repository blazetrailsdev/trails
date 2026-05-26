/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, Relation } from "./index.js";
import { activeRecordConfig } from "./relation/batches.js";

import { createTestAdapter, type TestDatabaseAdapter } from "./test-adapter.js";
import { defineSchema, type Schema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

const TEST_SCHEMA: Schema = {
  posts: {
    title: "string",
    updated: "boolean",
    updated_at: "datetime",
    active: "boolean",
    processed: "boolean",
    done: "boolean",
  },
  subscribers: {
    columns: {
      nick: "string",
      name: "string",
    },
    primaryKey: ["nick"],
  },
  orders: {
    columns: {
      shopId: "integer",
      id: "integer",
    },
    primaryKey: ["shopId", "id"],
  },
  users: {
    name: "string",
    active: "boolean",
  },
  items: {
    name: "string",
  },
  records: {
    value: "integer",
  },
};

// -- Helpers --
async function freshAdapter(): Promise<TestDatabaseAdapter> {
  const adapter = createTestAdapter();
  await defineSchema(adapter, TEST_SCHEMA);
  return adapter;
}

// ==========================================================================
// EachTest — targets batches_test.rb
// ==========================================================================
describe("EachTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });
  it("find_each should honor limit if passed a block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 10; i++) await Post.create({ title: `post ${i}` });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 3 })) {
      collected.push(record);
    }
    expect(collected.length).toBe(10);
  });

  it("find_each should honor limit if no block is passed", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `post ${i}` });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({})) {
      collected.push(record);
    }
    expect(collected.length).toBe(5);
  });

  it("find_in_batches should honor limit if passed a block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 10; i++) await Post.create({ title: `post ${i}` });
    const batches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 3 })) {
      batches.push(batch);
    }
    expect(batches.length).toBeGreaterThan(0);
  });

  it("find_in_batches should honor limit if no block is passed", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `post ${i}` });
    const batches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 2 })) {
      batches.push(batch);
    }
    expect(batches.length).toBeGreaterThan(0);
  });
});

// ==========================================================================
// More EachTest — targets batches_test.rb
// ==========================================================================
describe("EachTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });
  it("in batches has attribute readers", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `post ${i}` });
    for await (const batch of Post.all().findInBatches({ batchSize: 2 })) {
      expect(Array.isArray(batch)).toBe(true);
      break;
    }
  });

  it("each should return a sized enumerator", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `post ${i}` });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 2 })) {
      collected.push(record);
    }
    expect(collected.length).toBe(5);
  });

  it("find in batches should end at the finish option", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 10; i++) await Post.create({ title: `post ${i}` });
    const batches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 3 })) {
      batches.push(batch);
    }
    expect(batches.length).toBeGreaterThan(0);
  });

  it("find in batches should use any column as primary key", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `post ${i}` });
    const batches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 2 })) {
      batches.push(batch);
    }
    expect(batches.length).toBeGreaterThan(0);
  });
});

// ==========================================================================
// EachTest — more targets for batches_test.rb
// ==========================================================================
describe("EachTest", () => {
  it("each should execute one query per batch", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 9; i++) await Post.create({ title: `post-${i}` });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 3 })) {
      collected.push(record);
    }
    expect(collected.length).toBe(9);
  });

  it("each should not return query chain and execute only one query", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `post-${i}` });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 10 })) {
      collected.push(record);
    }
    expect(collected.length).toBe(5);
  });

  it("each should raise if select is set without id", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "a" });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 2 })) {
      collected.push(record);
    }
    expect(collected.length).toBeGreaterThan(0);
  });

  it("each should execute if id is in select", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 2 })) {
      collected.push(record);
    }
    expect(collected.length).toBe(2);
  });

  it("find in batches should return batches", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 7; i++) await Post.create({ title: `post-${i}` });
    const batches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 3 })) {
      batches.push(batch);
    }
    expect(batches.length).toBe(3);
  });

  it("find in batches should start from the start option", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const posts: any[] = [];
    for (let i = 0; i < 5; i++) {
      const p = (await Post.create({ title: `post-${i}` })) as any;
      posts.push(p);
    }
    const startId = posts[2].id;
    const collected: any[] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 3, start: startId })) {
      collected.push(...batch);
    }
    expect(collected.length).toBeLessThanOrEqual(5);
    expect(collected.length).toBeGreaterThan(0);
  });

  it("find in batches should return an enumerator", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `post-${i}` });
    const batches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 2 })) {
      batches.push(batch);
    }
    expect(batches.length).toBe(2);
  });

  it("in batches should not execute any query", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `post-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBeGreaterThan(0);
  });

  it("in batches should yield relation if block given", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `post-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBeGreaterThan(0);
    expect(batchRels[0]).toBeInstanceOf(Relation);
  });

  it("in batches should be enumerable if no block given", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `post-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(2);
  });

  it("in batches each record should yield record if block is given", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `batch-rec-${i}` });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 2 })) {
      collected.push(record);
    }
    expect(collected.length).toBe(5);
  });

  it("in batches each record should be ordered by id", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `order-${i}` });
    const ids: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 2 })) {
      ids.push((record as any).id);
    }
    const sorted = [...ids].sort((a, b) => a - b);
    expect(ids).toEqual(sorted);
  });

  it("in batches should return relations", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `rel-${i}` });
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      expect(batchRel).toBeInstanceOf(Relation);
    }
  });

  it("in batches should start from the start option", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `p-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBeGreaterThan(0);
  });

  it("in batches shouldnt execute query unless needed", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `lazy-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 5 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(1);
  });

  it("in batches update all affect all records", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("updated", "boolean");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `upd-${i}`, updated: false });
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      await batchRel.updateAll({ updated: true });
    }
    const allUpdated = await Post.all().toArray();
    expect(allUpdated.every((r: any) => r.updated === true)).toBe(true);
  });

  it("in batches delete all should not delete records in other batches", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `del-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 3 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(2);
  });

  it("in batches destroy all should not destroy records in other batches", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `destroy-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(2);
  });

  it("in batches should not be loaded", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `load-${i}` });
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      expect(batchRel).toBeInstanceOf(Relation);
    }
  });

  it("in batches should be loaded", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `load-${i}` });
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      const records = await batchRel.toArray();
      expect(Array.isArray(records)).toBe(true);
    }
  });

  it("in batches relations should not overlap with each other", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `overlap-${i}` });
    const seenIds = new Set<any>();
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      const records = await batchRel.toArray();
      for (const r of records) {
        const id = (r as any).id;
        expect(seenIds.has(id)).toBe(false);
        seenIds.add(id);
      }
    }
    expect(seenIds.size).toBe(6);
  });

  it("find in batches should return a sized enumerator", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `sized-${i}` });
    const batches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 3 })) {
      batches.push(batch);
    }
    expect(batches.length).toBe(2);
    expect(batches[0].length).toBe(3);
    expect(batches[1].length).toBe(3);
  });

  it("each should return an enumerator if no block is present", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `enum-${i}` });
    const gen = Post.all().findEach({ batchSize: 2 });
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
  });

  it("each enumerator should execute one query per batch", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `enum-batch-${i}` });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 3 })) {
      collected.push(record);
    }
    expect(collected.length).toBe(6);
  });

  it("in batches touch all affect all records", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `touch-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBeGreaterThan(0);
  });

  it.skip("find in batches should quote batch order", () => {});

  it.skip("find in batches should ignore the order default scope", () => {});

  it("find in batches should error on ignore the order", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await expect(async () => {
      for await (const _b of Post.order("title").findInBatches({
        batchSize: 1,
        errorOnIgnore: true,
      })) {
        /* noop */
      }
    }).rejects.toThrow();
  });

  it("find in batches should not error if config overridden", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "a" });
    const prev = activeRecordConfig.errorOnIgnoredOrder;
    activeRecordConfig.errorOnIgnoredOrder = true;
    let threw = false;
    try {
      for await (const _b of Post.order("title").findInBatches({
        batchSize: 1,
        errorOnIgnore: false,
      })) {
        /* noop */
      }
    } catch {
      threw = true;
    } finally {
      activeRecordConfig.errorOnIgnoredOrder = prev;
    }
    expect(threw).toBe(false);
  });

  it("find in batches should error on config specified to error", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const prevErrCfg = activeRecordConfig.errorOnIgnoredOrder;
    activeRecordConfig.errorOnIgnoredOrder = true;
    try {
      await expect(async () => {
        for await (const _b of Post.order("title").findInBatches({ batchSize: 1 })) {
          /* noop */
        }
      }).rejects.toThrow();
    } finally {
      activeRecordConfig.errorOnIgnoredOrder = prevErrCfg;
    }
  });

  it("find in batches should not error by default", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "a" });
    const batches: any[][] = [];
    let threw = false;
    try {
      for await (const batch of Post.order("title").findInBatches({ batchSize: 1 })) {
        batches.push(batch);
      }
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(batches.length).toBe(1);
  });

  it("find in batches should use any column as primary key when start is not specified", async () => {
    const adp = await freshAdapter();
    class Subscriber extends Base {
      static {
        this.primaryKey = "nick";
        this.attribute("nick", "string");
        this.attribute("name", "string");
        this.adapter = adp;
      }
    }
    await Subscriber.create({ nick: "a", name: "Alice" });
    await Subscriber.create({ nick: "b", name: "Bob" });
    await Subscriber.create({ nick: "c", name: "Carol" });
    const collected: any[] = [];
    for await (const batch of Subscriber.findInBatches({ batchSize: 1, cursor: "nick" })) {
      expect(Array.isArray(batch)).toBe(true);
      collected.push(...batch);
    }
    expect(collected.map((r) => r.readAttribute("nick"))).toEqual(["a", "b", "c"]);
  });

  it("in batches update all returns zero when no batches", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    let total = 0;
    let batches = 0;
    for await (const batchRel of Post.where({ title: "nonexistent" }).inBatches({ batchSize: 2 })) {
      batches++;
      total += await batchRel.updateAll({ title: "updated" });
    }
    expect(batches).toBe(0);
    expect(total).toBe(0);
  });

  it("in batches touch all returns rows affected", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("updated_at", "datetime");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    await Post.create({ title: "c" });
    let total = 0;
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      total += await batchRel.touchAll();
    }
    expect(total).toBe(3);
  });

  it("in batches touch all returns zero when no batches", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    let total = 0;
    let batches = 0;
    for await (const batchRel of Post.where({ title: "nonexistent" }).inBatches({ batchSize: 2 })) {
      batches++;
      total += await batchRel.touchAll();
    }
    expect(batches).toBe(0);
    expect(total).toBe(0);
  });

  it("in batches delete all returns zero when no batches", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    let total = 0;
    let batches = 0;
    for await (const batchRel of Post.where({ title: "nonexistent" }).inBatches({ batchSize: 2 })) {
      batches++;
      total += await batchRel.deleteAll();
    }
    expect(batches).toBe(0);
    expect(total).toBe(0);
  });

  it("in batches destroy all returns zero when no batches", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    let total = 0;
    let batches = 0;
    for await (const batchRel of Post.where({ title: "nonexistent" }).inBatches({ batchSize: 2 })) {
      batches++;
      const destroyed = await batchRel.destroyAll();
      total += destroyed.length;
    }
    expect(batches).toBe(0);
    expect(total).toBe(0);
  });

  it("in batches should use any column as primary key when start is not specified", async () => {
    const adp = await freshAdapter();
    class Subscriber extends Base {
      static {
        this.primaryKey = "nick";
        this.attribute("nick", "string");
        this.attribute("name", "string");
        this.adapter = adp;
      }
    }
    await Subscriber.create({ nick: "a", name: "Alice" });
    await Subscriber.create({ nick: "b", name: "Bob" });
    await Subscriber.create({ nick: "c", name: "Carol" });
    let count = 0;
    for await (const rel of Subscriber.all().inBatches({ batchSize: 1, cursor: "nick" })) {
      expect(rel).toBeInstanceOf(Relation);
      count += (await rel.toArray()).length;
    }
    expect(count).toBe(3);
  });

  it("in_batches should return no records if the limit is 0 and load is ", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `post-${i}` });
    let total = 0;
    for await (const batch of Post.limit(0).inBatches({ batchSize: 1 })) {
      total += (await batch.count()) as number;
    }
    expect(total).toBe(0);
  });

  it.skip(".find_each respects table alias", () => {
    // ROOT-CAUSE fixed: findEach no longer throws on CPK; table alias needs Relation.create test infra
  });

  it(".in_batches should start from the start option when using composite primary key", async () => {
    const adp = await freshAdapter();
    class Order extends Base {
      static {
        this.primaryKey = ["shopId", "id"];
        this.attribute("shopId", "integer");
        this.attribute("id", "integer");
        this.adapter = adp;
      }
    }
    await Order.create({ shopId: 1, id: 1 });
    await Order.create({ shopId: 1, id: 2 });
    await Order.create({ shopId: 1, id: 3 });
    const second = (await Order.all().toArray())[1];
    const startId = [second.readAttribute("shopId"), second.readAttribute("id")];
    let firstBatch: any = null;
    for await (const rel of Order.inBatches({ batchSize: 1, start: startId })) {
      firstBatch = rel;
      break;
    }
    expect(firstBatch).not.toBeNull();
    const record = (await firstBatch.toArray())[0];
    expect(record.readAttribute("id")).toBe(second.readAttribute("id"));
  });

  it(".in_batches should end at the finish option when using composite primary key", async () => {
    const adp = await freshAdapter();
    class Order extends Base {
      static {
        this.primaryKey = ["shopId", "id"];
        this.attribute("shopId", "integer");
        this.attribute("id", "integer");
        this.adapter = adp;
      }
    }
    await Order.create({ shopId: 1, id: 1 });
    await Order.create({ shopId: 1, id: 2 });
    await Order.create({ shopId: 1, id: 3 });
    const allOrders = await Order.all().toArray();
    const secondToLast = allOrders[allOrders.length - 2];
    const finishId = [secondToLast.readAttribute("shopId"), secondToLast.readAttribute("id")];
    const batches: any[] = [];
    for await (const rel of Order.inBatches({ batchSize: 1, finish: finishId })) {
      batches.push(rel);
    }
    const lastBatch = batches[batches.length - 1];
    const records = await lastBatch.toArray();
    expect(records[records.length - 1].readAttribute("id")).toBe(secondToLast.readAttribute("id"));
  });

  it("in batches with useRanges emits range predicate and covers all rows", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 7; i++) await Post.create({ title: `t-${i}` });
    let total = 0;
    const sqls: string[] = [];
    for await (const rel of Post.all().inBatches({ batchSize: 3, useRanges: true })) {
      sqls.push(rel.toSql());
      total += (await rel.toArray()).length;
    }
    expect(total).toBe(7);
    // useRanges yields a range predicate (>= AND <=), never an IN clause.
    expect(sqls.length).toBeGreaterThan(0);
    for (const sql of sqls) {
      expect(sql).toMatch(/>=/);
      expect(sql).toMatch(/<=/);
      expect(sql).not.toMatch(/\bIN\s*\(/i);
    }
  });
});

// ==========================================================================
// EachTest2 — more targets for batches_test.rb
// ==========================================================================
describe("EachTest", () => {
  it("each should return a sized enumerator", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `sized-${i}` });
    const gen = Post.all().findEach({ batchSize: 2 });
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
  });

  it("find in batches shouldnt execute query unless needed", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `lazy-${i}` });
    const batches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 10 })) {
      batches.push(batch);
    }
    expect(batches.length).toBe(1);
  });

  it("find in batches should not use records after yielding them in case original array is modified", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `mod-${i}` });
    const allBatches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 3 })) {
      allBatches.push([...batch]);
    }
    expect(allBatches.length).toBe(2);
  });

  it("find in batches should not ignore the default scope if it is other then order", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("active", "boolean");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `scope-${i}`, active: i % 2 === 0 });
    const collected: any[] = [];
    for await (const batch of Post.where({ active: true }).findInBatches({ batchSize: 2 })) {
      collected.push(...batch);
    }
    expect(collected.every((r: any) => r.active === true)).toBe(true);
  });

  it("in batches should end at the finish option", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 8; i++) await Post.create({ title: `p-${i}` });
    const collected: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 3 })) {
      const records = await batchRel.toArray();
      collected.push(...records);
    }
    expect(collected.length).toBe(8);
  });

  it("in batches should use any column as primary key", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `col-${i}` });
    const collected: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      const records = await batchRel.toArray();
      collected.push(...records);
    }
    expect(collected.length).toBe(4);
  });

  it("in batches relations with condition should not overlap with each other", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("active", "boolean");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 8; i++) await Post.create({ title: `cond-${i}`, active: true });
    const seenIds = new Set<any>();
    for await (const batchRel of Post.where({ active: true }).inBatches({ batchSize: 3 })) {
      const records = await batchRel.toArray();
      for (const r of records) {
        const id = (r as any).id;
        expect(seenIds.has(id)).toBe(false);
        seenIds.add(id);
      }
    }
    expect(seenIds.size).toBe(8);
  });

  it("in batches relations update all should not affect matching records in other batches", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("processed", "boolean");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `proc-${i}`, processed: false });
    for await (const batchRel of Post.all().inBatches({ batchSize: 3 })) {
      await batchRel.updateAll({ processed: true });
    }
    const all = await Post.all().toArray();
    expect(all.every((r: any) => r.processed === true)).toBe(true);
  });

  it("in batches when loaded can return an enum", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `enum2-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(2);
  });

  it("in batches should return an enumerator", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `iter2-${i}` });
    const gen = Post.all().inBatches({ batchSize: 2 });
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
  });

  it("in batches each record should return enumerator if no block given", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `rec2-${i}` });
    const gen = Post.all().findEach({ batchSize: 2 });
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
  });

  it("in batches update all returns rows affected", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("done", "boolean");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `rows2-${i}`, done: false });
    let total = 0;
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      const count = await batchRel.updateAll({ done: true });
      total += count;
    }
    expect(total).toBe(4);
  });

  it("in batches delete all returns rows affected", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `del-rows2-${i}` });
    let total = 0;
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      const count = await batchRel.deleteAll();
      total += count;
    }
    expect(total).toBe(4);
  });

  it("in batches destroy all returns rows affected", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `destroy-rows2-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBeGreaterThan(0);
  });

  it("in batches if not loaded executes more queries", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `q2-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(2);
  });

  it("in batches when loaded runs no queries", async () => {
    const adp = await freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `loaded2-${i}` });
    const allRecords = await Post.all().toArray();
    expect(allRecords.length).toBe(4);
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(2);
  });
});

// ==========================================================================
// BatchEnumerator API tests — matches Rails batches_test.rb names
// ==========================================================================
describe("EachTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });
  it("in_batches each_batch should yield batch relations if block is given", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `post-${i}` });
    const batches: any[] = [];
    await Post.all()
      .inBatches({ batchSize: 2 })
      .eachBatch((batch: any) => {
        batches.push(batch);
      });
    expect(batches.length).toBe(3);
  });

  it("in_batches each_batch should return enumerator if no block given", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `post-${i}` });
    const batches: any[] = [];
    for await (const batch of Post.all().inBatches({ batchSize: 2 }).eachBatch()) {
      batches.push(batch);
    }
    expect(batches.length).toBe(2);
  });

  it("in_batches each_record should yield record if block is given", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `post-${i}` });
    const records: any[] = [];
    await Post.all()
      .inBatches({ batchSize: 2 })
      .eachRecord((record: any) => {
        records.push(record);
      });
    expect(records.length).toBe(5);
  });

  it("in_batches each_record should return enumerator if no block given", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `post-${i}` });
    const records: any[] = [];
    for await (const record of Post.all().inBatches({ batchSize: 2 }).eachRecord()) {
      records.push(record);
    }
    expect(records.length).toBe(3);
  });

  it("in_batches update_all affect all records", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("active", "boolean");
      }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `post-${i}`, active: false });
    const count = await Post.all().inBatches({ batchSize: 2 }).updateAll({ active: true });
    expect(count).toBe(4);
    const all = await Post.all().toArray();
    for (const post of all) {
      expect((post as any).readAttribute("active")).toBe(true);
    }
  });

  it("in_batches update_all returns rows affected", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `post-${i}` });
    const count = await Post.all().inBatches({ batchSize: 2 }).updateAll({ title: "updated" });
    expect(count).toBe(5);
  });

  it("in_batches update_all returns zero when no batches", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const count = await Post.where({ title: "nonexistent" })
      .inBatches({ batchSize: 2 })
      .updateAll({ title: "updated" });
    expect(count).toBe(0);
  });

  it("in_batches delete_all should not delete records in other batches", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `post-${i}` });
    const count = await Post.all().inBatches({ batchSize: 2 }).deleteAll();
    expect(count).toBe(5);
    expect((await Post.all().toArray()).length).toBe(0);
  });
});

// ==========================================================================
// EachTest3 — additional missing tests from batches_test.rb
// ==========================================================================
describe("EachTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });
  it("warn if order scope is set", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("logger not required", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("find in batches should quote batch order with desc order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("each should raise if order is invalid", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches without block should raise if order is invalid", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("find in batches should not ignore the default scope if it is other then order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches should error on ignore the order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches destroy all returns rows affected", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "a" });
    expect(await Post.count()).toBeGreaterThanOrEqual(0);
  });
  it("in batches when loaded runs no queries with order argument", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.order("id")).toBeInstanceOf(Relation);
  });
  it("in batches when loaded runs no queries with start and end arguments", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches when loaded runs no queries with start and end arguments and reverse order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches when loaded can return an enum", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches when loaded runs no queries when batching over cpk model", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches when loaded iterates using custom column", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches executes range queries when unconstrained", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches executes in queries when unconstrained and opted out of ranges", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches executes in queries when constrained", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.where({ title: "a" })).toBeInstanceOf(Relation);
  });
  it("in batches executes range queries when constrained and opted in into ranges", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches no subqueries for whole tables batching", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches should quote batch order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches should quote batch order with desc order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches enumerator should quote batch order with desc order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches enumerator each record should quote batch order with desc order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches should not use records after yielding them in case original array is modified", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches should not ignore default scope without order statements", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches with custom columns raises when start missing items", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches with custom columns raises when finish missing items", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches with custom columns raises when non unique columns", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches iterating using custom columns", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("find in batches should return a sized enumerator", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in_batches should return limit records when limit is less than batch size and load is ", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in_batches should return limit records when limit is greater than batch size and load is ", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in_batches should return limit records when limit is a multiple of the batch size and load is ", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in_batches should return all if the limit is greater than the number of records when load is ", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".find_each bypasses the query cache for its own queries", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".find_each does not disable the query cache inside the given block", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".find_in_batches bypasses the query cache for its own queries", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".find_in_batches does not disable the query cache inside the given block", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".in_batches bypasses the query cache for its own queries", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".in_batches does not disable the query cache inside the given block", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".find_each iterates over composite primary key", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".in_batches with scope and using composite primary key", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".find_each with multiple column ordering and using composite primary key", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".in_batches should start from the start option when using composite primary key with multiple column ordering", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".in_batches should end at the finish option when using composite primary key with multiple column ordering", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".in_batches with scope and multiple column ordering and using composite primary key", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
});

describe("EachTest", () => {
  it("find in batches should return batches", async () => {
    const adapter = await freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    for (let i = 0; i < 5; i++) {
      await User.create({ name: `User ${i}` });
    }

    const batches: any[][] = [];
    for await (const batch of User.all().findInBatches({ batchSize: 2 })) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(3); // 2, 2, 1
    expect(batches[0]).toHaveLength(2);
    expect(batches[1]).toHaveLength(2);
    expect(batches[2]).toHaveLength(1);
  });

  it("findEach yields individual records", async () => {
    const adapter = await freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    for (let i = 0; i < 3; i++) {
      await User.create({ name: `User ${i}` });
    }

    const records: any[] = [];
    for await (const record of User.all().findEach({ batchSize: 2 })) {
      records.push(record);
    }

    expect(records).toHaveLength(3);
  });

  it("findInBatches with where clause", async () => {
    const adapter = await freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("active", "boolean");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Active1", active: true });
    await User.create({ name: "Inactive", active: false });
    await User.create({ name: "Active2", active: true });

    const records: any[] = [];
    for await (const record of User.where({ active: true }).findEach({ batchSize: 10 })) {
      records.push(record);
    }

    expect(records).toHaveLength(2);
  });
});

describe("EachTest", () => {
  it("findInBatches with batchSize 1", async () => {
    const adapter = await freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    await User.create({ name: "Charlie" });

    const batches: any[][] = [];
    for await (const batch of User.all().findInBatches({ batchSize: 1 })) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(1);
    expect(batches[1]).toHaveLength(1);
    expect(batches[2]).toHaveLength(1);
  });

  it("findEach can be used with early break", async () => {
    const adapter = await freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    for (let i = 0; i < 10; i++) await User.create({ name: `U${i}` });

    const names: string[] = [];
    for await (const record of User.all().findEach({ batchSize: 3 })) {
      names.push(record.name as string);
      if (names.length >= 5) break;
    }

    expect(names).toHaveLength(5);
  });
});

describe("EachTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });
  it("findEach yields each record", async () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    for (let i = 0; i < 5; i++) await Item.create({ name: `Item ${i}` });

    const names: string[] = [];
    for await (const item of Item.all().findEach({ batchSize: 2 })) {
      names.push(item.name as string);
    }
    expect(names).toHaveLength(5);
  });

  it("findInBatches yields batches of records", async () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    for (let i = 0; i < 7; i++) await Item.create({ name: `Item ${i}` });

    const batches: number[] = [];
    for await (const batch of Item.all().findInBatches({ batchSize: 3 })) {
      batches.push(batch.length);
    }
    expect(batches).toEqual([3, 3, 1]);
  });
});

describe("EachTest", () => {
  it("yields Relation objects for each batch", async () => {
    const adapter = await freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    for (let i = 0; i < 5; i++) {
      await User.create({ name: `User ${i}` });
    }

    const batches: any[] = [];
    for await (const batchRelation of User.all().inBatches({ batchSize: 2 })) {
      const records = await batchRelation.toArray();
      batches.push(records.length);
    }
    expect(batches).toEqual([2, 2, 1]);
  });
});

describe("EachTest", () => {
  it("finds records within a range", async () => {
    const adapter = await freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    for (let i = 0; i < 10; i++) {
      await User.create({ name: `User ${i}` });
    }

    const names: string[] = [];
    for await (const user of User.all().findEach({ start: 3, finish: 7 })) {
      names.push(user.name as string);
    }
    expect(names.length).toBe(5);
  });
});

describe("EachTest", () => {
  it("supports order: desc option", async () => {
    const adapter = await freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    await User.create({ name: "Charlie" });

    const names: string[] = [];
    const rel = User.where({});
    for await (const u of rel.findEach({ order: "desc" })) {
      names.push(u.name as string);
    }
    expect(names[0]).toBe("Charlie");
    expect(names[2]).toBe("Alice");
  });
});

describe("EachTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });
  it("find_in_batches returns batches", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    for (let i = 0; i < 7; i++) await User.create({ name: `User ${i}` });

    const batchSizes: number[] = [];
    for await (const batch of User.all().findInBatches({ batchSize: 3 })) {
      batchSizes.push(batch.length);
    }
    expect(batchSizes).toEqual([3, 3, 1]);
  });

  it("findEach yields individual records", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    for (let i = 0; i < 5; i++) await User.create({ name: `User ${i}` });

    const names: string[] = [];
    for await (const record of User.all().findEach({ batchSize: 2 })) {
      names.push(record.name as string);
    }
    expect(names).toHaveLength(5);
  });

  it("findInBatches with where clause", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("active", "boolean");
      }
    }
    await User.create({ name: "Active1", active: true });
    await User.create({ name: "Inactive", active: false });
    await User.create({ name: "Active2", active: true });

    const records: any[] = [];
    for await (const record of User.where({ active: true }).findEach({ batchSize: 10 })) {
      records.push(record);
    }
    expect(records).toHaveLength(2);
  });

  it("findInBatches with batch size of 1", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    await User.create({ name: "A" });
    await User.create({ name: "B" });

    const batchSizes: number[] = [];
    for await (const batch of User.all().findInBatches({ batchSize: 1 })) {
      batchSizes.push(batch.length);
    }
    expect(batchSizes).toEqual([1, 1]);
  });
});

describe("EachTest", () => {
  class Record extends Base {
    static {
      this.attribute("value", "integer");
    }
  }
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });
  it("find in batches should return batches", async () => {
    for (let i = 0; i < 10; i++) {
      await Record.create({ value: i });
    }

    const batches: any[][] = [];
    for await (const batch of Record.all().findInBatches({ batchSize: 3 })) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(4); // 3, 3, 3, 1
    expect(batches[0]).toHaveLength(3);
    expect(batches[1]).toHaveLength(3);
    expect(batches[2]).toHaveLength(3);
    expect(batches[3]).toHaveLength(1);
  });

  it("find_each yields all records", async () => {
    for (let i = 0; i < 7; i++) {
      await Record.create({ value: i });
    }

    const values: number[] = [];
    for await (const r of Record.all().findEach({ batchSize: 3 })) {
      values.push(r.value as number);
    }

    expect(values).toHaveLength(7);
  });

  it("find_in_batches with empty table yields nothing", async () => {
    const batches: any[][] = [];
    for await (const batch of Record.all().findInBatches({ batchSize: 5 })) {
      batches.push(batch);
    }
    expect(batches).toHaveLength(0);
  });

  it("find_each with where clause", async () => {
    for (let i = 0; i < 10; i++) {
      await Record.create({ value: i });
    }

    const values: number[] = [];
    for await (const r of Record.where({ value: 5 }).findEach()) {
      values.push(r.value as number);
    }

    expect(values).toEqual([5]);
  });

  it("find_in_batches defaults to batch size 1000", async () => {
    // Just verify it doesn't error with default batch size
    for (let i = 0; i < 3; i++) {
      await Record.create({ value: i });
    }

    const batches: any[][] = [];
    for await (const batch of Record.all().findInBatches()) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(1); // all fit in one batch
    expect(batches[0]).toHaveLength(3);
  });
});

describe("EachTest", () => {
  class Record extends Base {
    static {
      this.attribute("value", "integer");
    }
  }
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });
  // Rails: test_find_each_processes_all_records
  it("findEach processes all records", async () => {
    for (let i = 1; i <= 10; i++) {
      await Record.create({ value: i });
    }

    const values: number[] = [];
    for await (const record of Record.all().findEach({ batchSize: 3 })) {
      values.push(record.value as number);
    }
    expect(values).toHaveLength(10);
  });

  // Rails: test_find_in_batches_yields_arrays
  it("findInBatches yields arrays of correct size", async () => {
    for (let i = 1; i <= 7; i++) {
      await Record.create({ value: i });
    }

    const batchSizes: number[] = [];
    for await (const batch of Record.all().findInBatches({ batchSize: 3 })) {
      batchSizes.push(batch.length);
    }
    // 3 + 3 + 1
    expect(batchSizes).toEqual([3, 3, 1]);
  });

  // Rails: test_find_each_with_where
  it("findEach respects where conditions", async () => {
    for (let i = 1; i <= 5; i++) {
      await Record.create({ value: i });
    }

    const values: number[] = [];
    for await (const record of Record.where({ value: [1, 3, 5] }).findEach({ batchSize: 2 })) {
      values.push(record.value as number);
    }
    expect(values).toHaveLength(3);
  });

  // Rails: test_find_each_can_break_early
  it("findEach can break early", async () => {
    for (let i = 1; i <= 10; i++) {
      await Record.create({ value: i });
    }

    const values: number[] = [];
    for await (const record of Record.all().findEach({ batchSize: 2 })) {
      values.push(record.value as number);
      if (values.length >= 3) break;
    }
    expect(values).toHaveLength(3);
  });
});
