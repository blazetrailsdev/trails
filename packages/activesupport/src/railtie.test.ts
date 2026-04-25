import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Railtie, registerRailtie } from "./railtie.js";

describe("Railtie", () => {
  // Snapshot and restore global singletons so these tests don't interfere
  // with other test files (e.g. ActiveModel::Railtie expects to remain
  // registered in Railtie.subclasses after module init).
  let savedSubclasses: (typeof Railtie)[];
  let savedConfig: Record<string, unknown>;

  beforeEach(() => {
    savedSubclasses = [...Railtie.subclasses];
    savedConfig = { ...Railtie.config };
    (Railtie.subclasses as (typeof Railtie)[]).length = 0;
    for (const key of Object.keys(Railtie.config)) {
      delete (Railtie.config as Record<string, unknown>)[key];
    }
  });

  afterEach(() => {
    (Railtie.subclasses as (typeof Railtie)[]).length = 0;
    (Railtie.subclasses as (typeof Railtie)[]).push(...savedSubclasses);
    for (const key of Object.keys(Railtie.config)) {
      delete (Railtie.config as Record<string, unknown>)[key];
    }
    Object.assign(Railtie.config, savedConfig);
  });

  it("initializer registers a named block", () => {
    class TestRailtie extends Railtie {}
    const log: string[] = [];
    TestRailtie.initializer("test.hello", () => log.push("hello"));
    TestRailtie.runInitializers();
    expect(log).toEqual(["hello"]);
  });

  it("runInitializers runs blocks in registration order", () => {
    class OrderRailtie extends Railtie {}
    const log: string[] = [];
    OrderRailtie.initializer("a", () => log.push("a"));
    OrderRailtie.initializer("b", () => log.push("b"));
    OrderRailtie.runInitializers();
    expect(log).toEqual(["a", "b"]);
  });

  it("initializers are isolated per subclass", () => {
    class R1 extends Railtie {}
    class R2 extends Railtie {}
    const log: string[] = [];
    R1.initializer("r1", () => log.push("r1"));
    R2.initializer("r2", () => log.push("r2"));
    R1.runInitializers();
    expect(log).toEqual(["r1"]);
  });

  it("registerRailtie adds subclass to registry", () => {
    class MyRailtie extends Railtie {
      static {
        registerRailtie(this);
      }
    }
    expect(Railtie.subclasses).toContain(MyRailtie);
  });

  it("runAllInitializers fires every registered subclass", () => {
    class A extends Railtie {
      static {
        registerRailtie(this);
      }
    }
    class B extends Railtie {
      static {
        registerRailtie(this);
      }
    }
    const log: string[] = [];
    A.initializer("a", () => log.push("A"));
    B.initializer("b", () => log.push("B"));
    Railtie.runAllInitializers();
    expect(log).toEqual(["A", "B"]);
  });

  it("config is isolated per subclass (copy-on-first-access)", () => {
    class Child extends Railtie {}
    Railtie.config["shared"] = "base";
    Child.config["own"] = "child";
    expect(Child.config["shared"]).toBe("base");
    expect(Railtie.config["own"]).toBeUndefined();
  });
});
