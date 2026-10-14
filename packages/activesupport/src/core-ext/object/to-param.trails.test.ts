import { describe, expect, it } from "vitest";
import { toParam, toQuery } from "../../index.js";

describe("toParam on a colon-spelled Symbol", () => {
  it("renders the Symbol's name, as Symbol#to_param is to_s", () => {
    expect(toParam(":b")).toBe("b");
    expect(toParam([":a", "b"])).toBe("a/b");
    expect(toQuery({ ":k": ":v" })).toBe("k=v");
  });
});
