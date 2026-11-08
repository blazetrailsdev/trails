import { describe, expect, it } from "vitest";
import { toParam } from "../../index.js";
import { assertNil } from "../../testing/assertions.js";

class CustomString extends String {
  toParam() {
    return `custom-${this}`;
  }
}

describe("ToParamTest", () => {
  it("object", () => {
    const foo = { toString: () => "foo" };
    expect(toParam(foo)).toBe("foo");
  });

  it("nil", () => {
    assertNil(toParam(null));
  });

  it("boolean", () => {
    expect(toParam(true)).toBe(true);
    expect(toParam(false)).toBe(false);
  });

  it("array", () => {
    expect(toParam([])).toBe("");
    let array: unknown[] = [1, 2, 3, 4];
    expect(toParam(array)).toBe("1/2/3/4");
    array = [1, "3", { a: 1, b: 2 }, null, true, false, new CustomString("object")];
    expect(toParam(array)).toBe("1/3/a=1&b=2//true/false/custom-object");
  });
});
