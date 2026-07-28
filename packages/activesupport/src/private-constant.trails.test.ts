import { describe, it, expect, beforeEach } from "vitest";
import {
  constantize,
  safeConstantize,
  privateConstant,
  registerConstant,
  unregisterConstant,
  _resetConstants,
} from "./inflector.js";
import { NameError } from "./core-ext/name-error.js";

describe("PrivateConstantTest", () => {
  beforeEach(() => {
    _resetConstants();
  });

  it("constantize raises on a private constant", () => {
    class Treaties {}
    registerConstant("Country::HABTM_Treaties", Treaties);
    expect(constantize("Country::HABTM_Treaties")).toBe(Treaties);

    privateConstant("Country::HABTM_Treaties");
    expect(() => constantize("Country::HABTM_Treaties")).toThrow(
      "private constant Country::HABTM_Treaties referenced",
    );
    // Ruby raises NameError for a private constant, with `name` set to the
    // constant itself — which is what makes safe_constantize swallow it rather
    // than propagate (see the next test).
    expect(() => constantize("Country::HABTM_Treaties")).toThrow(NameError);
  });

  it("safe constantize returns undefined for a private constant", () => {
    class Treaties {}
    registerConstant("Country::HABTM_Treaties", Treaties);
    privateConstant("Country::HABTM_Treaties");

    expect(safeConstantize("Country::HABTM_Treaties")).toBeUndefined();
  });

  it("privacy is independent of registration order", () => {
    privateConstant("Country::HABTM_Treaties");
    registerConstant("Country::HABTM_Treaties", class Treaties {});

    expect(() => constantize("Country::HABTM_Treaties")).toThrow(
      "private constant Country::HABTM_Treaties referenced",
    );
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
    expect(() => constantize("Country::HABTM_Treaties")).toThrow(
      "private constant Country::HABTM_Treaties referenced",
    );
  });

  it("sibling constants stay public", () => {
    class Country {}
    registerConstant("Country", Country);
    privateConstant("Country::HABTM_Treaties");

    expect(constantize("Country")).toBe(Country);
  });
});
