/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Topic } from "./test-helpers/models/topic.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";

// Rails `fixtures :topics`. Recreate the canonical topics table empty; each test
// seeds its own rows and the transactional wrapper rolls them back.
useHandlerFixtures({ topics: [Topic, {}] }, { schema: canonicalSchema });

describe("Base static query delegations", () => {
  it("Base.first() returns the first record", async () => {
    await Topic.create({ title: "Alice" });
    await Topic.create({ title: "Bob" });

    const first = await Topic.first();
    expect(first).not.toBeNull();
    expect(first!.title).toBe("Alice");
  });

  it("Base.last() returns the last record", async () => {
    await Topic.create({ title: "Alice" });
    await Topic.create({ title: "Bob" });

    const last = await Topic.last();
    expect(last).not.toBeNull();
    expect(last!.title).toBe("Bob");
  });

  it("Base.take() returns any record", async () => {
    await Topic.create({ title: "Alice" });

    const taken = await Topic.take();
    expect(taken).not.toBeNull();
  });

  it("Base.select() returns a relation with selected columns", async () => {
    await Topic.create({ title: "Alice" });

    const rel = Topic.select("title");
    const results = await rel.toArray();
    expect(results.length).toBe(1);
  });

  it("Base.order() returns an ordered relation", async () => {
    await Topic.create({ title: "Bob" });
    await Topic.create({ title: "Alice" });

    const results = await Topic.order("title");
    expect(results[0].title).toBe("Alice");
  });

  it("Base.limit() limits results", async () => {
    await Topic.create({ title: "Alice" });
    await Topic.create({ title: "Bob" });
    await Topic.create({ title: "Charlie" });

    const results = await Topic.limit(2);
    expect(results.length).toBe(2);
  });

  it("Base.distinct() returns distinct results", async () => {
    await Topic.create({ title: "Alice" });
    await Topic.create({ title: "Bob" });

    const rel = Topic.distinct();
    expect(rel.distinctValue).toBe(true);
  });

  it("reverse_order_value round-trips and survives cloning", () => {
    // `:reverse_order` is in SINGLE_VALUE_METHODS, so query_methods.rb's
    // VALUE_METHODS.each generates a reverse_order_value reader/writer that
    // defaults to nil. Rails' initialize_copy dups @values, so the flag is
    // preserved across every spawn/clone.
    const rel = Topic.all();
    expect(rel.reverseOrderValue).toBeUndefined();

    rel.reverseOrderValue = true;
    expect(rel.reverseOrderValue).toBe(true);

    const cloned = rel.where({ title: "Alice" });
    expect(cloned.reverseOrderValue).toBe(true);
  });

  it("Base.none() returns empty relation", async () => {
    await Topic.create({ title: "Alice" });

    const results = await Topic.none();
    expect(results.length).toBe(0);
  });

  it("Base.sole() returns the sole record", async () => {
    await Topic.create({ title: "Alice" });

    const record = await Topic.sole();
    expect(record.title).toBe("Alice");
  });
});
