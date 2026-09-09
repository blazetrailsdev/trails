import { describe, it, expect } from "vitest";
import { Parser } from "../../parser.js";

describe("ActionDispatch::Journey::Parser", () => {
  it("returns null for a string with no terminal token", () => {
    expect(Parser.parse("")).toBeNull();
    expect(Parser.parse(")")).toBeNull();
  });
});
