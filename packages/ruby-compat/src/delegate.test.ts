import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { DelegateClass } from "./delegate.js";

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
        return `overridden ${(this.__getobj__() as Target).first()}`;
      }
    }
    const delegator = new Overriding(new Target()) as unknown as Target;
    expect(delegator.first()).toBe("overridden first");
    expect(delegator.value).toBe("initial");
  });

  it("test_delegateclass_class", () => {
    expect(new (DelegateClass(Target))(new Target())).toBeInstanceOf(Target);
  });
});
