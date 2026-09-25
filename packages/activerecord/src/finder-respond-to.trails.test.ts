import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Base } from "./index.js";
import { Customer } from "./test-helpers/models/customer.js";
import { fixtures } from "./test-fixtures.js";

describe("FinderRespondToTrailsTest", () => {
  fixtures(["customers"]);

  it("responds to find by an aggregation", () => {
    expect(Customer.respondToMissing("findByAddress")).toBe(true);
    expect(Customer.respondToMissing("findByNonBlankGpsLocation")).toBe(true);
    expect(Customer.respondToMissing("findByNotAnAggregation")).toBe(false);
  });

  it("never matches a finder on Base itself", () => {
    expect(Base.respondToMissing("findByAddress")).toBe(false);
  });

  it("raises ArgumentError when a generated finder gets the wrong argument count", async () => {
    const relation = Customer.all() as unknown as Record<string, (...args: unknown[]) => unknown>;
    expect(() => relation.findByName()).toThrow(
      new ArgumentError("wrong number of arguments (given 0, expected 1)"),
    );
    expect(() => relation.findByName("David", "extra")).toThrow(
      new ArgumentError("wrong number of arguments (given 2, expected 1)"),
    );
  });

  it("matches the bang finder only for a Bang-suffixed name", () => {
    expect(Customer.respondToMissing("findByName")).toBe(true);
    expect(Customer.respondToMissing("findByNameBang")).toBe(true);
    expect(Customer.respondToMissing("findByNameBangBang")).toBe(false);
  });
});
