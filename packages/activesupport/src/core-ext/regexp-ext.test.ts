import { describe, expect, it } from "vitest";

describe("RegexpExtAccessTests", () => {
  it("multiline", () => {
    const re = /foo/m;
    expect(re.multiline).toBe(true);
    const re2 = /foo/;
    expect(re2.multiline).toBe(false);
  });
});
