import { describe, expect, it } from "vitest";
import { Inflector } from "./inflector.js";

describe("Inflector", () => {
  it("reads a basename named after an Object.prototype member as unmapped", () => {
    expect(new Inflector().camelize("constructor", null)).toBe("Constructor");
  });
});
