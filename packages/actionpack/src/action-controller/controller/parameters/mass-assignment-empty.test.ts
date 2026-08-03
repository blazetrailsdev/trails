import { describe, it, expect } from "vitest";
import { Model, ForbiddenAttributesError } from "@blazetrails/activemodel";
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
    // empty no-op above), where an unpermitted Parameters raises
    // ForbiddenAttributesError.
    expect(new Parameters({ name: "Bob" }).empty).toBe(false);
    expect(
      () => new Account(new Parameters({ name: "Bob" }) as unknown as Record<string, unknown>),
    ).toThrow(ForbiddenAttributesError);
  });
});

// `sanitize_for_mass_assignment` guards on `respond_to?(:permitted?)`. Real
// Parameters exposes `permitted` as a boolean getter rather than a method, so
// these exercise the ForbiddenAttributesProtection contract against the actual
// class it mirrors — not a duck-typed stand-in whose `permitted` is callable
// (that variant is covered in activemodel's attribute-assignment.test.ts).
describe("ParametersForbiddenAttributesTest", () => {
  it("forbidden attributes cannot be used for mass assignment", () => {
    const params = new Parameters({ name: "Bob" });
    expect(params.permitted).toBe(false);
    expect(() => new Account(params as unknown as Record<string, unknown>)).toThrow(
      ForbiddenAttributesError,
    );
  });

  it("permitted attributes can be used for mass assignment", () => {
    const params = new Parameters({ name: "Bob" }).permitAll();
    expect(params.permitted).toBe(true);
    const record = new Account(params as unknown as Record<string, unknown>);
    expect(record.readAttribute("name")).toBe("Bob");
  });
});
