import { describe, expect, it } from "vitest";
import { stringSplit } from "./split.js";

describe("stringSplit", () => {
  it("splits on whitespace in awk mode", () => {
    expect(stringSplit(" a  b c ")).toEqual(["a", "b", "c"]);
  });

  it("does not count captures toward a positive limit", () => {
    expect(stringSplit("a1b2c", /([0-9])/, 3)).toEqual(["a", "1", "b", "2", "c"]);
  });

  it("drops trailing empty fields only when limit is 0", () => {
    expect(stringSplit("a,b,,", ",")).toEqual(["a", "b"]);
    expect(stringSplit("a,b,,", ",", -1)).toEqual(["a", "b", "", ""]);
  });
});
