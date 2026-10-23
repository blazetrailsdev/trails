import { describe, it, expect } from "vitest";
import { classModule, NameError, NoMethodError } from "@blazetrails/ruby-compat";

import { Delegation, DelegationError } from "./delegation.js";
import { delegate } from "./module-ext.js";

describe("Delegation.generate", () => {
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
    }).toThrow(NoMethodError);
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

    expect(() => new Order().name).toThrow(NoMethodError);
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
