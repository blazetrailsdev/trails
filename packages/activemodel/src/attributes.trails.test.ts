/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Model, ValueType } from "./index.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { include } from "@blazetrails/activesupport";

describe("Attributes#attribute_names", () => {
  class User extends Model {
    declare static attribute: AttributesClassHalf["attribute"];
    declare static attributeNames: AttributesClassHalf["attributeNames"];
    declare static typeForAttribute: AttributesClassHalf["typeForAttribute"];

    static {
      include(this, Attributes);
      this.attribute("name", "string");
      this.attribute("token", "string");
    }
  }
  interface User extends Attributes {}

  it("is the instance's @attributes keys, virtual attributes included", () => {
    expect(new User().attributeNames()).toEqual(["name", "token"]);
  });

  it("the class-level reader is attribute_types.keys, virtual attributes included", () => {
    expect(User.attributeNames()).toEqual(["name", "token"]);
  });
});

describe("Attributes type casting and defaults", () => {
  class User extends Model {
    declare static attribute: AttributesClassHalf["attribute"];
    declare static attributeNames: AttributesClassHalf["attributeNames"];

    static {
      include(this, Attributes);
      this.attribute("name", "string");
      this.attribute("age", "integer", { default: 0 });
      this.attribute("score", "float");
      this.attribute("active", "boolean", { default: true });
    }
  }
  interface User extends Attributes {}

  it("initializes with defaults", () => {
    const u = new User();
    expect(u._readAttribute("name")).toBe(null);
    expect(u._readAttribute("age")).toBe(0);
    expect(u._readAttribute("active")).toBe(true);
  });

  it("initializes with provided values", () => {
    const u = new User({ name: "dean", age: 30 });
    expect(u._readAttribute("name")).toBe("dean");
    expect(u._readAttribute("age")).toBe(30);
  });

  it("casts string to integer", () => {
    const u = new User({ age: "25" });
    expect(u._readAttribute("age")).toBe(25);
  });

  it("integer truncates floats", () => {
    const u = new User({ age: 25.9 });
    expect(u._readAttribute("age")).toBe(25);
  });

  it("casts string to float", () => {
    const u = new User({ score: "9.5" });
    expect(u._readAttribute("score")).toBe(9.5);
  });

  it("casts string to boolean", () => {
    expect(new User({ active: "false" })._readAttribute("active")).toBe(false);
    expect(new User({ active: "true" })._readAttribute("active")).toBe(true);
    expect(new User({ active: "yes" })._readAttribute("active")).toBe(true);
    expect(new User({ active: "no" })._readAttribute("active")).toBe(true);
    expect(new User({ active: "1" })._readAttribute("active")).toBe(true);
    expect(new User({ active: "0" })._readAttribute("active")).toBe(false);
    expect(new User({ active: 1 })._readAttribute("active")).toBe(true);
    expect(new User({ active: 0 })._readAttribute("active")).toBe(false);
  });

  it("casts null to null for all types", () => {
    const u = new User({ name: null, age: null, score: null, active: null });
    expect(u._readAttribute("name")).toBe(null);
    expect(u._readAttribute("age")).toBe(null);
    expect(u._readAttribute("score")).toBe(null);
    expect(u._readAttribute("active")).toBe(null);
  });

  it("writeAttribute casts the value", () => {
    const u = new User();
    u._writeAttribute("age", "42");
    expect(u._readAttribute("age")).toBe(42);
  });

  it("returns all attributes as a hash", () => {
    const u = new User({ name: "dean", age: 30 });
    expect(u.attributes).toEqual({
      name: "dean",
      age: 30,
      score: null,
      active: true,
    });
  });

  it("attributeNames returns declared names", () => {
    expect(User.attributeNames()).toEqual(["name", "age", "score", "active"]);
  });

  it("Proc default is called for each instance", () => {
    let counter = 0;
    class WithLambda extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("token", "string", { default: () => `tok_${++counter}` });
      }
    }
    interface WithLambda extends Attributes {}

    expect(new WithLambda()._readAttribute("token")).toBe("tok_1");
    expect(new WithLambda()._readAttribute("token")).toBe("tok_2");
  });

  it("inheritance: children inherit parent attributes", () => {
    class Admin extends User {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        this.attribute("role", "string", { default: "admin" });
      }
    }
    const admin = new Admin({ name: "dean" });
    expect(admin._readAttribute("name")).toBe("dean");
    expect(admin._readAttribute("role")).toBe("admin");
    expect(Admin.attributeNames()).toContain("name");
    expect(Admin.attributeNames()).toContain("role");
  });
});

