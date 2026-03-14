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
});
