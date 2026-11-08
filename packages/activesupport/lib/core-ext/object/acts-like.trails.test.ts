import { describe, expect, it } from "vitest";
import { actsLike } from "./acts-like.js";

class Stringish extends String {}

class DuckString {
  actsLikeString() {
    return true;
  }
}

describe("actsLike", () => {
  it("answers per receiver when the duck name was seen before", () => {
    const duck = new DuckString();
    expect(actsLike.call(duck, "string")).toBeTruthy();
    expect(actsLike.call(new Stringish(), "string")).toBeTruthy();
    expect(actsLike.call({}, "string")).toBeFalsy();
    expect(actsLike.call(null, "string")).toBeFalsy();
    expect(actsLike.call(duck, "string")).toBeTruthy();
  });
});
