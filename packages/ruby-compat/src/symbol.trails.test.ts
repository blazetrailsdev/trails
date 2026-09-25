import { describe, expect, it } from "vitest";
import { rbMethodName } from "./symbol.js";

describe("rbMethodName", () => {
  it("inverts the predicate, bang, operator and camelCase spellings", () => {
    expect(rbMethodName("isEmpty")).toBe("empty?");
    expect(rbMethodName("saveBang")).toBe("save!");
    expect(rbMethodName("plus")).toBe("+");
    expect(rbMethodName("equals")).toBe("==");
    expect(rbMethodName("toS")).toBe("to_s");
    expect(rbMethodName("fooBar")).toBe("foo_bar");
  });
});
