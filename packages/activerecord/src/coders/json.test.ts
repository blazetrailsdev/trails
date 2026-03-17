import { describe, it, expect } from "vitest";

describe("JSONTest", () => {
  function jsonLoad(value: string | null | undefined): unknown {
    if (value == null || value === "") return null;
    return JSON.parse(value);
  }

  it("returns nil if empty string given", () => {
    expect(jsonLoad("")).toBeNull();
  });

  it("returns nil if nil given", () => {
    expect(jsonLoad(null)).toBeNull();
  });
});
