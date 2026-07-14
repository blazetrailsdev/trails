import { describe, it, expect } from "vitest";
import { Company, Firm } from "../test-helpers/models/company.js";

// trails-specific regression guard (no Rails counterpart): Base.predicateBuilder
// is now TableMetadata-backed, and that metadata is bound to the class. The memo
// must be an OWN property so an STI subclass (same table_name) does not inherit
// the parent's builder via the prototype chain — that would resolve
// associations/aggregates against the parent klass. Rails avoids this
// structurally by resetting @predicate_builder in `inherited` (core.rb:422-425).
describe("Base.predicateBuilder STI memoization", () => {
  it("does not leak the parent's builder to an STI subclass", () => {
    // Warm the parent first: with a prototype-chain memo, this instance would
    // then be returned for the subclass too.
    const companyPb = Company.predicateBuilder;
    const firmPb = Firm.predicateBuilder;
    expect(firmPb).not.toBe(companyPb);
    // Idempotent per class.
    expect(Company.predicateBuilder).toBe(companyPb);
    expect(Firm.predicateBuilder).toBe(firmPb);
  });
});
