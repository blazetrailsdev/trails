import { describe, expect, it } from "vitest";
import { Object as ObjectExt } from "./acts-like.js";

describe("ObjectTests", () => {
  it("duck typing", () => {
    const datelike = { actsLikeDate: () => true };
    expect(ObjectExt.actsLike(datelike, "date")).toBe(true);
    expect(ObjectExt.actsLike({}, "date")).toBe(false);
    expect(ObjectExt.actsLike({ actsLikeTime: () => true }, "time")).toBe(true);
    // The `else` arm: any duck name, not just the three cased ones.
    expect(ObjectExt.actsLike({ actsLikeStringish: () => true }, "stringish")).toBe(true);
  });

  it("acts like string", () => {
    const strlike = { actsLikeString: () => true };
    expect(ObjectExt.actsLike(strlike, "string")).toBe(true);
    expect(ObjectExt.actsLike("a real string", "string")).toBe(false);
  });
});
