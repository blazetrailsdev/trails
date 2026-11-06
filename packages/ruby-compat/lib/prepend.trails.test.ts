import { describe, expect, it } from "vitest";
import { include, prepend, rbCallSuper } from "./include.js";

describe("prepend", () => {
  it("preserves `this` binding to the caller instance", () => {
    class Box {
      _tag = "self";
      identify(): string {
        return this._tag;
      }
    }
    function identify(this: Box): string {
      return `outer:${String(rbCallSuper(this, identify))}`;
    }
    prepend(Box, { identify });
    const b = new Box();
    b._tag = "custom";
    expect(b.identify()).toBe("outer:custom");
  });

  it("lets the module short-circuit without calling super_", () => {
    class Toggle {
      value(): number {
        throw new Error("original should be skipped");
      }
    }
    prepend(Toggle, { value: () => 42 });
    expect(new Toggle().value()).toBe(42);
  });

  it("second prepend on the same method chains on top of the first", () => {
    class Greeter {
      hi(): string {
        return "base";
      }
    }
    function a(this: Greeter): string {
      return `a-${String(rbCallSuper(this, a))}`;
    }
    function b(this: Greeter): string {
      return `b-${String(rbCallSuper(this, b))}`;
    }
    prepend(Greeter, { hi: a });
    prepend(Greeter, { hi: b });
    expect(new Greeter().hi()).toBe("b-a-base");
  });

  it("skips a module that is already prepended", () => {
    class Greeter {
      hi(): string {
        return "base";
      }
    }
    function hiA(this: Greeter): string {
      return `a-${String(rbCallSuper(this, hiA))}`;
    }
    function hiB(this: Greeter): string {
      return `b-${String(rbCallSuper(this, hiB))}`;
    }
    const a = { hi: hiA };
    prepend(Greeter, a);
    prepend(Greeter, { hi: hiB });
    prepend(Greeter, a);
    expect(new Greeter().hi()).toBe("b-a-base");
  });
});

describe("prepend then include", () => {
  it("seats a module included after a prepend beneath the prepended method", () => {
    const calls: string[] = [];
    class Parent {
      run(): void {
        calls.push("parent");
      }
    }
    class Host extends Parent {}
    function prependedRun(this: object): unknown {
      calls.push("prepended");
      return rbCallSuper(this, prependedRun);
    }
    prepend(Host, { run: prependedRun });
    function run(this: object): unknown {
      calls.push("included");
      return rbCallSuper(this, run);
    }
    include(Host, { run });
    new Host().run();
    expect(calls).toEqual(["prepended", "included", "parent"]);
  });
});
