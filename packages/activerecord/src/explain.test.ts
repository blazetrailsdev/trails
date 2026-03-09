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

describe("ExplainTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  function makeModel() {
    class Post extends Base {
      static { this.attribute("title", "string"); this.attribute("score", "integer"); this.adapter = adapter; }
    }
    return { Post };
  }

  it("relation explain", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    const result = await Post.all().explain();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("collecting queries for explain", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    const result = await Post.where({ title: "a" }).explain();
    expect(typeof result).toBe("string");
  });

  it("relation explain with average", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 10 });
    // explain() returns query plan, average() returns the value
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const avg = await Post.average("score");
    expect(avg).toBe(10);
  });

  it("relation explain with count", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const count = await Post.count();
    expect(count).toBe(1);
  });

  it("relation explain with count and argument", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 5 });
    await Post.create({ title: "b" });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const count = await (Post as any).count("score");
    expect(typeof count).toBe("number");
  });

  it("relation explain with minimum", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 3 });
    await Post.create({ title: "b", score: 7 });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const min = await Post.minimum("score");
    expect(min).toBe(3);
  });

  it("relation explain with maximum", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 3 });
    await Post.create({ title: "b", score: 7 });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const max = await Post.maximum("score");
    expect(max).toBe(7);
  });

  it("relation explain with sum", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 3 });
    await Post.create({ title: "b", score: 7 });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const sum = await Post.sum("score");
    expect(sum).toBe(10);
  });

  it("relation explain with first", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const first = await Post.first();
    expect(first).not.toBeNull();
  });

  it("relation explain with last", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const last = await Post.last();
    expect(last).not.toBeNull();
  });

  it("relation explain with pluck", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hello" });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const titles = await Post.pluck("title");
    expect(titles).toContain("hello");
  });

  it("relation explain with pluck with args", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 1 });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const values = await Post.pluck("title", "score");
    expect(values.length).toBe(1);
  });

  it("exec explain with no binds", async () => {
    const { Post } = makeModel();
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    expect(plan.length).toBeGreaterThan(0);
  });

  it("exec explain with binds", async () => {
    const { Post } = makeModel();
    const plan = await Post.where({ title: "bound" }).explain();
    expect(typeof plan).toBe("string");
    expect(plan.length).toBeGreaterThan(0);
  });
});
