import { describe, it, expect } from "vitest";
import { DelegationError, Delegation } from "./delegation.js";

describe("DelegationError", () => {
  it("creates error with message", () => {
    const err = new DelegationError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DelegationError");
    expect(err.message).toBe("test");
  });

  it("nilTarget creates descriptive error", () => {
    const err = DelegationError.nilTarget("name", "person");
    expect(err.message).toBe("name delegated to person, but person is nil");
  });
});

describe("Delegation.generate", () => {
  it("delegates method to target", () => {
    class Greeter {
      greet() {
        return "hello";
      }
    }
    class Person {
      greeter = new Greeter();
    }
    Delegation.generate(Person.prototype, ["greet"], { to: "greeter" });
    const p = new Person() as Person & { greet: () => string };
    expect(p.greet()).toBe("hello");
  });

  it("throws DelegationError when target is nil and allowNil is false", () => {
    class Person {
      greeter: null = null;
    }
    Delegation.generate(Person.prototype, ["greet"], { to: "greeter" });
    const p = new Person() as Person & { greet: () => unknown };
    expect(() => p.greet()).toThrow(DelegationError);
  });

  it("returns undefined when target is nil and allowNil is true", () => {
    class Person {
      greeter: null = null;
    }
    Delegation.generate(Person.prototype, ["greet"], { to: "greeter", allowNil: true });
    const p = new Person() as Person & { greet: () => unknown };
    expect(() => p.greet()).not.toThrow();
    expect(p.greet()).toBeUndefined();
  });

  it("supports prefix option", () => {
    class Greeter {
      greet() {
        return "hello";
      }
    }
    class Person {
      greeter = new Greeter();
    }
    Delegation.generate(Person.prototype, ["greet"], { to: "greeter", prefix: true });
    const p = new Person() as Person & { greeter_greet: () => string };
    expect(p.greeter_greet()).toBe("hello");
  });

  it("supports custom prefix", () => {
    class Greeter {
      greet() {
        return "hello";
      }
    }
    class Person {
      greeter = new Greeter();
    }
    Delegation.generate(Person.prototype, ["greet"], { to: "greeter", prefix: "my" });
    const p = new Person() as Person & { my_greet: () => string };
    expect(p.my_greet()).toBe("hello");
  });

  it("throws when no target specified", () => {
    expect(() => {
      Delegation.generate({}, ["greet"], { to: "" });
    }).toThrow("Delegation needs a target");
  });
});

describe("Delegation.generateMethodMissing", () => {
  it("proxies method calls to delegate", () => {
    const delegate = {
      greet() {
        return "hello";
      },
      name: "world",
    };
    const obj = Delegation.generateMethodMissing({ delegate } as any, "delegate");
    expect((obj as any).greet()).toBe("hello");
    expect((obj as any).name).toBe("world");
  });

  it("throws DelegationError for nil delegate without allowNil", () => {
    const obj = Delegation.generateMethodMissing({ delegate: null } as any, "delegate");
    expect(() => (obj as any).greet).toThrow(DelegationError);
  });

  it("returns undefined for nil delegate with allowNil", () => {
    const obj = Delegation.generateMethodMissing({ delegate: null } as any, "delegate", {
      allowNil: true,
    });
    expect((obj as any).greet).toBeUndefined();
  });
});
