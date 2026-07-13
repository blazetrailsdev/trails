import { describe, it, expect } from "vitest";
import { Model } from "@blazetrails/activemodel";
import { Parameters } from "../../metal/strong-parameters.js";

// A real ActionController::Parameters stores its data in a private field and
// delegates `empty?` to it — so counting the wrapper's own `Object.keys` reads
// its instance fields, not its parameter count. The mass-assignment empty-bag
// guard must delegate to the wrapper's emptiness (Rails
// `return if new_attributes.empty?`), so an EMPTY wrapper is a construction
// no-op rather than proceeding into sanitize_for_mass_assignment.
class Account extends Model {
  static {
    this.attribute("name", "string");
  }
}

describe("MassAssignmentEmptyParametersTest", () => {
  it("empty Parameters is a no-op at construction", () => {
    const params = new Parameters({});
    let record: Account | undefined;
    expect(() => {
      record = new Account(params as unknown as Record<string, unknown>);
    }).not.toThrow();
    expect(record!.readAttribute("name")).toBeNull();
  });

  it("non-empty Parameters is treated as non-empty (empty? delegation)", () => {
    // The guard must NOT count the wrapper's own instance fields: a non-empty
    // Parameters reports `empty === false`, so the guard proceeds past the
    // empty-bag short-circuit rather than being wrongly skipped.
    const params = new Parameters({ name: "Bob" });
    expect(params.empty).toBe(false);
  });
});