describe("attributesBeforeTypeCast", () => {
  it("returns all raw attribute values", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface User extends Attributes {}

    const u = new User({ name: "Alice", age: "25" });
    const raw = u._attributes.valuesBeforeTypeCast();
    expect(raw.name).toBe("Alice");
    expect(raw.age).toBe("25");
    expect(u._readAttribute("age")).toBe(25);
  });
});

describe("typeForAttribute", () => {
  it(".type_for_attribute returns the default type when an unregistered attribute is specified", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static typeForAttribute: AttributesClassHalf["typeForAttribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes {}

    expect(User.typeForAttribute("unknown")).toBeInstanceOf(ValueType);
  });
});

describe("Attributes", () => {
  class User extends Model {
    declare static attribute: AttributesClassHalf["attribute"];
    declare static attributeNames: AttributesClassHalf["attributeNames"];

    static {
      include(this, Attributes);
      this.attribute("name", "string");
      this.attribute("age", "integer", { default: 0 });
      this.attribute("score", "float");
      this.attribute("active", "boolean", { default: true });
    }
  }
  interface User extends Attributes {}

  it("initializes with defaults", () => {
    const u = new User();
    expect(u._readAttribute("name")).toBe(null);
    expect(u._readAttribute("age")).toBe(0);
    expect(u._readAttribute("active")).toBe(true);
  });

  it("initializes with provided values", () => {
    const u = new User({ name: "dean", age: 30 });
    expect(u._readAttribute("name")).toBe("dean");
    expect(u._readAttribute("age")).toBe(30);
  });

  it("casts string to integer", () => {
    const u = new User({ age: "25" });
    expect(u._readAttribute("age")).toBe(25);
  });

  it("integer truncates floats", () => {
    const u = new User({ age: 25.9 });
    expect(u._readAttribute("age")).toBe(25);
  });

  it("casts string to float", () => {
    const u = new User({ score: "9.5" });
    expect(u._readAttribute("score")).toBe(9.5);
  });

  it("casts string to boolean", () => {
    expect(new User({ active: "false" })._readAttribute("active")).toBe(false);
    expect(new User({ active: "true" })._readAttribute("active")).toBe(true);
    expect(new User({ active: "yes" })._readAttribute("active")).toBe(true);
    expect(new User({ active: "no" })._readAttribute("active")).toBe(true);
    expect(new User({ active: "1" })._readAttribute("active")).toBe(true);
    expect(new User({ active: "0" })._readAttribute("active")).toBe(false);
    expect(new User({ active: 1 })._readAttribute("active")).toBe(true);
    expect(new User({ active: 0 })._readAttribute("active")).toBe(false);
  });

  it("casts null to null for all types", () => {
    const u = new User({ name: null, age: null, score: null, active: null });
    expect(u._readAttribute("name")).toBe(null);
    expect(u._readAttribute("age")).toBe(null);
    expect(u._readAttribute("score")).toBe(null);
    expect(u._readAttribute("active")).toBe(null);
  });

  it("writeAttribute casts the value", () => {
    const u = new User();
    u._writeAttribute("age", "42");
    expect(u._readAttribute("age")).toBe(42);
  });

  it("returns all attributes as a hash", () => {
    const u = new User({ name: "dean", age: 30 });
    expect(u.attributes).toEqual({
      name: "dean",
      age: 30,
      score: null,
      active: true,
    });
  });

  it("attributeNames returns declared names", () => {
    expect(User.attributeNames()).toEqual(["name", "age", "score", "active"]);
  });

  it("Proc default is called for each instance", () => {
    let counter = 0;
    class WithLambda extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("token", "string", { default: () => `tok_${++counter}` });
      }
    }
    interface WithLambda extends Attributes {}

    expect(new WithLambda()._readAttribute("token")).toBe("tok_1");
    expect(new WithLambda()._readAttribute("token")).toBe("tok_2");
  });

  it("inheritance: children inherit parent attributes", () => {
    class Admin extends User {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        this.attribute("role", "string", { default: "admin" });
      }
    }
    const admin = new Admin({ name: "dean" });
    expect(admin._readAttribute("name")).toBe("dean");
    expect(admin._readAttribute("role")).toBe("admin");
    expect(Admin.attributeNames()).toContain("name");
    expect(Admin.attributeNames()).toContain("role");
  });
});
