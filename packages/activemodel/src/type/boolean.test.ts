import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("BooleanTest", () => {
  it("type cast boolean", () => {
    const type = new Types.BooleanType();
    expect(type.cast(true)).toBe(true);
    expect(type.cast(false)).toBe(false);
    expect(type.cast("true")).toBe(true);
    expect(type.cast("false")).toBe(false);
    expect(type.cast("1")).toBe(true);
    expect(type.cast("0")).toBe(false);
    expect(type.cast(1)).toBe(true);
    expect(type.cast(0)).toBe(false);
    expect(type.cast("yes")).toBe(true);
    expect(type.cast("no")).toBe(false);
    expect(type.cast(null)).toBe(null);
  });
});
