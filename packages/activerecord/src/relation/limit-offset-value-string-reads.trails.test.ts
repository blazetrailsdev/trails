/**
 * trails-specific regression guard (no Rails counterpart): `limit!` / `offset!`
 * are bare assignments in Rails (query_methods.rb:1215-1218, :1231-1234), so
 * `limit_value` / `offset_value` hold whatever the caller passed until
 * `build_arel` sanitizes them (:1757-1758). Every OTHER read site therefore
 * sees the raw value, and Ruby raises there:
 *
 *   - `find_nth_with_limit` (finder_methods.rb:609-611) `limit_value - index`
 *     → NoMethodError on `String#-`.
 *   - `#inspect` / `#pretty_print` (relation.rb:1266, :1292)
 *     `[limit_value, 11].compact.min` → ArgumentError from `Array#min`.
 *   - `in_batches` `remaining < batch_limit` → ArgumentError from Comparable.
 *   - `find_some` / `find_some_ordered` (finder_methods.rb:549, :568).
 *
 * These pinned NaN-coercion / silent-cast holes before the read-side
 * declarations were widened to `number | string | null`.
 */
import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";

registerModel(Topic);

describe("string limit_value / offset_value read sites", () => {
  fixtures(["topics"]);

  it("second raises NoMethodError rather than yielding NaN", async () => {
    await expect(Topic.limit("asdfadf").second()).rejects.toThrow(/undefined method `-'/);
  });

  it("inspect raises ArgumentError rather than rendering an empty entry list", async () => {
    const rel = Topic.limit(2);
    await rel;
    // `limit!` guards a loaded relation, so seed the values bag directly —
    // Rails' `inspect` reads `limit_value` on the loaded branch all the same.
    (rel as unknown as { _values: Record<string, unknown> })._values.limit = "asdfadf";
    expect(() => rel.inspect()).toThrow(/comparison of String with 11 failed/);
  });

  it("prettyPrint raises ArgumentError rather than rendering an empty entry list", async () => {
    const rel = Topic.limit("asdfadf");
    await expect(
      rel.prettyPrint({ pp: async () => {} } as unknown as Parameters<typeof rel.prettyPrint>[0]),
    ).rejects.toThrow(/comparison of String with 11 failed/);
  });

  it("inBatches raises ArgumentError rather than comparing falsely", async () => {
    await expect(async () => {
      for await (const _batch of Topic.limit("asdfadf").inBatches()) {
      }
    }).rejects.toThrow(/invalid value for Integer\(\): "asdfadf"/);
  });
});
