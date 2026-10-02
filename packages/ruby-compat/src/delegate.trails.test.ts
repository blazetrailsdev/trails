import { describe, expect, it } from "vitest";
import { DelegateClass } from "./delegate.js";
import { include, initialize, initializeIncludedModules } from "./include.js";

describe("DelegateClass (trails)", () => {
  it("does not construct the delegated superclass", () => {
    let constructed = 0;
    class Required {
      constructor(arg: string) {
        if (arg === undefined) throw new Error("required");
        constructed++;
      }
    }
    const delegator = new (DelegateClass(Required))(new Required("x"));
    expect(constructed).toBe(1);
    expect(delegator).toBeInstanceOf(Required);
  });

  it("includes a module its delegated superclass already includes", () => {
    let initialized = 0;
    class Greeting {
      static [initialize](): void {
        initialized++;
      }
      greet(): string {
        return "module";
      }
    }
    class Target {}
    include(Target, Greeting);
    class Wrapper extends DelegateClass(Target) {
      constructor(target: Target) {
        super(target);
        initializeIncludedModules(this);
      }
    }
    const before = Object.hasOwn(Wrapper.prototype, "greet");
    include(Wrapper, Greeting);
    expect([before, Object.hasOwn(Wrapper.prototype, "greet")]).toEqual([false, true]);
    new Wrapper(new Target());
    expect(initialized).toBe(1);
  });
});
