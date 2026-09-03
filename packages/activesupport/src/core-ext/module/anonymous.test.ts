import { describe, expect, it } from "vitest";

describe("AnonymousTest", () => {
  it("an anonymous class or module are anonymous", () => {
    const anon = class {};
    expect(anon.name).toBe("anon");
    const fn = function () {};
    expect(fn.name).toBe("fn");
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
