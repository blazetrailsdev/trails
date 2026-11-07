import { describe, it, expect } from "vitest";
import { publicInstanceMethods, rbModName } from "@blazetrails/ruby-compat";
import { ActionController } from "../../../lib/namespaces.js";
import { Metal } from "../../../lib/action-controller/metal.js";
import "../../../lib/action-controller/test-case.js";
import { Functional, recycleBang, Testing } from "../../../lib/action-controller/metal/testing.js";

describe("ActionController::Testing", () => {
  it("is seated on ActionController with Functional nested on it", () => {
    expect(ActionController.Testing).toBe(Testing);
    expect(Testing.Functional).toBe(Functional);
    expect(rbModName(Testing)).toBe("ActionController::Testing");
    expect(rbModName(Functional)).toBe("ActionController::Testing::Functional");
  });

  it("Functional defines the functional-test methods and Testing defines none", () => {
    expect(publicInstanceMethods(Functional, false)).toEqual([
      "clearInstanceVariablesBetweenRequests",
      "recycleBang",
    ]);
    expect(publicInstanceMethods(Testing, false)).toEqual([]);
  });

  it("Metal includes Functional once test_case is loaded", () => {
    expect(Metal.prototype.recycleBang).toBe(recycleBang);
  });
});
