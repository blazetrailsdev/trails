import { describe, expect, it } from "vitest";
import { ArgumentError } from "../lib/argument-error.js";
import { DelegateClass, SimpleDelegator } from "../lib/delegate.js";

class Target {
  _stored = "initial";

  get value(): string {
    return this._stored;
  }

  set value(next: string) {
    this._stored = next;
  }

  get readOnly(): string {
    return "ro";
  }

  first(): string {
    return "first";
  }
}

class Sub extends Target {
  second(): string {
    return "second";
  }
}

describe("TestDelegateClass", () => {
  it("test_delegate_class_block", () => {
    const klass = DelegateClass(Target, function () {
      Object.defineProperty(this.prototype, "foo", {
        configurable: true,
        value(this: { first(): unknown }) {
          return this.first();
        },
      });
    });
    const delegator = new klass(new Target()) as unknown as { foo(): unknown };
    expect(delegator.foo()).toBe("first");
  });

  it("test_unset_delegate_class", () => {
    const klass = DelegateClass(Target);
    const unset = Object.create(klass.prototype) as { __getobj__(): unknown };
    expect(() => unset.__getobj__()).toThrow(ArgumentError);
    expect(() => unset.__getobj__()).toThrow(/not delegated/);
  });

  it("test_methods", () => {
    const target = new Sub();
    const delegator = new (DelegateClass(Sub))(target) as unknown as Sub;

    expect(delegator.first()).toBe("first");
    expect(delegator.second()).toBe("second");
    expect(delegator.value).toBe("initial");
    expect(delegator.readOnly).toBe("ro");

    delegator.value = "written";
    expect(target.value).toBe("written");
    expect(delegator.value).toBe("written");
  });

  it("test_override", () => {
    class Overriding extends DelegateClass(Target) {
      override first(): string {
        return `overridden ${this.__getobj__().first()}`;
      }
    }
    const delegator = new Overriding(new Target()) as unknown as Target;
    expect(delegator.first()).toBe("overridden first");
    expect(delegator.value).toBe("initial");
  });

  it("test_delegateclass_class", () => {
    expect(new (DelegateClass(Target))(new Target())).toBeInstanceOf(Target);
  });

  it("test_simpledelegator_class", () => {
    const simple = new SimpleDelegator([]);
    expect(simple).not.toBeInstanceOf(Array);
    expect(simple.constructor).toBe(SimpleDelegator);
    expect("push" in simple).toBe(true);
    expect((simple as unknown as unknown[]).length).toBe(0);
  });

  it("test_unset_simple_delegator", () => {
    const unset = Object.create(SimpleDelegator.prototype) as SimpleDelegator;
    expect(() => unset.__getobj__()).toThrow(ArgumentError);
    expect(() => unset.__getobj__()).toThrow(/not delegated/);
    expect(unset.__getobj__(() => "block")).toBe("block");
    const proxied = new SimpleDelegator([]);
    delete (proxied as { delegateSdObj?: unknown }).delegateSdObj;
    expect("length" in proxied).toBe(false);
  });
});

describe("DelegateClass(Array)", () => {
  it("forwards length, index reads and iteration to the wrapped Array", () => {
    const parts = [1, 2, 3];
    const delegator = new (DelegateClass(Array))(parts) as unknown as number[];
    expect(delegator.length).toBe(3);
    expect(delegator[1]).toBe(2);
    expect([...delegator]).toEqual([1, 2, 3]);
    delegator.push(4);
    expect(parts).toEqual([1, 2, 3, 4]);
    delegator.length = 0;
    expect(parts).toEqual([]);
  });
});

describe("Delegator Kernel names", () => {
  it("forwards a Kernel name the delegate answers and leaves an unanswered one unread", () => {
    const answering = new SimpleDelegator({ caseEquals: (other: unknown) => other === 1 });
    expect((answering as unknown as { caseEquals(o: unknown): boolean }).caseEquals(1)).toBe(true);

    const silent = new SimpleDelegator({});
    expect((silent as unknown as { caseEquals?: unknown }).caseEquals).toBeUndefined();
    expect(() => (silent as unknown as { other(): void }).other()).toThrow(/undefined method/);
  });
});
