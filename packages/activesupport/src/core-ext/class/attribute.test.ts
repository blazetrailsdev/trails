import { describe, it, expect, beforeEach } from "vitest";
import { classAttribute } from "../../class-attribute.js";

describe("ClassAttributeTest", () => {
  let Klass: any;
  let Sub: any;

  beforeEach(() => {
    Klass = class {};
    classAttribute.call(Klass, "setting");
    classAttribute.call(Klass, "timeout", { default: 5 });
    classAttribute.call(Klass, "system");
    Sub = class extends Klass {};
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

    expect(class extends Sub {}.setting).toBe(1);
    expect(class extends Klass {}.setting).toBe(2);
  });

  it("predicate method", () => {
    expect(Klass.isSetting).toBe(false);
    Klass.setting = 1;
    expect(Klass.isSetting).toBe(true);
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
    const object = new Klass();
    expect(object.isSetting).toBe(false);
    object.setting = 1;
    expect(object.isSetting).toBe(true);
  });

  it("disabling instance writer", () => {
    const Cls = class {};
    classAttribute.call(Cls, "setting", { instanceWriter: false });
    const object = new (Cls as any)();
    expect(() => {
      object.setting = "boom";
    }).toThrow(TypeError);
    expect(
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(object), "setting")?.set,
    ).toBeUndefined();
  });

  it("disabling instance reader", () => {
    const Cls = class {};
    classAttribute.call(Cls, "setting", { instanceReader: false });
    const object = new (Cls as any)();
    expect(object.setting).toBeUndefined();
    expect(
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(object), "setting")?.get,
    ).toBeUndefined();
    expect(object.isSetting).toBeUndefined();
    expect(Object.getPrototypeOf(object)).not.toHaveProperty("isSetting");
  });

  it("disabling both instance writer and reader", () => {
    const Cls = class {};
    classAttribute.call(Cls, "setting", { instanceAccessor: false });
    const object = new (Cls as any)();
    expect(object.setting).toBeUndefined();
    expect(Object.getPrototypeOf(object)).not.toHaveProperty("setting");
    expect(object.isSetting).toBeUndefined();
    expect(Object.getPrototypeOf(object)).not.toHaveProperty("isSetting");
  });

  it("disabling instance predicate", () => {
    const Cls = class {};
    classAttribute.call(Cls, "setting", { instancePredicate: false });
    const object = new (Cls as any)();
    expect(object.isSetting).toBeUndefined();
    expect(Object.getPrototypeOf(object)).not.toHaveProperty("isSetting");
  });

  it("setter returns set value", () => {
    const val = (Klass.setting = 1);
    expect(val).toBe(1);
  });

  it("works when overriding private methods from an ancestor", () => {
    expect(Klass.system).toBeUndefined();
    Klass.system = 1;
    expect(Klass.system).toBe(1);

    const instance = new Klass();
    expect(instance.system).toBe(1);
    expect(new Klass().isSystem).toBe(true);
    instance.system = 2;
    expect(instance.system).toBe(2);
  });

  it("can check if value is set on a sub class", () => {
    expect(Object.prototype.hasOwnProperty.call(Sub, "__class_attr_setting")).toBe(false);
    Sub.setting = true;
    expect(Object.prototype.hasOwnProperty.call(Sub, "__class_attr_setting")).toBe(true);
  });
});
