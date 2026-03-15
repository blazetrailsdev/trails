import { describe, expect, it } from "vitest";

describe("AnonymousTest", () => {
  it("an anonymous class or module are anonymous", () => {
    // Anonymous functions/classes in JS have no name or empty name
    const anon = class {};
    expect(anon.name).toBe("anon");
    const fn = function () {};
    expect(fn.name).toBe("fn");
    // Arrow functions have their variable name
    const arrow = () => {};
    expect(arrow.name).toBe("arrow");
  });

  it("a named class or module are not anonymous", () => {
    class Named {}
    expect(Named.name).toBe("Named");
    function NamedFn() {}
    expect(NamedFn.name).toBe("NamedFn");
  });
});
