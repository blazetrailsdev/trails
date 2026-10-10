import { rbConstGet, rbModName } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Base } from "./index.js";
import { ActiveRecord } from "./namespaces.js";
import {
  AbsenceValidator,
  AssociatedValidator,
  LengthValidator,
  NumericalityValidator,
  PresenceValidator,
  UniquenessValidator,
  Validations,
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
      ].map((validatorClass) => rbConstGet(Base, validatorClass.name)),
    ).toEqual([
      AbsenceValidator,
      AssociatedValidator,
      LengthValidator,
      NumericalityValidator,
      PresenceValidator,
      UniquenessValidator,
    ]);
  });

  it("seats the validators on ActiveRecord::Validations, not on Base", () => {
    expect(Object.keys(Base).filter((key) => key.endsWith("Validator"))).toEqual([]);
    expect(rbConstGet(ActiveRecord, "Validations")).toBe(Validations);
    expect(rbConstGet(Validations, "PresenceValidator")).toBe(PresenceValidator);
    expect(rbModName(UniquenessValidator)).toBe("ActiveRecord::Validations::UniquenessValidator");
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
