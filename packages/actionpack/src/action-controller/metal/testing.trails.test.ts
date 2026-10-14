import { describe, it, expect } from "vitest";
import { ActionController } from "../../namespaces.js";
import { Metal } from "../metal.js";
import "../test-case.js";
import { Functional, recycleBang, Testing } from "./testing.js";

describe("ActionController::Testing", () => {
  it("is seated on ActionController with Functional nested on it", () => {
    expect(ActionController.Testing).toBe(Testing);
    expect(Testing.Functional).toBe(Functional);
    expect(Testing.name).toBe("ActionController::Testing");
    expect(Functional.name).toBe("ActionController::Testing::Functional");
  });

  it("Functional defines the functional-test methods and Testing defines none", () => {
    expect(Functional.instanceMethods(false)).toEqual([
      "clearInstanceVariablesBetweenRequests",
      "recycleBang",
    ]);
    expect(Testing.instanceMethods(false)).toEqual([]);
  });

  it("Metal includes Functional once test_case is loaded", () => {
    expect(Metal.prototype.recycleBang).toBe(recycleBang);
  });
});
