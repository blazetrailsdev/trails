import { describe, it, expect, vi } from "vitest";
import { classModule, NameError, NoMethodError, rbObjRespondTo } from "@blazetrails/ruby-compat";

import { Delegation, DelegationError } from "../lib/delegation.js";
import { delegate, delegateMissingTo } from "../lib/module-ext.js";

describe("Delegation.generate", () => {
  it("delegates where code generation from strings raises EvalError", () => {
    vi.stubGlobal("Function", function () {
      throw new EvalError("Code generation from strings disallowed for this context");
    });
    try {
      class Box {
        inner = { size: () => 3 };
        declare size: () => number;
      }
      delegate.call(Box.prototype, "size", { to: "inner" });
      expect(new Box().size()).toBe(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("answers nil.to_s for a toString delegated to a nil target with allowNil", () => {
    class Message {
      content: string | null = null;
    }
    delegate.call(Message.prototype, "toString", { to: "content", allowNil: true });

    expect(typeof new Message().toString).toBe("function");
    expect(String(new Message())).toBe("");
    const message = new Message();
    message.content = "hi";
    expect(String(message)).toBe("hi");
  });

  it("calls a nil target bare when nilable is false", () => {
    class Order {
      customer: { name(): string } | null = null;
      declare name: () => string;
    }
    Delegation.generate(Order.prototype, ["name"], { to: "customer", nilable: false });

    const error = (() => {
      try {
        new Order().name();
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(NoMethodError);
    expect(error).not.toBeInstanceOf(DelegationError);
    expect((error as Error).message).toBe("undefined method 'name' for nil");
  });

  it("ignores allowNil when nilable is false", () => {
    class Order {
      customer: { name(): string } | null = null;
      declare name: () => string;
    }
    Delegation.generate(Order.prototype, ["name"], {
      to: "customer",
      allowNil: true,
      nilable: false,
    });

    expect(() => new Order().name()).toThrow(NoMethodError);
  });

  it("assigns to a nil target bare when nilable is false", () => {
    class Order {
      customer: { name: string } | null = null;
      declare name: string;
    }
    Delegation.generate(Order.prototype, ["name="], { to: "customer", nilable: false });

    expect(() => {
      new Order().name = "Ada";
    }).toThrow(new NoMethodError("undefined method 'name=' for nil"));
  });

  it("reads an accessor off a nil target bare when nilable is false", () => {
    class Customer {
      get name() {
        return "Ada";
      }
    }
    class Order {
      customer: Customer | null = null;
      declare name: string;
    }
    Delegation.generate(Order.prototype, ["name"], {
      to: "customer",
      as: Customer,
      nilable: false,
    });

    expect(() => new Order().name).toThrow(new NoMethodError("undefined method 'name' for nil"));
  });

  it("names an object receiver as an instance of its class", () => {
    class Customer {}
    class Order {
      customer = new Customer();
      declare name: () => string;
    }
    Delegation.generate(Order.prototype, ["name"], { to: "customer" });

    expect(() => new Order().name()).toThrow(
      new NoMethodError("undefined method 'name' for an instance of Customer"),
    );
  });

  it("names a class receiver as a class", () => {
    class Customer {
      declare greet: () => string;
    }
    Delegation.generate(Customer.prototype, ["greet"], { to: "class" });

    expect(() => new Customer().greet()).toThrow(
      new NoMethodError("undefined method 'greet' for class Customer"),
    );
  });

  it("returns a function-valued accessor's value without calling it", () => {
    class Job {}
    class Customer {
      get job() {
        return Job;
      }
    }
    class Order {
      customer = new Customer();
      declare job: unknown;
    }
    Delegation.generate(Order.prototype, ["job"], { to: "customer" });

    expect(new Order().job).toBe(Job);
  });

  it("looks the method up on a module named by as", () => {
    class Nameable {
      static readonly [classModule] = true;
      rename(first: string, last: string) {
        return `${first} ${last}`;
      }
    }
    class Order {
      customer = {
        rename(first: string, last: string) {
          return `${first} ${last}`;
        },
      };
      declare rename: (first: string, last: string) => string;
    }
    Delegation.generate(Order.prototype, ["rename"], { to: "customer", as: Nameable });

    expect(Order.prototype.rename.length).toBe(2);
    expect(() =>
      Delegation.generate(Order.prototype, ["missing"], { to: "customer", as: Nameable }),
    ).toThrow(NameError);
  });

  it("treats an explicit nil nilable as nilable", () => {
    class Order {
      customer: { name(): string } | null = null;
      declare name: () => string;
    }
    Delegation.generate(Order.prototype, ["name"], { to: "customer", nilable: null });

    expect(() => new Order().name()).toThrow(DelegationError);
  });

  it("takes the signature from the class named by as", () => {
    class Customer {
      rename(first: string, last: string) {
        return `${first} ${last}`;
      }
    }
    class Order {
      customer = new Customer();
      declare rename: (first: string, last: string) => string;
    }
    Delegation.generate(Order.prototype, ["rename"], { to: "customer", as: Customer });

    expect(Order.prototype.rename.length).toBe(2);
    expect(new Order().rename("Ada", "Lovelace")).toBe("Ada Lovelace");
  });

  it("raises NameError when the class named by as does not define the method", () => {
    class Customer {}
    class Order {
      customer = new Customer();
    }

    expect(() =>
      Delegation.generate(Order.prototype, ["missing"], { to: "customer", as: Customer }),
    ).toThrow(NameError);
  });

  it("falls back to any arguments when an implicit receiver class does not define the method", () => {
    class Order {
      declare missing: () => unknown;
    }

    expect(Delegation.generate(Order.prototype, ["missing"], { to: "class" })).toEqual(["missing"]);
  });

  it("takes the parameter list from signature", () => {
    class Customer {
      rename(first: string, last: string) {
        return `${first} ${last}`;
      }
    }
    class Order {
      customer = new Customer();
      declare rename: (...args: string[]) => string;
      declare name: () => string;
    }
    Delegation.generate(Order.prototype, ["rename"], {
      to: "customer",
      as: Customer,
      signature: "value",
    });
    Delegation.generate(Order.prototype, ["name"], { to: "customer", signature: "" });

    expect(Order.prototype.rename.length).toBe(1);
    expect(Order.prototype.name.length).toBe(0);

    for (const [signature, length] of [
      ["...", 0],
      ["a, &", 1],
      ["a, b = 1, *rest, key:, &block", 1],
    ] as const) {
      Delegation.generate(Order.prototype, ["rename"], { to: "customer", signature });
      expect(Order.prototype.rename.length).toBe(length);
    }
  });
});

describe("delegate", () => {
  it("accepts private", () => {
    class Customer {
      name() {
        return "Ada";
      }
    }
    class Order {
      customer = new Customer();
      declare name: () => string;
    }

    expect(delegate.call(Order.prototype, "name", { to: "customer", private: true })).toEqual([
      "name",
    ]);
    expect(new Order().name()).toBe("Ada");
  });

  it("reads a String target's accessor as a property and its method as a method", () => {
    class Customer {
      get name() {
        return "Ada";
      }
      greet(who: string) {
        return `hi ${who}`;
      }
    }
    class Order {
      customer = new Customer();
      declare name: string;
      declare greet: (who: string) => string;
    }
    Delegation.generate(Order.prototype, ["name", "greet"], { to: "customer" });

    expect(new Order().name).toBe("Ada");
    expect(new Order().greet("Bo")).toBe("hi Bo");
    expect(new Order().name).toBe("Ada");
  });

  it("keeps the shape the first read decided for a later receiver", () => {
    class Order {
      customer: unknown;
      constructor(customer: unknown) {
        this.customer = customer;
      }
      declare name: unknown;
    }
    Delegation.generate(Order.prototype, ["name"], { to: "customer" });

    expect(new Order({ name: "Ada" }).name).toBe("Ada");
    expect(new Order({ name: () => "Bo" }).name).toBeTypeOf("function");
  });

  it("resolves the target again on a call after a read that was not called", () => {
    class Customer {
      constructor(public label: string) {}
      greet() {
        return this.label;
      }
    }
    class Order {
      customer = new Customer("first");
      declare greet: () => string;
    }
    Delegation.generate(Order.prototype, ["greet"], { to: "customer" });

    const order = new Order();
    expect(typeof order.greet).toBe("function");
    order.customer = new Customer("second");
    expect(order.greet()).toBe("second");
  });

  it("reads nil for an allow_nil delegate whose target is nil", () => {
    class Order {
      customer: unknown = null;
      declare name: unknown;
    }
    Delegation.generate(Order.prototype, ["name"], { to: "customer", allowNil: true });

    expect(new Order().name).toBeUndefined();
  });

  it("raises DelegationError on a property read whose target is nil", () => {
    class Customer {
      get name() {
        return "Ada";
      }
    }
    class Order {
      customer: unknown = new Customer();
      declare name: unknown;
    }
    Delegation.generate(Order.prototype, ["name"], { to: "customer" });

    expect(new Order().name).toBe("Ada");
    const order = new Order();
    order.customer = null;
    expect(() => order.name).toThrow(DelegationError);
  });

  it("gives a reader and writer pair one accessor", () => {
    class Adapter {
      x = 1;
    }
    class Helper {
      adapter = new Adapter();
      someMethod() {
        return this.adapter;
      }
      declare x: number;
    }
    delegate.call(Helper.prototype, "x", "x=", { to: "someMethod" });

    const helper = new Helper();
    expect(helper.x).toBe(1);
    helper.x = 2;
    expect(helper.adapter.x).toBe(2);
    expect(helper.x).toBe(2);
  });

  it("gives a writer and reader pair one accessor", () => {
    class Adapter {
      x = 1;
    }
    class Helper {
      adapter = new Adapter();
      someMethod() {
        return this.adapter;
      }
      declare x: number;
    }
    delegate.call(Helper.prototype, "x=", "x", { to: "someMethod" });

    const helper = new Helper();
    expect(helper.x).toBe(1);
    helper.x = 2;
    expect(helper.adapter.x).toBe(2);
  });
});

describe("delegate_missing_to and then", () => {
  it("does not forward then, so awaiting the delegator answers the delegator", async () => {
    class Holder {
      get target() {
        return Promise.resolve("target");
      }
    }
    Delegation.generateMethodMissing(Holder, "target");
    const holder = new Holder();
    expect(await holder).toBe(holder);
  });
});

describe("Delegation.generate to a constant name", () => {
  it("reads a capitalised to: as a constant on the owner, not a method", () => {
    class Target {
      static greet(): string {
        return "hi";
      }
    }
    const owner = { Target } as { Target: typeof Target; greet?: () => string };
    delegate.call(owner, "greet", { to: "Target" });
    expect(owner.greet!()).toBe("hi");
  });
});

describe("Delegation.generate prefix: true", () => {
  it("raises TypeError for a Module target, as Regexp#match? does in MRI", () => {
    class Target {}
    class Host {}
    expect(() =>
      Delegation.generate(Host.prototype, ["x"], { to: Target as never, prefix: true }),
    ).toThrow(/no implicit conversion of Class into String/);
  });

  it("raises ArgumentError for a non-method-shaped String target", () => {
    class Host {}
    expect(() =>
      Delegation.generate(Host.prototype, ["x"], { to: "Target", prefix: true }),
    ).toThrow("Can only automatically set the delegation prefix when delegating to a method.");
  });
});

describe("Delegation.generateMethodMissing writer", () => {
  it("forwards an assignment to a target whose writer is a setter", () => {
    class Box {
      value: unknown = null;
      set content(v: unknown) {
        this.value = v;
      }
    }
    class Wrapper {
      constructor(public box: Box) {}
    }
    Delegation.generateMethodMissing(Wrapper, "box");
    const wrapper = new Wrapper(new Box()) as Wrapper & { content: unknown };
    wrapper.content = 42;
    expect(wrapper.box.value).toBe(42);
    expect(Object.hasOwn(wrapper, "content")).toBe(false);
  });
});

describe("Delegation.generateMethodMissing", () => {
  it("forwards a name the target answers only through its own respond_to_missing?", () => {
    class Inner {
      size = 3;
    }
    class Middle {
      inner = new Inner();
    }
    delegateMissingTo.call(Middle, "inner");
    class Outer {
      middle = new Middle();
    }
    delegateMissingTo.call(Outer, "middle");
    expect((new Outer() as unknown as { size: number }).size).toBe(3);
    expect(rbObjRespondTo(new Outer(), "size")).toBe(true);
  });

  it("raises when the target is still a pending promise", async () => {
    const pending = Promise.resolve({ size: 3 });
    class Lazy {
      get target() {
        return pending;
      }
    }
    delegateMissingTo.call(Lazy, "target");
    expect(() => (new Lazy() as unknown as { size: number }).size).toThrow(
      "size needs target loaded",
    );
    await pending;
  });

  it("answers a nil target's reader with null and its method with a nil-returning function", () => {
    class Target {
      declare size: number;
      grow(): number {
        return 1;
      }
    }
    Object.defineProperty(Target.prototype, "size", { get: () => 1 });
    class Holder {
      target: Target | null = null;
    }
    delegateMissingTo.call(Holder, "target", { allowNil: true, nilTargetClasses: () => [Target] });
    const holder = new Holder() as unknown as {
      size: unknown;
      grow: () => unknown;
      other: () => unknown;
    };
    expect(holder.size).toBeNull();
    expect(holder.grow()).toBeNull();
    expect(holder.other()).toBeNull();
  });
});
