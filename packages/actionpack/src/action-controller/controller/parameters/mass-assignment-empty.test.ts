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

  it("non-empty Parameters proceeds past the empty-bag guard at construction", () => {
    // The guard must NOT count the wrapper's own instance fields: a non-empty
    // Parameters reports `empty === false`, so construction proceeds past the
    // empty-bag short-circuit into sanitize_for_mass_assignment (contrast the
    // empty no-op above). We assert only that it does NOT silently no-op — it
    // throws — not the specific error class: an unpermitted Parameters SHOULD
    // raise ForbiddenAttributesError, but real Parameters exposes `permitted`
    // as a boolean getter (not a method), so sanitize currently misreads it as
    // a plain hash and raises on its private fields instead. That
    // permitted-getter divergence is tracked separately in
    // `sanitize-mass-assignment-permitted-getter`; either way the guard is
    // proven to proceed rather than skip.
    expect(new Parameters({ name: "Bob" }).empty).toBe(false);
    expect(
      () => new Account(new Parameters({ name: "Bob" }) as unknown as Record<string, unknown>),
    ).toThrow();
  });
});
