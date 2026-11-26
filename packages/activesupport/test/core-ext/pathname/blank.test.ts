import { describe, it, expect } from "vitest";
import { Pathname } from "@blazetrails/ruby-compat/pathname";
import { isBlank } from "../../../lib/core-ext/object/blank.js";

describe("PathnameBlankTest", () => {
  it("blank", () => {
    expect(isBlank(new Pathname(""))).toBeTruthy();
    expect(isBlank(new Pathname("test"))).toBeFalsy();
    expect(isBlank(new Pathname(" "))).toBeFalsy();
  });
});
