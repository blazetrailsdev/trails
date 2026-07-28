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
