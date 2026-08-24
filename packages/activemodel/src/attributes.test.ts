import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

describe("AttributesTest", () => {
  class User extends Model {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer", { default: 0 });
      this.attribute("score", "float");
      this.attribute("active", "boolean", { default: true });
    }
  }

  it("models that proxy attributes do not conflict with models with generated methods", () => {
    class ModelA extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    class ModelB extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const a = new ModelA({ name: "Alice" });
    const b = new ModelB({ name: "Bob" });
    expect(a._readAttribute("name")).toBe("Alice");
    expect(b._readAttribute("name")).toBe("Bob");
  });

  it("nonexistent attribute", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const m = new MyModel({});
    expect(m.attribute("nonexistent")).toBeNull();
  });

  it("attributes with proc defaults can be marshalled", () => {
    class MyModel extends Model {
      static {
        this.attribute("tags", "string", { default: () => "default" });
      }
    }
    const m = new MyModel({});
    expect(m._readAttribute("tags")).toBe("default");
  });

  it("can't modify attributes if frozen", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const m = new MyModel({ name: "test" });
    m.freeze();
    expect(Object.isFrozen(m)).toBe(true);
    expect(() => {
      (m as any).name = "changed";
    }).toThrow(/frozen/i);
    expect(() => m._attributes.writeFromUser("name", "changed")).toThrow(/frozen/i);
  });

  it("attributes can be frozen again", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const m = new MyModel({ name: "test" });
    m.freeze();
    expect(() => m.freeze()).not.toThrow();
  });

  it(".type_for_attribute supports attribute aliases", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
        this.aliasAttribute("fullName", "name");
      }
    }
    expect(MyModel.typeForAttribute("name")).not.toBeNull();
  });

  it("properties assignment", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 30 });
    expect(p._readAttribute("name")).toBe("Alice");
    expect(p._readAttribute("age")).toBe(30);
  });

  it("reading attributes", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 30 });
    const attrs = p.attributes;
    expect(attrs.name).toBe("Alice");
    expect(attrs.age).toBe(30);
  });

  it("reading attribute names", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    expect(Person.attributeNames()).toEqual(["name", "age"]);
  });

  it("children can override parents", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string", { default: "parent" });
      }
    }
    class Child extends Parent {
      static {
        this.attribute("name", "string", { default: "child" });
      }
    }
    expect(new Child()._readAttribute("name")).toBe("child");
    expect(new Parent()._readAttribute("name")).toBe("parent");
  });

  it("attributes can be dup-ed", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    const attrs = { ...p.attributes };
    attrs.name = "Bob";
    expect(p._readAttribute("name")).toBe("Alice");
  });

  it("children inherit attributes", () => {
    class Parent extends Model {
      static {
        this.attribute("integer_field", "integer");
      }
    }
    class Child extends Parent {}
    const data = new Child({ integer_field: "4.4" });
    expect(data._readAttribute("integer_field")).toBe(4);
  });

  it("unknown type error is raised", () => {
    expect(() => {
      class BadModel extends Model {
        static {
          this.attribute("foo", "unknown_type_xyz");
        }
      }
    }).toThrow();
  });
});
