import { describe, it, expect, beforeEach } from "vitest";
import {
  constantize,
  safeConstantize,
  privateConstant,
  registerConstant,
  unregisterConstant,
  _resetConstants,
} from "./inflector.js";

describe("PrivateConstantTest", () => {
  beforeEach(() => {
    _resetConstants();
  });

  it("constantize resolves a private constant by its scoped name", () => {
    class Treaties {}
    registerConstant("Country::HABTM_Treaties", Treaties);
    privateConstant("Country::HABTM_Treaties");

    expect(constantize("Country::HABTM_Treaties")).toBe(Treaties);
    expect(safeConstantize("Country::HABTM_Treaties")).toBe(Treaties);
  });

  it("unregistering a constant drops its private mark", () => {
    class Treaties {}
    registerConstant("Country::HABTM_Treaties", Treaties);
    privateConstant("Country::HABTM_Treaties");

    unregisterConstant("Country::HABTM_Treaties", Treaties);
    expect(() => constantize("Country::HABTM_Treaties")).toThrow(
      "uninitialized constant Country::HABTM_Treaties",
    );
  });

  it("a rebound constant keeps its private mark", () => {
    class Treaties {}
    registerConstant("Country::HABTM_Treaties", Treaties);
    privateConstant("Country::HABTM_Treaties");

    unregisterConstant("Country::HABTM_Treaties", class Other {});
    expect(constantize("Country::HABTM_Treaties")).toBe(Treaties);
  });

  it("sibling constants stay public", () => {
    class Country {}
    registerConstant("Country", Country);
    privateConstant("Country::HABTM_Treaties");

    expect(constantize("Country")).toBe(Country);
  });
});
