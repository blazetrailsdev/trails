import { describe, it, expect, vi } from "vitest";
import { concern, includeConcern, hasConcern } from "./concern.js";

describe("Concern", () => {
  it("mixes instance methods into class prototype", () => {
    const Greetable = concern({
      instanceMethods: {
        greet() {
          return "hello";
        },
      },
    });

    class User {}
    includeConcern(User, Greetable);

    const user = new User() as any;
    expect(user.greet()).toBe("hello");
  });

  it("mixes class methods as static methods", () => {
    const Findable = concern({
      classMethods: {
        findByName(name: string) {
          return `found:${name}`;
        },
      },
    });

    class User {}
    includeConcern(User, Findable);

    expect((User as any).findByName("dean")).toBe("found:dean");
  });

  it("runs included block", () => {
    const fn = vi.fn();
    const Trackable = concern({ included: fn });

    class User {}
    includeConcern(User, Trackable);

    expect(fn).toHaveBeenCalledWith(User);
  });

  it("resolves dependencies", () => {
    const order: string[] = [];

    const Base = concern({
      included: () => order.push("base"),
      instanceMethods: {
        base() {
          return true;
        },
      },
    });

    const Extended = concern({
      dependencies: [Base],
      included: () => order.push("extended"),
      instanceMethods: {
        extended() {
          return true;
        },
      },
    });

    class User {}
    includeConcern(User, Extended);

    expect(order).toEqual(["base", "extended"]);
    const user = new User() as any;
    expect(user.base()).toBe(true);
    expect(user.extended()).toBe(true);
  });

  it("does not include the same concern twice", () => {
    const fn = vi.fn();
    const Trackable = concern({ included: fn });

    class User {}
    includeConcern(User, Trackable);
    includeConcern(User, Trackable);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("hasConcern returns correct value", () => {
    const Trackable = concern({ instanceMethods: {} });

    class User {}
    expect(hasConcern(User, Trackable)).toBe(false);

    includeConcern(User, Trackable);
    expect(hasConcern(User, Trackable)).toBe(true);
  });

  it("dependencies are only included once even if multiple concerns depend on them", () => {
    const fn = vi.fn();
    const Base = concern({ included: fn });
    const A = concern({ dependencies: [Base] });
    const B = concern({ dependencies: [Base] });

    class User {}
    includeConcern(User, A);
    includeConcern(User, B);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("prepend: true wraps existing prototype method and saves original as _super_<name>", () => {
    class User {
      greet() {
        return "hello";
      }
    }

    const Decorated = concern({
      prepend: true,
      instanceMethods: {
        greet(this: any) {
          return `[decorated] ${this._super_greet()}`;
        },
      },
    });

    includeConcern(User, Decorated);
    const u = new User() as any;
    expect(u.greet()).toBe("[decorated] hello");
    expect(typeof u._super_greet).toBe("function");
  });

  it("prepend: false does not save _super_ method", () => {
    class User {
      greet() { return "hello"; }
    }

    const Override = concern({
      instanceMethods: {
        greet() { return "overridden"; },
      },
    });

    includeConcern(User, Override);
    const u = new User() as any;
    expect(u.greet()).toBe("overridden");
    expect(u._super_greet).toBeUndefined();
  });

  it("can include multiple concerns each providing different methods", () => {
    const Serializable = concern({
      instanceMethods: {
        serialize() { return JSON.stringify({ type: "User" }); },
      },
    });

    const Auditable = concern({
      instanceMethods: {
        auditLog() { return "audit"; },
      },
      classMethods: {
        auditedFields() { return ["name", "email"]; },
      },
    });

    class User {}
    includeConcern(User, Serializable);
    includeConcern(User, Auditable);

    const u = new User() as any;
    expect(u.serialize()).toContain("User");
    expect(u.auditLog()).toBe("audit");
    expect((User as any).auditedFields()).toEqual(["name", "email"]);
  });
});
