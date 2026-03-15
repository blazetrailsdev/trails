import { describe, expect, it } from "vitest";

describe("ObjectTests", () => {
  it("duck typing", () => {
    // acts_like? - checking if an object behaves like something
    const actsLike = (obj: any, type: string) => typeof obj[`acts_like_${type}?`] === "function";
    const datelike = { "acts_like_date?": () => true };
    expect(actsLike(datelike, "date")).toBe(true);
    expect(actsLike({}, "date")).toBe(false);
  });

  it("acts like string", () => {
    const strlike = { "acts_like_string?": () => true };
    expect(typeof strlike["acts_like_string?"] === "function").toBe(true);
  });
});
