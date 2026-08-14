import { describe, it, expect } from "vitest";
import { Uncountables } from "./inflector/inflections.js";

// Covers `Inflections::Uncountables` (activesupport/lib/active_support/
// inflector/inflections.rb:35-63) directly: the downcasing lives in `add`, and
// `uncountable?` matches on `/\b<word>\Z/i` rather than on set membership.
describe("Uncountables (trails)", () => {
  it("downcases in add, not at the call site", () => {
    const uncountables = new Uncountables().add(["Equipment", ["Rice", "MONEY"]]);
    expect([...uncountables]).toEqual(["equipment", "rice", "money"]);
  });

  it("matches on a word boundary, so a trailing occurrence counts", () => {
    const uncountables = new Uncountables().add(["ors"]);
    expect(uncountables.isUncountable("ors")).toBe(true);
    expect(uncountables.isUncountable("the ors")).toBe(true);
    expect(uncountables.isUncountable("sponsors")).toBe(false);
  });

  it("matches case-insensitively without the caller downcasing", () => {
    const uncountables = new Uncountables().add(["fish"]);
    expect(uncountables.isUncountable("FISH")).toBe(true);
  });

  it("delete takes the entry as given and drops its regex too", () => {
    const uncountables = new Uncountables().add(["fish", "fish"]);
    uncountables.delete("fish");
    expect([...uncountables]).toEqual([]);
    expect(uncountables.isUncountable("fish")).toBe(false);
  });

  it("delete is case-sensitive, as Array#delete is", () => {
    const uncountables = new Uncountables().add(["fish"]);
    uncountables.delete("Fish");
    expect([...uncountables]).toEqual(["fish"]);
  });
});
