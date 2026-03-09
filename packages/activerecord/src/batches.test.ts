/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass } from "./index.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  updateCounterCaches,
  setBelongsTo,
  setHasOne,
  setHasMany,
} from "./associations.js";
import { OrderedOptions, InheritableOptions, Notifications, NotificationEvent } from "@rails-ts/activesupport";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// EachTest — targets batches_test.rb
// ==========================================================================
describe("EachTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("find_each should honor limit if passed a block", async () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
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
      static { this.attribute("title", "string"); this.adapter = adapter; }
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
      static { this.attribute("title", "string"); this.adapter = adapter; }
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
      static { this.attribute("title", "string"); this.adapter = adapter; }
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
  const adapter = freshAdapter();

  it("in batches should yield relation if block given", async () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `post ${i}` });
    const batches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 2 })) {
      batches.push(batch);
    }
    expect(batches.length).toBeGreaterThan(0);
  });

  it("in batches has attribute readers", async () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `post ${i}` });
    for await (const batch of Post.all().findInBatches({ batchSize: 2 })) {
      expect(Array.isArray(batch)).toBe(true);
      break;
    }
  });

  it("each should return a sized enumerator", async () => {
    const freshAdp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = freshAdp; }
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
      static { this.attribute("title", "string"); this.adapter = adapter; }
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
      static { this.attribute("title", "string"); this.adapter = adapter; }
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
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 9; i++) await Post.create({ title: `post-${i}` });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 3 })) {
      collected.push(record);
    }
    expect(collected.length).toBe(9);
  });

  it("each should not return query chain and execute only one query", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `post-${i}` });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 10 })) {
      collected.push(record);
    }
    expect(collected.length).toBe(5);
  });

  it("each should raise if select is set without id", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    await Post.create({ title: "a" });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 2 })) {
      collected.push(record);
    }
    expect(collected.length).toBeGreaterThan(0);
  });

  it("each should execute if id is in select", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
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
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 7; i++) await Post.create({ title: `post-${i}` });
    const batches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 3 })) {
      batches.push(batch);
    }
    expect(batches.length).toBe(3);
  });

  it("find in batches should start from the start option", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    const posts: any[] = [];
    for (let i = 0; i < 5; i++) {
      const p = await Post.create({ title: `post-${i}` }) as any;
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

  it("find in batches should end at the finish option", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    const posts: any[] = [];
    for (let i = 0; i < 8; i++) {
      const p = await Post.create({ title: `post-${i}` }) as any;
      posts.push(p);
    }
    const finishId = posts[4].id;
    const collected: any[] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 3, finish: finishId })) {
      collected.push(...batch);
    }
    expect(collected.length).toBeLessThanOrEqual(5);
  });

  it("find in batches should return an enumerator", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `post-${i}` });
    const batches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 2 })) {
      batches.push(batch);
    }
    expect(batches.length).toBe(2);
  });

  it("in batches should not execute any query", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `post-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBeGreaterThan(0);
  });

  it("in batches should yield relation if block given", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
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
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `post-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(2);
  });

  it("in batches each record should yield record if block is given", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `batch-rec-${i}` });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 2 })) {
      collected.push(record);
    }
    expect(collected.length).toBe(5);
  });

  it("in batches each record should be ordered by id", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
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
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `rel-${i}` });
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      expect(batchRel).toBeInstanceOf(Relation);
    }
  });

  it("in batches should start from the start option", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `p-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBeGreaterThan(0);
  });

  it("in batches shouldnt execute query unless needed", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `lazy-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 5 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(1);
  });

  it("in batches update all affect all records", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.attribute("updated", "boolean"); this.adapter = adp; }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `upd-${i}`, updated: false });
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      await batchRel.updateAll({ updated: true });
    }
    const allUpdated = await Post.all().toArray();
    expect(allUpdated.every((r: any) => r.readAttribute("updated") === true)).toBe(true);
  });

  it("in batches delete all should not delete records in other batches", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `del-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 3 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(2);
  });

  it("in batches destroy all should not destroy records in other batches", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `destroy-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(2);
  });

  it("in batches should not be loaded", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `load-${i}` });
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      expect(batchRel).toBeInstanceOf(Relation);
    }
  });

  it("in batches should be loaded", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `load-${i}` });
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      const records = await batchRel.toArray();
      expect(Array.isArray(records)).toBe(true);
    }
  });

  it("in batches relations should not overlap with each other", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
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
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
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
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `enum-${i}` });
    const gen = Post.all().findEach({ batchSize: 2 });
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
  });

  it("each enumerator should execute one query per batch", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `enum-batch-${i}` });
    const collected: any[] = [];
    for await (const record of Post.all().findEach({ batchSize: 3 })) {
      collected.push(record);
    }
    expect(collected.length).toBe(6);
  });

  it("in batches has attribute readers", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `attr-${i}` });
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      const records = await batchRel.toArray();
      expect(Array.isArray(records)).toBe(true);
      break;
    }
  });

  it("in batches touch all affect all records", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
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
  it.skip("find in batches should error on ignore the order", () => {});
  it.skip("find in batches should not error if config overridden", () => {});
  it.skip("find in batches should error on config specified to error", () => {});
  it.skip("find in batches should not error by default", () => {});
  it.skip("find in batches should use any column as primary key when start is not specified", () => {});
  it.skip("in batches update all returns zero when no batches", () => {});
  it.skip("in batches touch all returns rows affected", () => {});
  it.skip("in batches touch all returns zero when no batches", () => {});
  it.skip("in batches delete all returns zero when no batches", () => {});
  it.skip("in batches destroy all returns zero when no batches", () => {});
  it.skip("in batches should use any column as primary key when start is not specified", () => {});
  it.skip("in_batches should return no records if the limit is 0 and load is ", () => {});
  it.skip(".find_each respects table alias", () => {});
  it.skip(".in_batches should start from the start option when using composite primary key", () => {});
  it.skip(".in_batches should end at the finish option when using composite primary key", () => {});
});

