import { describe, it, expect } from "vitest";
import { classAttribute } from "./class-attribute.js";

describe("classAttribute", () => {
  it("defines a class-level attribute with default", () => {
    class Model {}
    classAttribute(Model, "tableName", { default: "models" });

    expect((Model as any).tableName).toBe("models");
  });

  it("allows overriding the class-level value", () => {
    class Model {}
    classAttribute(Model, "tableName", { default: "models" });
    (Model as any).tableName = "users";

    expect((Model as any).tableName).toBe("users");
  });

  it("instance reads fall back to class value", () => {
    class Model {}
    classAttribute(Model, "tableName", { default: "models" });

    const instance = new Model() as any;
    expect(instance.tableName).toBe("models");
  });

  it("instance can override the value locally", () => {
    class Model {}
    classAttribute(Model, "tableName", { default: "models" });

    const a = new Model() as any;
    const b = new Model() as any;
    a.tableName = "custom";

    expect(a.tableName).toBe("custom");
    expect(b.tableName).toBe("models");
  });

  it("subclass inherits from parent", () => {
    class Base {}
    classAttribute(Base, "color", { default: "red" });

    class Child extends Base {}
    // Child should inherit
    expect((Child as any).color).toBe("red");
  });

  it("subclass can override without affecting parent", () => {
    class Base {}
    classAttribute(Base, "color", { default: "red" });

    class Child extends Base {}
    (Child as any).color = "blue";

    expect((Base as any).color).toBe("red");
    expect((Child as any).color).toBe("blue");
  });

  it("instanceWriter: false prevents instance writes", () => {
    class Model {}
    classAttribute(Model, "locked", { default: true, instanceWriter: false });

    const instance = new Model() as any;
    expect(instance.locked).toBe(true);

    // Attempting to set should have no effect (setter is undefined)
    expect(() => {
      instance.locked = false;
    }).toThrow();
  });

  it("instanceReader: false prevents instance reads", () => {
    class Model {}
    classAttribute(Model, "secret", {
      default: "hidden",
      instanceReader: false,
    });

    const instance = new Model() as any;
    // No property on prototype
    expect(instance.secret).toBeUndefined();
    // But class-level still works
    expect((Model as any).secret).toBe("hidden");
  });

  it("instancePredicate creates isName getter", () => {
    class Model {}
    classAttribute(Model, "active", {
      default: true,
      instancePredicate: true,
    });

    const instance = new Model() as any;
    expect(instance.isActive).toBe(true);
  });

  it("predicate reflects current value", () => {
    class Model {}
    classAttribute(Model, "active", {
      default: false,
      instancePredicate: true,
    });

    const instance = new Model() as any;
    expect(instance.isActive).toBe(false);

    instance.active = 1;
    expect(instance.isActive).toBe(true);
  });
});

describe("ClassAttributeTest", () => {
  it("defaults to nil", () => {
    class Klass {}
    classAttribute(Klass, "x");
    expect((Klass as any).x).toBeUndefined();
    expect(new (Klass as any)().x).toBeUndefined();
  });

  it("custom default", () => {
    class Klass {}
    classAttribute(Klass, "x", { default: "default_value" });
    expect((Klass as any).x).toBe("default_value");
  });

  it("inheritable", () => {
    class Base {}
    classAttribute(Base, "x", { default: "base_value" });
    class Child extends Base {}
    expect((Child as any).x).toBe("base_value");
  });

  it("overridable", () => {
    class Base {}
    classAttribute(Base, "x", { default: "base_value" });
    class Child extends Base {}
    (Child as any).x = "child_value";
    expect((Base as any).x).toBe("base_value");
    expect((Child as any).x).toBe("child_value");
  });

  it("predicate method", () => {
    class Klass {}
    classAttribute(Klass, "x", { default: false, instancePredicate: true });
    const instance = new (Klass as any)();
    expect(instance.isX).toBe(false);
    instance.x = true;
    expect(instance.isX).toBe(true);
  });

  it("instance reader delegates to class", () => {
    class Klass {}
    classAttribute(Klass, "x", { default: "value" });
    expect(new (Klass as any)().x).toBe("value");
  });

  it("instance override", () => {
    class Klass {}
    classAttribute(Klass, "x", { default: "class_value" });
    const instance = new (Klass as any)();
    instance.x = "instance_value";
    expect(instance.x).toBe("instance_value");
    expect((Klass as any).x).toBe("class_value");
  });

  it("instance predicate", () => {
    class Klass {}
    classAttribute(Klass, "x", { default: true, instancePredicate: true });
    const instance = new (Klass as any)();
    expect(instance.isX).toBe(true);
    instance.x = false;
    expect(instance.isX).toBe(false);
  });

  it("disabling instance writer", () => {
    class Klass {}
    classAttribute(Klass, "x", { default: "value", instanceWriter: false });
    const instance = new (Klass as any)();
    expect(instance.x).toBe("value");
    expect(() => {
      instance.x = "new_value";
    }).toThrow();
  });

  it("disabling instance reader", () => {
    class Klass {}
    classAttribute(Klass, "x", { default: "value", instanceReader: false });
    const instance = new (Klass as any)();
    expect(instance.x).toBeUndefined();
    expect((Klass as any).x).toBe("value");
  });

  it("disabling both instance writer and reader", () => {
    class Klass {}
    classAttribute(Klass, "x", { default: "value", instanceWriter: false, instanceReader: false });
    expect((Klass as any).x).toBe("value");
    expect(new (Klass as any)().x).toBeUndefined();
  });

  it("disabling instance predicate", () => {
    class Klass {}
    classAttribute(Klass, "x", { default: true });
    expect(new (Klass as any)().isX).toBeUndefined();
  });

  it("setter returns set value", () => {
    class Klass {}
    classAttribute(Klass, "x");
    const result = ((Klass as any).x = "value");
    expect(result).toBe("value");
  });

  it.skip("works well with singleton classes", () => { /* Ruby singleton classes */ });
  it.skip("when defined in a class's singleton", () => { /* Ruby singleton classes */ });
  it.skip("works well with module singleton classes", () => { /* Ruby module singleton */ });
  it.skip("works when overriding private methods from an ancestor", () => { /* private method override semantics */ });
  it.skip("allow to prepend accessors", () => { /* Ruby module prepend */ });

  it("can check if value is set on a sub class", () => {
    class Parent {}
    classAttribute(Parent, "setting");
    class Child extends Parent {}
    classAttribute(Child, "setting");
    (Child as any).setting = "child_value";
    expect((Child as any).setting).toBe("child_value");
    expect((Parent as any).setting).not.toBe("child_value");
  });
});
