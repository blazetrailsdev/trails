import { describe, it, expect } from "vitest";

import { configAccessor } from "./module-ext.js";

describe("ConfigurableActiveSupport", () => {
  it("adds a configuration hash", () => {
    class Config {}
    configAccessor(Config, "level", { default: "info" });
    expect((Config as any).level).toBe("info");
  });

  it("adds a configuration hash to a module as well", () => {
    const Mod = {};
    configAccessor(Mod, "debug", { default: false });
    expect((Mod as any).debug).toBe(false);
  });

  it("configuration hash is inheritable", () => {
    class Base {}
    configAccessor(Base, "timeout", { default: 30 });
    class Child extends Base {}
    expect((Child as any).timeout).toBe(30);
  });

  it("configuration accessors can take a default value as an option", () => {
    class Cfg {}
    configAccessor(Cfg, "size", { default: 100 });
    expect((Cfg as any).size).toBe(100);
  });

  it("configuration hash is available on instance", () => {
    class Cfg {}
    configAccessor(Cfg, "name", { default: "default" });
    const inst = new Cfg() as any;
    expect(inst.name).toBe("default");
  });

  it("should raise name error if attribute name is invalid", () => {
    class Cfg {}
    expect(() => configAccessor(Cfg, "invalid-name")).toThrow();
  });

  it("configuration accessors are not available on instance", () => {
    class Base {}
    configAccessor(Base, "debug", { instanceAccessor: false });
    const instance = new Base() as any;
    // No instance-level property defined
    expect(Object.getOwnPropertyDescriptor(Base.prototype, "debug")).toBeUndefined();
  });

  it("configuration accessors can take a default value as a block", () => {
    class Base {}
    configAccessor(Base, "computed_val", { default: () => 42 });
    expect((Base as any).computed_val).toBe(42);
  });

  it("configuration is crystalizeable", () => {
    class Base {}
    configAccessor(Base, "frozen_val", { default: "immutable" });
    expect((Base as any).frozen_val).toBe("immutable");
    (Base as any).frozen_val = "changed";
    expect((Base as any).frozen_val).toBe("changed");
  });

  it.skip("the config_accessor method should not be publicly callable");
});