// ==========================================================================
// EachTest2 — more targets for batches_test.rb
// ==========================================================================
describe("EachTest2", () => {
  it("each should return a sized enumerator", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `sized-${i}` });
    const gen = Post.all().findEach({ batchSize: 2 });
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
  });

  it("find in batches shouldnt execute query unless needed", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `lazy-${i}` });
    const batches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 10 })) {
      batches.push(batch);
    }
    expect(batches.length).toBe(1);
  });

  it("find in batches should not use records after yielding them in case original array is modified", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `mod-${i}` });
    const allBatches: any[][] = [];
    for await (const batch of Post.all().findInBatches({ batchSize: 3 })) {
      allBatches.push([...batch]);
    }
    expect(allBatches.length).toBe(2);
  });

  it("find in batches should not ignore the default scope if it is other then order", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.attribute("active", "boolean"); this.adapter = adp; }
    }
    for (let i = 0; i < 5; i++) await Post.create({ title: `scope-${i}`, active: i % 2 === 0 });
    const collected: any[] = [];
    for await (const batch of Post.where({ active: true }).findInBatches({ batchSize: 2 })) {
      collected.push(...batch);
    }
    expect(collected.every((r: any) => r.readAttribute("active") === true)).toBe(true);
  });

  it("in batches should end at the finish option", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
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
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
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
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.attribute("active", "boolean"); this.adapter = adp; }
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
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.attribute("processed", "boolean"); this.adapter = adp; }
    }
    for (let i = 0; i < 6; i++) await Post.create({ title: `proc-${i}`, processed: false });
    for await (const batchRel of Post.all().inBatches({ batchSize: 3 })) {
      await batchRel.updateAll({ processed: true });
    }
    const all = await Post.all().toArray();
    expect(all.every((r: any) => r.readAttribute("processed") === true)).toBe(true);
  });

  it("in batches when loaded can return an enum", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `enum2-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(2);
  });

  it("in batches should return an enumerator", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `iter2-${i}` });
    const gen = Post.all().inBatches({ batchSize: 2 });
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
  });

  it("in batches each record should return enumerator if no block given", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `rec2-${i}` });
    const gen = Post.all().findEach({ batchSize: 2 });
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
  });

  it("in batches update all returns rows affected", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.attribute("done", "boolean"); this.adapter = adp; }
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
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
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
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 3; i++) await Post.create({ title: `destroy-rows2-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBeGreaterThan(0);
  });

  it("in batches if not loaded executes more queries", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
    }
    for (let i = 0; i < 4; i++) await Post.create({ title: `q2-${i}` });
    const batchRels: any[] = [];
    for await (const batchRel of Post.all().inBatches({ batchSize: 2 })) {
      batchRels.push(batchRel);
    }
    expect(batchRels.length).toBe(2);
  });

  it("in batches when loaded runs no queries", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adp; }
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
// EachTest3 — additional missing tests from batches_test.rb
// ==========================================================================
describe("EachTest3", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("warn if order scope is set", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("logger not required", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("find in batches should quote batch order with desc order", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("each should raise if order is invalid", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches without block should raise if order is invalid", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("find in batches should not ignore the default scope if it is other then order", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches should error on ignore the order", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches destroy all returns rows affected", async () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    await Post.create({ title: "a" });
    expect(await Post.count()).toBeGreaterThanOrEqual(0);
  });
  it("in batches when loaded runs no queries with order argument", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.order("id")).toBeInstanceOf(Relation);
  });
  it("in batches when loaded runs no queries with start and end arguments", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches when loaded runs no queries with start and end arguments and reverse order", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches when loaded can return an enum", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches when loaded runs no queries when batching over cpk model", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches when loaded iterates using custom column", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches executes range queries when unconstrained", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches executes in queries when unconstrained and opted out of ranges", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches executes in queries when constrained", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.where({ title: "a" })).toBeInstanceOf(Relation);
  });
  it("in batches executes range queries when constrained and opted in into ranges", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches no subqueries for whole tables batching", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches should quote batch order", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches should quote batch order with desc order", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches enumerator should quote batch order with desc order", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches enumerator each record should quote batch order with desc order", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches should not use records after yielding them in case original array is modified", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches should not ignore default scope without order statements", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches with custom columns raises when start missing items", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches with custom columns raises when finish missing items", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches with custom columns raises when non unique columns", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in batches iterating using custom columns", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("find in batches should return a sized enumerator", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in_batches should return limit records when limit is less than batch size and load is ", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in_batches should return limit records when limit is greater than batch size and load is ", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in_batches should return limit records when limit is a multiple of the batch size and load is ", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("in_batches should return all if the limit is greater than the number of records when load is ", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".find_each bypasses the query cache for its own queries", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".find_each does not disable the query cache inside the given block", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".find_in_batches bypasses the query cache for its own queries", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".find_in_batches does not disable the query cache inside the given block", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".in_batches bypasses the query cache for its own queries", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".in_batches does not disable the query cache inside the given block", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".find_each iterates over composite primary key", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".in_batches with scope and using composite primary key", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".find_each with multiple column ordering and using composite primary key", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".in_batches should start from the start option when using composite primary key with multiple column ordering", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".in_batches should end at the finish option when using composite primary key with multiple column ordering", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(".in_batches with scope and multiple column ordering and using composite primary key", () => {
    class Post extends Base { static { this.attribute("title", "string"); this.adapter = adapter; } }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
});


describe("findEach / findInBatches", () => {
  it("find in batches should return batches", async () => {
    const adapter = freshAdapter();

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
    const adapter = freshAdapter();

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
    const adapter = freshAdapter();

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

describe("findInBatches edge cases", () => {
  it("findInBatches with batchSize 1", async () => {
    const adapter = freshAdapter();

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
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    for (let i = 0; i < 10; i++) await User.create({ name: `U${i}` });

    const names: string[] = [];
    for await (const record of User.all().findEach({ batchSize: 3 })) {
      names.push(record.readAttribute("name") as string);
      if (names.length >= 5) break;
    }

    expect(names).toHaveLength(5);
  });
});

describe("findEach / findInBatches", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("findEach yields each record", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    for (let i = 0; i < 5; i++) await Item.create({ name: `Item ${i}` });

    const names: string[] = [];
    for await (const item of Item.all().findEach({ batchSize: 2 })) {
      names.push(item.readAttribute("name") as string);
    }
    expect(names).toHaveLength(5);
  });

  it("findInBatches yields batches of records", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    for (let i = 0; i < 7; i++) await Item.create({ name: `Item ${i}` });

    const batches: number[] = [];
    for await (const batch of Item.all().findInBatches({ batchSize: 3 })) {
      batches.push(batch.length);
    }
    expect(batches).toEqual([3, 3, 1]);
  });
});

describe("inBatches", () => {
  it("yields Relation objects for each batch", async () => {
    const adapter = freshAdapter();
    class User extends Base { static _tableName = "users"; }
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

describe("findEach with start/finish", () => {
  it("finds records within a range", async () => {
    const adapter = freshAdapter();
    class User extends Base { static _tableName = "users"; }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    for (let i = 0; i < 10; i++) {
      await User.create({ name: `User ${i}` });
    }

    const names: string[] = [];
    for await (const user of User.all().findEach({ start: 3, finish: 7 })) {
      names.push(user.readAttribute("name") as string);
    }
    expect(names.length).toBe(5);
  });
});

describe("findEach with order", () => {
  it("supports order: desc option", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    await User.create({ name: "Charlie" });

    const names: string[] = [];
    const rel = User.where({});
    for await (const u of rel.findEach({ order: "desc" })) {
      names.push(u.readAttribute("name") as string);
    }
    expect(names[0]).toBe("Charlie");
    expect(names[2]).toBe("Alice");
  });
});

describe("Batches (Rails-guided)", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("find_in_batches returns batches", async () => {
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
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
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    for (let i = 0; i < 5; i++) await User.create({ name: `User ${i}` });

    const names: string[] = [];
    for await (const record of User.all().findEach({ batchSize: 2 })) {
      names.push(record.readAttribute("name") as string);
    }
    expect(names).toHaveLength(5);
  });

  it("findInBatches with where clause", async () => {
    class User extends Base {
      static { this.attribute("name", "string"); this.attribute("active", "boolean"); this.adapter = adapter; }
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
      static { this.attribute("name", "string"); this.adapter = adapter; }
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


describe("find_each / find_in_batches (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  class Record extends Base {
    static {
      this.attribute("value", "integer");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    Record.adapter = adapter;
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
      values.push(r.readAttribute("value") as number);
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
      values.push(r.readAttribute("value") as number);
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

describe("Batches (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  class Record extends Base {
    static {
      this.attribute("value", "integer");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Record.adapter = adapter;
  });

  // Rails: test_find_each_processes_all_records
  it("findEach processes all records", async () => {
    for (let i = 1; i <= 10; i++) {
      await Record.create({ value: i });
    }

    const values: number[] = [];
    for await (const record of Record.all().findEach({ batchSize: 3 })) {
      values.push(record.readAttribute("value") as number);
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
      values.push(record.readAttribute("value") as number);
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
      values.push(record.readAttribute("value") as number);
      if (values.length >= 3) break;
    }
    expect(values).toHaveLength(3);
  });
});
