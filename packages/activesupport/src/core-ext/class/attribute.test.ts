import { describe, it, expect, beforeEach } from "vitest";
import { classAttribute } from "../../class-attribute.js";

describe("ClassAttributeTest", () => {
  let Klass: any;
  let Sub: any;

  beforeEach(() => {
    Klass = class {};
    classAttribute(Klass, "setting");
    classAttribute(Klass, "timeout", { default: 5 });
    classAttribute(Klass, "system");
    Sub = class extends Klass {};
    classAttribute(Sub, "setting");
    classAttribute(Sub, "timeout", { default: 5 });
    classAttribute(Sub, "system");
  });

  it("defaults to nil", () => {
    expect(Klass.setting).toBeUndefined();
    expect(Sub.setting).toBeUndefined();
  });

  it("custom default", () => {
    expect(Klass.timeout).toBe(5);
  });

  it("inheritable", () => {
    Klass.setting = 1;
    expect(Sub.setting).toBe(1);
  });

  it("overridable", () => {
    Sub.setting = 1;
    expect(Klass.setting).toBeUndefined();
    expect(Sub.setting).toBe(1);

    Klass.setting = 2;
    expect(Klass.setting).toBe(2);
    expect(Sub.setting).toBe(1);
  });

  it("predicate method", () => {
    expect(!!Klass.setting).toBe(false);
    Klass.setting = 1;
    expect(!!Klass.setting).toBe(true);
  });

  it("instance reader delegates to class", () => {
    expect(new Klass().setting).toBeUndefined();
    Klass.setting = 1;
    expect(new Klass().setting).toBe(1);
  });

  it("instance override", () => {
    const object = new Klass();
    object.setting = 1;
    expect(Klass.setting).toBeUndefined();
    Klass.setting = 2;
    expect(object.setting).toBe(1);
  });

  it("instance predicate", () => {
    const Cls = class {};
    classAttribute(Cls, "active", { instancePredicate: true });
    const object = new (Cls as any)();
    expect(object.isActive).toBe(false);
    object.active = 1;
    expect(object.isActive).toBe(true);
  });

  it("disabling instance writer", () => {
    const Cls = class {};
    classAttribute(Cls, "setting", { instanceWriter: false });
    const object = new (Cls as any)();
    expect(() => {
      object.setting = "boom";
    }).toThrow();
  });

  it("disabling instance reader", () => {
    const Cls = class {};
    classAttribute(Cls, "setting", { instanceReader: false });
    const object = new (Cls as any)();
    expect(Object.getOwnPropertyDescriptor(Cls.prototype, "setting")).toBeUndefined();
  });

  it("disabling both instance writer and reader", () => {
    const Cls = class {};
    classAttribute(Cls, "setting", { instanceReader: false, instanceWriter: false });
    const object = new (Cls as any)();
    expect(Object.getOwnPropertyDescriptor(Cls.prototype, "setting")).toBeUndefined();
  });

  it("disabling instance predicate", () => {
    const Cls = class {};
    classAttribute(Cls, "setting", { instancePredicate: false });
    const object = new (Cls as any)();
    const predDesc = Object.getOwnPropertyDescriptor(Cls.prototype, "isSetting");
    expect(predDesc).toBeUndefined();
  });

  it.skip("works well with singleton classes");
  it.skip("when defined in a class's singleton");
  it.skip("works well with module singleton classes");

  it("setter returns set value", () => {
    Klass.setting = 1;
    expect(Klass.setting).toBe(1);
  });

  it("works when overriding private methods from an ancestor", () => {
    expect(Klass.system).toBeUndefined();
    Klass.system = 1;
    expect(Klass.system).toBe(1);

    const instance = new Klass();
    expect(instance.system).toBe(1);
    instance.system = 2;
    expect(instance.system).toBe(2);
  });

  it.skip("allow to prepend accessors");

  it.skip("can check if value is set on a sub class");
});
