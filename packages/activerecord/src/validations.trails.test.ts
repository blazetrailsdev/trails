/**
 * trails-only coverage for the constant lookup `validates` performs.
 *
 * Rails has no `ActiveRecord::Validations::ClassMethods#validates` override:
 * `validates :x, presence: true` on an AR model reaches ActiveModel's generic
 * macro, whose `const_get("#{key.to_s.camelize}Validator")`
 * (activemodel/lib/active_model/validations/validates.rb:121) resolves against
 * the model's ancestry — which includes `ActiveRecord::Validations` and so its
 * column/association-aware validators. These assert that the AR constants win.
 */
import { describe, expect, it } from "vitest";
import { Base } from "./index.js";
import {
  AbsenceValidator,
  AssociatedValidator,
  LengthValidator,
  NumericalityValidator,
  PresenceValidator,
  UniquenessValidator,
} from "./validations.js";

describe("ValidatesConstantLookupTest", () => {
  it("resolves the ActiveRecord validator constants", () => {
    expect(
      [
        AbsenceValidator,
        AssociatedValidator,
        LengthValidator,
        NumericalityValidator,
        PresenceValidator,
        UniquenessValidator,
      ].map((validatorClass) => (Base as unknown as Record<string, unknown>)[validatorClass.name]),
    ).toEqual([
      AbsenceValidator,
      AssociatedValidator,
      LengthValidator,
      NumericalityValidator,
      PresenceValidator,
      UniquenessValidator,
    ]);
  });

  it("registers the ActiveRecord validator for a built-in key", () => {
    class Klass extends Base {
      static tableName = "topics";
    }
    Klass.validates("title", { presence: true, uniqueness: true });

    expect(Klass.validators().map((v: { constructor: unknown }) => v.constructor)).toEqual([
      PresenceValidator,
      UniquenessValidator,
    ]);
  });

  it("raises ArgumentError for an unknown validator key", () => {
    class Klass extends Base {
      static tableName = "topics";
    }

    expect(() => Klass.validates("title", { unknown: true })).toThrow(
      "Unknown validator: 'UnknownValidator'",
    );
  });
});
