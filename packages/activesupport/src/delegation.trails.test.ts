import { describe, it, expect } from "vitest";
import { NameError, NoMethodError } from "@blazetrails/ruby-compat";
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
});
