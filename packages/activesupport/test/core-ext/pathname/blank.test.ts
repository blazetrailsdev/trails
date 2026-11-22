import { describe, it, expect } from "vitest";
import { Pathname } from "@blazetrails/ruby-compat";
import { isBlank } from "../../../lib/core-ext/object/blank.js";

describe("PathnameBlankTest", () => {
  it("blank", () => {
    expect(isBlank(new Pathname(""))).toBe(true);
    expect(isBlank(new Pathname("test"))).toBe(false);
    expect(isBlank(new Pathname(" "))).toBe(false);
  });
});
