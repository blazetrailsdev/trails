import { describe, it, expect, beforeEach } from "vitest";
import {
  constantize,
  safeConstantize,
  privateConstant,
  registerConstant,
  _resetConstants,
} from "./inflector.js";

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

  it("sibling constants stay public", () => {
    class Country {}
    registerConstant("Country", Country);
    privateConstant("Country::HABTM_Treaties");

    expect(constantize("Country")).toBe(Country);
  });
});
