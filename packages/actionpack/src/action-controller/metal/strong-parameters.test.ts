import { describe, it, expect } from "vitest";
import { ParameterMissing } from "./strong-parameters.js";

describe("ParameterMissing#corrections", () => {
  it("suggests a near-match key from the dictionary", () => {
    const err = new ParameterMissing("naem", ["name", "email", "id"]);
    expect(err.corrections).toEqual(["name"]);
  });

  it("raises when no keys are attached, and detailedMessage falls back to super", () => {
    const err = new ParameterMissing("name");
    expect(() => err.corrections).toThrow(TypeError);
    expect(err.detailedMessage({ highlight: false })).toBe(
      "param is missing or the value is empty or invalid: name (ActionController::ParameterMissing)",
    );
  });

  it("returns [] when nothing in the dictionary is close", () => {
    const err = new ParameterMissing("xyz", ["name", "email", "id"]);
    expect(err.corrections).toEqual([]);
  });

  it("memoises across multiple reads", () => {
    const err = new ParameterMissing("naem", ["name"]);
    const first = err.corrections;
    expect(err.corrections).toBe(first);
  });
});
