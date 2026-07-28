/**
 * Trails-only: Rails `const_set`s the habtm join model and then marks it
 * `private_constant` (`activerecord/lib/active_record/associations.rb:1877-1878`),
 * so `Object.const_get("Country::HABTM_Treaties")` raises NameError while the
 * association itself keeps working — it resolves through the reflection, not
 * through the constant table. Ruby gets that from the language; trails'
 * invented constant table needs the mark applied explicitly, so it needs a test.
 */
import { describe, it, expect } from "vitest";
import { constantize, safeConstantize } from "@blazetrails/activesupport";
import { modelRegistry } from "../associations.js";
import { Country } from "../test-helpers/models/country.js";

describe("HabtmJoinModelPrivateConstantTest", () => {
  it("the habtm join model is a private constant", () => {
    expect(() => constantize("Country::HABTM_Treaties")).toThrow(
      "private constant Country::HABTM_Treaties",
    );
    expect(safeConstantize("Country::HABTM_Treaties")).toBeUndefined();
  });

  it("the habtm join model still resolves through the registry", () => {
    expect(modelRegistry.get("Country::HABTM_Treaties")).toBeDefined();
    expect(Country.reflectOnAssociation("treaties")).toBeDefined();
  });
});
