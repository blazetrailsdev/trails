import { describe, expect, it } from "vitest";
import { Integer } from "./integer/multiple.js";
import { ordinal, ordinalize } from "../inflector.js";

describe("IntegerExtTest", () => {
  const PRIME = 22953686867719691230002707821868552601124472329079n;

  it("multiple of", () => {
    expect([-7, 0, 7, 14].every((i) => Integer.isMultipleOf(i, 7))).toBeTruthy();
    expect([-7, 7, 14].some((i) => Integer.isMultipleOf(i, 6))).toBeFalsy();

    expect(Integer.isMultipleOf(0, 0)).toBeTruthy();
    expect(Integer.isMultipleOf(5, 0)).toBeFalsy();

    expect([2, 3, 5, 7].some((i) => Integer.isMultipleOf(PRIME, i))).toBeFalsy();
  });

  it("ordinalize", () => {
    expect(ordinalize(1)).toBe("1st");
    expect(ordinalize(8)).toBe("8th");
  });

  it("ordinal", () => {
    expect(ordinal(1)).toBe("st");
    expect(ordinal(8)).toBe("th");
  });
});
