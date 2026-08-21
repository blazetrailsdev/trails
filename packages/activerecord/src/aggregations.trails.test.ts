/**
 * Trails-only coverage for `composed_of` arms Rails' aggregations_test.rb does
 * not exercise directly.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { fixtures } from "./test-fixtures.js";
import { Customer as CustomerModel, Money as MoneyClass } from "./test-helpers/models/customer.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("AggregationsTest (trails)", () => {
  const { customers } = fixtures(["customers"]);

  // `reader_method`'s guard is `@aggregation_cache[name].nil? && (!allow_nil ||
  // mapping.any? { |key, _| !read_attribute(key).nil? })`
  // (aggregations.rb:249) — with the default `allow_nil: false` the second
  // conjunct is skipped entirely, so the value object is built even when every
  // mapped attribute is nil. `balance` is Customer's `allow_nil: false`
  // aggregation (test/models/customer.rb:8).
  it("builds the value object when allow nil is false and every mapped attribute is nil", () => {
    const david = customers("david") as CustomerModel & {
      balance: InstanceType<typeof MoneyClass> | null;
    };
    david.writeAttribute("balance", null);

    expect(david.balance).toBeInstanceOf(MoneyClass);
    expect(david.balance?.amount).toBeNull();
  });
});
