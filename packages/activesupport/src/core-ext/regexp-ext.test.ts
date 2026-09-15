import { describe, expect, it } from "vitest";

describe("RegexpExtAccessTests", () => {
  it("multiline", () => {
    expect(/(?:)/m.multiline).toEqual(true);
    expect(/(?:)/.multiline).toEqual(false);
    expect(new RegExp("(?:)").multiline).toEqual(false);
  });
});
