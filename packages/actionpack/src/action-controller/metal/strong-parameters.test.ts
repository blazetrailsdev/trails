import { describe, it, expect } from "vitest";
import { ParameterMissing } from "./strong-parameters.js";

describe("ParameterMissing#corrections", () => {
  it("suggests a near-match key from the dictionary", () => {
    const err = new ParameterMissing("naem", ["name", "email", "id"]);
    expect(err.corrections).toEqual(["name"]);
  });

  it("returns [] when no keys are attached", () => {
    expect(new ParameterMissing("name").corrections).toEqual([]);
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
