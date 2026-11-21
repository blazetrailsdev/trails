import { describe, expect, it } from "vitest";
import { rbClassAttachedObject, rbModSingletonP, rbSingletonClass } from "../lib/index.js";

describe("rbSingletonClass (trails-only)", () => {
  it("answers one metaclass per class, flagged singleton and attached to the class", () => {
    class Klass {}
    const metaclass = rbSingletonClass(Klass);
    expect(rbSingletonClass(Klass)).toBe(metaclass);
    expect(rbModSingletonP(metaclass)).toBe(true);
    expect(rbClassAttachedObject(metaclass)).toBe(Klass);
    expect(metaclass.prototype).toBe(Klass);
  });
});
