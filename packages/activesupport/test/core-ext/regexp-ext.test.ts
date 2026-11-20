import { describe, expect, it } from "vitest";
import { isMultiline } from "../../lib/core-ext/regexp.js";

describe("RegexpExtAccessTests", () => {
  it("multiline", () => {
    expect(isMultiline(/(?:)/s)).toEqual(true);
    expect(isMultiline(/(?:)/)).toEqual(false);
    expect(isMultiline(new RegExp("(?s:)"))).toEqual(false);
  });
});
