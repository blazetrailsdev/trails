import { describe, expect, it } from "vitest";
import { DelegateClass } from "./delegate.js";
import { include, initialize, initializeIncludedModules, rbGetAllocFunc } from "./include.js";

describe("DelegateClass (trails)", () => {
  it("allocates an instance that still forwards a delegate's data properties", () => {
    class Point {
      x = 1;
    }
    const klass = DelegateClass(Point);
    const allocated = rbGetAllocFunc(klass)!(klass as never) as InstanceType<typeof klass>;
    expect(Object.keys(allocated)).toEqual([]);
    allocated.__setobj__(new Point());
    expect(allocated.x).toBe(1);
  });

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

  it("answers toString from the delegate, as Delegator#to_s reaches method_missing", () => {
    class Mask extends DelegateClass(String) {}
    const mask = new Mask("[FILTERED]");
    expect(String(mask)).toBe("[FILTERED]");
    expect(`name: ${mask}`).toBe("name: [FILTERED]");
  });
});
