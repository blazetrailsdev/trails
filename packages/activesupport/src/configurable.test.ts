import { describe, it, expect } from "vitest";

import { configAccessor } from "./module-ext.js";
import { Configurable, Configuration } from "./configurable.js";

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
    Configurable.configAccessor(Base, "foo");
    (Base as any).foo = "bar";

    class Child extends Base {}
    expect((Child as any).foo).toBe("bar");

    (Child as any).foo = "baz";
    expect((Child as any).foo).toBe("baz");
    expect((Base as any).foo).toBe("bar");
  });

  it("configuration accessors can take a default value as an option", () => {
    class Cfg {}
    configAccessor(Cfg, "size", { default: 100 });
    expect((Cfg as any).size).toBe(100);
  });

  it("configuration hash is available on instance", () => {
    class Cfg {}
    Configurable.configAccessor(Cfg, "name", { default: "default" });
    const inst = new Cfg() as any;
    expect(inst.name).toBe("default");

    inst.name = "custom";
    expect(inst.name).toBe("custom");
    expect((Cfg as any).name).toBe("default");
  });

  it("should raise name error if attribute name is invalid", () => {
    class Cfg {}
    expect(() => Configurable.configAccessor(Cfg, "invalid attribute name")).toThrow(
      /invalid config attribute name/,
    );
    expect(() => Configurable.configAccessor(Cfg, "invalid\nattribute")).toThrow(
      /invalid config attribute name/,
    );
  });

  it("configuration accessors are not available on instance", () => {
    class Base {}
    Configurable.configAccessor(Base, "bar", { instanceAccessor: false });
    expect(Object.getOwnPropertyDescriptor(Base.prototype, "bar")).toBeUndefined();
  });

  it("configuration accessors can take a default value as a block", () => {
    class Base {}
    Configurable.configAccessor(Base, "computed_val", { default: () => 42 });
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

describe("Configurable.getConfig", () => {
  it("returns a Configuration instance", () => {
    class Target {}
    const config = Configurable.getConfig(Target);
    expect(config).toBeInstanceOf(Configuration);
  });

  it("returns the same config on repeated calls", () => {
    class Target {}
    expect(Configurable.getConfig(Target)).toBe(Configurable.getConfig(Target));
  });

  it("subclass gets its own config inheriting from parent", () => {
    class Parent {}
    class Child extends Parent {}
    Configurable.getConfig(Parent).set("key", "parentValue");
    const childConfig = Configurable.getConfig(Child);
    expect(childConfig.get("key")).toBe("parentValue");

    childConfig.set("key", "childValue");
    expect(Configurable.getConfig(Child).get("key")).toBe("childValue");
    expect(Configurable.getConfig(Parent).get("key")).toBe("parentValue");
  });
});

describe("Configurable.configure", () => {
  it("yields the config for block-style configuration", () => {
    class App {}
    Configurable.configure(App, (config) => {
      config.set("host", "localhost");
      config.set("port", 3000);
    });
    expect(Configurable.getConfig(App).get("host")).toBe("localhost");
    expect(Configurable.getConfig(App).get("port")).toBe(3000);
  });
});

describe("Configurable.configAccessor", () => {
  it("instance writer only creates a method, not a property", () => {
    class Base {}
    Configurable.configAccessor(Base, "writeOnly", {
      instanceReader: false,
      instanceWriter: true,
    });
    expect(Object.getOwnPropertyDescriptor(Base.prototype, "writeOnly")).toBeUndefined();
    expect(typeof (Base.prototype as any)["writeOnly="]).toBe("function");
  });

  it("instance reader only creates a getter without setter", () => {
    class Base {}
    Configurable.configAccessor(Base, "readOnly", {
      instanceReader: true,
      instanceWriter: false,
      default: "value",
    });
    const desc = Object.getOwnPropertyDescriptor(Base.prototype, "readOnly");
    expect(desc?.get).toBeDefined();
    expect(desc?.set).toBeUndefined();
  });
});
