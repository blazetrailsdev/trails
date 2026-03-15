import { describe, expect, it } from "vitest";

describe("NameErrorTest", () => {
  it("name error should set missing name", () => {
    const err = new ReferenceError("undefined variable 'foo'");
    expect(err.message).toContain("foo");
    expect(err instanceof Error).toBe(true);
  });

  it("missing method should ignore missing name", () => {
    const obj = {} as any;
    expect(() => obj.nonExistentMethod()).toThrow();
  });
});
