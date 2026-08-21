/**
 * Trails-only coverage for `composed_of` arms Rails' aggregations_test.rb does
 * not exercise directly.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { registerConstant, unregisterConstant } from "@blazetrails/activesupport";

import { Base } from "./index.js";
import { composedOf } from "./aggregations.js";
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

  // `class_name = options[:class_name] || name.camelize`, resolved by
  // `class_name.constantize` inside the generated reader
  // (aggregations.rb:232, 249-253) — so a value object registered as a
  // constant needs no `className` option at all.
  it("infers the value-object class name from the aggregation name", () => {
    class GpsLocation {
      constructor(public gpsLocation: string | null) {}
    }
    registerConstant("GpsLocation", GpsLocation);
    try {
      class Customer extends Base {
        static {
          this.attribute("gpsLocation", "string");
          composedOf(this, "gpsLocation", { mapping: ["gpsLocation", "gpsLocation"] });
        }
      }
      const customer = new Customer();
      customer.writeAttribute("gpsLocation", "39x-110");

      expect((customer as unknown as { gpsLocation: GpsLocation }).gpsLocation).toBeInstanceOf(
        GpsLocation,
      );
      expect((customer as unknown as { gpsLocation: GpsLocation }).gpsLocation.gpsLocation).toBe(
        "39x-110",
      );
    } finally {
      unregisterConstant("GpsLocation", GpsLocation);
    }
  });
});
