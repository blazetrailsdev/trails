/**
 * Model-level bigint round-trip tests (all adapters).
 *
 * Tests the full AR stack (create, find, update, dirty tracking,
 * JSON.stringify, where) with big_integer attributes. Runs on SQLite3
 * by default (no DB); runs on PG/MySQL when *_TEST_URL env vars are set.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

const BIG = 2n ** 62n; // 4611686018427387904 — above Number.MAX_SAFE_INTEGER

describe("bigint model round-trip (all adapters)", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
  });

  function makeModel() {
    class Metric extends Base {
      static {
        this.attribute("score", "big_integer");
        this.attribute("label", "string");
        this.adapter = adapter;
      }
    }
    return Metric;
  }

  it("create and find preserves bigint value", async () => {
    const Metric = makeModel();
    const m = await Metric.create({ score: BIG, label: "a" });
    const found = await Metric.find(m.id);
    expect(found.score).toBe(BIG);
    expect(typeof found.score).toBe("bigint");
  });

  it("update preserves bigint value", async () => {
    const Metric = makeModel();
    const m = await Metric.create({ score: BIG, label: "a" });
    await m.update({ score: BIG + 1n });
    const found = await Metric.find(m.id);
    expect(found.score).toBe(BIG + 1n);
  });

  it("dirty tracking: no change when assigning same bigint", async () => {
    const Metric = makeModel();
    const m = await Metric.create({ score: BIG, label: "a" });
    const found = await Metric.find(m.id);
    found.score = BIG;
    expect(found.changed).toBe(false);
  });

  it("dirty tracking: change detected on different bigint", async () => {
    const Metric = makeModel();
    const m = await Metric.create({ score: BIG, label: "a" });
    const found = await Metric.find(m.id);
    found.score = BIG + 1n;
    expect(found.changed).toBe(true);
    expect(found.changes.score).toEqual([BIG, BIG + 1n]);
  });

  it("JSON.stringify emits decimal string for bigint attribute", async () => {
    const Metric = makeModel();
    const m = await Metric.create({ score: BIG, label: "a" });
    const found = await Metric.find(m.id);
    expect(() => JSON.stringify(found)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(found));
    expect(typeof parsed.score).toBe("string");
    expect(parsed.score).toBe(BIG.toString());
  });

  it("where with bigint value finds the record", async () => {
    const Metric = makeModel();
    await Metric.create({ score: BIG, label: "target" });
    await Metric.create({ score: BIG + 1n, label: "other" });
    const results = await Metric.where({ score: BIG }).toArray();
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe("target");
  });

  it("queryAttribute returns false for 0n, true for non-zero bigint", async () => {
    // Mirrors Rails query_attribute which uses value.zero? for numeric types.
    // Mirrors activerecord/lib/active_record/attribute_methods/query.rb
    const Metric = makeModel();
    const zero = await Metric.create({ score: 0n, label: "zero" });
    const nonzero = await Metric.create({ score: BIG, label: "nonzero" });
    const foundZero = await Metric.find(zero.id);
    const foundNonzero = await Metric.find(nonzero.id);
    expect(foundZero.queryAttribute("score")).toBe(false);
    expect(foundNonzero.queryAttribute("score")).toBe(true);
  });
});
