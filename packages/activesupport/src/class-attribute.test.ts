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
