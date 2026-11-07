import { describe, expect, it } from "vitest";
import { DelegateClass, SimpleDelegator } from "../lib/delegate.js";
import { rbObjRespondTo } from "../lib/object.js";
import { include, rbGetAllocFunc } from "../lib/include.js";

describe("DelegateClass (trails)", () => {
  it("builds a subclass with no constructor of its own from the object to delegate to", () => {
    class Wrapper extends DelegateClass(Array) {}
    const target = [1, 2];
    const wrapper = new Wrapper(target);
    expect(wrapper.__getobj__()).toBe(target);
    expect(wrapper.at(1)).toBe(2);
  });

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
    class Greeting {
      greet(): string {
        return "module";
      }
    }
    class Target {}
    include(Target, Greeting);
    class Wrapper extends DelegateClass(Target) {}
    const before = Object.hasOwn(Wrapper.prototype, "greet");
    include(Wrapper, Greeting);
    expect([before, Object.hasOwn(Wrapper.prototype, "greet")]).toEqual([false, true]);
  });

  it("answers toString from the delegate, as Delegator#to_s reaches method_missing", () => {
    class Mask extends DelegateClass(String) {}
    const mask = new Mask("[FILTERED]");
    expect(String(mask)).toBe("[FILTERED]");
    expect(`name: ${mask}`).toBe("name: [FILTERED]");
  });

  it("keeps a subclass's #private field reachable and delegates through the prototype chain", () => {
    class Wrapper extends SimpleDelegator {
      #secret = 7;
      secret(): number {
        return this.#secret;
      }
    }
    const wrapper = new Wrapper([1, 2]) as Wrapper & number[];
    expect(wrapper.secret()).toBe(7);
    expect(wrapper.at(1)).toBe(2);
    expect(rbObjRespondTo(wrapper, "at")).toBe(true);
    expect(wrapper instanceof Wrapper).toBe(true);
    expect(Object.getPrototypeOf(wrapper)).toBe(Wrapper.prototype);
  });
});
