import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Trailtie, registerTrailtie } from "./trailtie.js";

describe("Trailtie", () => {
  // Snapshot and restore global singletons so these tests don't interfere
  // with other test files (e.g. ActiveModel::Railtie expects to remain
  // registered in Trailtie.subclasses after module init).
  let savedSubclasses: (typeof Trailtie)[];
  let savedConfig: Record<string, unknown>;

  beforeEach(() => {
    savedSubclasses = [...Trailtie.subclasses];
    savedConfig = { ...Trailtie.config };
    Trailtie.subclasses.length = 0;
    for (const key of Object.keys(Trailtie.config)) {
      delete Trailtie.config[key];
    }
  });

  afterEach(() => {
    Trailtie.subclasses.length = 0;
    Trailtie.subclasses.push(...savedSubclasses);
    for (const key of Object.keys(Trailtie.config)) {
      delete Trailtie.config[key];
    }
    Object.assign(Trailtie.config, savedConfig);
  });

  it("initializer registers a named block", () => {
    class TestRailtie extends Trailtie {}
    const log: string[] = [];
    TestRailtie.initializer("test.hello", () => log.push("hello"));
    TestRailtie.runInitializers();
    expect(log).toEqual(["hello"]);
  });

  it("runInitializers runs blocks in registration order", () => {
    class OrderRailtie extends Trailtie {}
    const log: string[] = [];
    OrderRailtie.initializer("a", () => log.push("a"));
    OrderRailtie.initializer("b", () => log.push("b"));
    OrderRailtie.runInitializers();
    expect(log).toEqual(["a", "b"]);
  });

  it("initializers are isolated per subclass", () => {
    class R1 extends Trailtie {}
    class R2 extends Trailtie {}
    const log: string[] = [];
    R1.initializer("r1", () => log.push("r1"));
    R2.initializer("r2", () => log.push("r2"));
    R1.runInitializers();
    expect(log).toEqual(["r1"]);
  });

  it("registerTrailtie adds subclass to registry", () => {
    class MyRailtie extends Trailtie {
      static {
        registerTrailtie(this);
      }
    }
    expect(Trailtie.subclasses).toContain(MyRailtie);
  });

  it("runAllInitializers fires every registered subclass", () => {
    class A extends Trailtie {
      static {
        registerTrailtie(this);
      }
    }
    class B extends Trailtie {
      static {
        registerTrailtie(this);
      }
    }
    const log: string[] = [];
    A.initializer("a", () => log.push("A"));
    B.initializer("b", () => log.push("B"));
    Trailtie.runAllInitializers();
    expect(log).toEqual(["A", "B"]);
  });

  it("yields the arguments run_initializers was called with", () => {
    class C extends Trailtie {
      static {
        registerTrailtie(this);
      }
    }
    const seen: unknown[] = [];
    C.initializer("c", (app) => seen.push(app));
    const app = { railtieName: "blog_app_application" };
    C.runInitializers(app);
    expect(seen).toEqual([app]);
  });

  it("config is isolated per subclass (copy-on-first-access)", () => {
    class Child extends Trailtie {}
    Trailtie.config["shared"] = "base";
    Child.config["own"] = "child";
    expect(Child.config["shared"]).toBe("base");
    expect(Trailtie.config["own"]).toBeUndefined();
  });
});
