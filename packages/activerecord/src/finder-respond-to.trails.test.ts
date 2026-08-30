import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { Customer } from "./test-helpers/models/customer.js";
import { fixtures } from "./test-fixtures.js";

describe("FinderRespondToTrailsTest", () => {
  fixtures(["customers"]);

  it("responds to find by an aggregation", () => {
    expect(Customer.respondToMissing("findByAddress")).toBe(true);
    expect(Customer.respondToMissing("findByNotAnAggregation")).toBe(false);
  });

  it("never matches a finder on Base itself", () => {
    expect(Base.respondToMissing("findByAddress")).toBe(false);
  });
});
