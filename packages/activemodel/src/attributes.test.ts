/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { include } from "@blazetrails/activesupport";

describe("AttributesTest", () => {
  class User extends Model {
    declare static attribute: AttributesClassHalf["attribute"];

    static {
      include(this, Attributes);
      this.attribute("name", "string");
      this.attribute("age", "integer", { default: 0 });
      this.attribute("score", "float");
      this.attribute("active", "boolean", { default: true });
    }
  }
  interface User extends Attributes {}

  it("models that proxy attributes do not conflict with models with generated methods", () => {
    class ModelA extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface ModelA extends Attributes {}

    class ModelB extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }

    interface ModelB extends Attributes {}

    const a = new ModelA({ name: "Alice" });
    const b = new ModelB({ name: "Bob" });
    expect(a._readAttribute("name")).toBe("Alice");
    expect(b._readAttribute("name")).toBe("Bob");
  });

  it("nonexistent attribute", () => {
    class MyModel extends Model {
      declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
      declare static attribute: AttributesClassHalf["attribute"];
      declare static typeForAttribute: AttributesClassHalf["typeForAttribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({});
    expect(m.attribute("nonexistent")).toBeNull();
  });

  it("attributes with proc defaults can be marshalled", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("tags", "string", { default: () => "default" });
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({});
    expect(m._readAttribute("tags")).toBe("default");
  });

  it("can't modify attributes if frozen", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

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
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({ name: "test" });
    m.freeze();
    expect(() => m.freeze()).not.toThrow();
  });

  it(".type_for_attribute supports attribute aliases", () => {
    class MyModel extends Model {
      declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
      declare static attribute: AttributesClassHalf["attribute"];
      declare static typeForAttribute: AttributesClassHalf["typeForAttribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.aliasAttribute("fullName", "name");
      }
    }
    interface MyModel extends Attributes {}

    expect(MyModel.typeForAttribute("name")).not.toBeNull();
  });

  it("properties assignment", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice", age: 30 });
    expect(p._readAttribute("name")).toBe("Alice");
    expect(p._readAttribute("age")).toBe(30);
  });

  it("reading attributes", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice", age: 30 });
    const attrs = p.attributes;
    expect(attrs.name).toBe("Alice");
    expect(attrs.age).toBe(30);
  });

  it("reading attribute names", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    expect(Person.attributeNames()).toEqual(["name", "age"]);
  });

  it("children can override parents", () => {
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string", { default: "parent" });
      }
    }
    interface Parent extends Attributes {}

    class Child extends Parent {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        this.attribute("name", "string", { default: "child" });
      }
    }
    expect(new Child()._readAttribute("name")).toBe("child");
    expect(new Parent()._readAttribute("name")).toBe("parent");
  });

  it("attributes can be dup-ed", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    const attrs = { ...p.attributes };
    attrs.name = "Bob";
    expect(p._readAttribute("name")).toBe("Alice");
  });

  it("children inherit attributes", () => {
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("integer_field", "integer");
      }
    }
    interface Parent extends Attributes {}

    class Child extends Parent {}
    const data = new Child({ integer_field: "4.4" });
    expect(data._readAttribute("integer_field")).toBe(4);
  });

  it("unknown type error is raised", () => {
    expect(() => {
      class BadModel extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("foo", "unknown_type_xyz");
        }
      }
      interface BadModel extends Attributes {}
    }).toThrow();
  });
});
