import { describe, it, expect } from "vitest";
import { Model, ValueType } from "./index.js";

describe("Attributes#attribute_names", () => {
  class User extends Model {
    static {
      this.attribute("name", "string");
      this.attribute("token", "string", { virtual: true });
    }
  }

  it("is the instance's @attributes keys, virtual attributes included", () => {
    expect(new User().attributeNames()).toEqual(["name", "token"]);
  });

  it("the class-level reader is attribute_types.keys, virtual attributes included", () => {
    expect(User.attributeNames()).toEqual(["name", "token"]);
  });
});

/**
 * trails-only tests that were interleaved with the `attributes_test.rb` mirror
 * in `attributes.test.ts`: type-casting of declared attributes, defaults,
 * inheritance of declarations, and the `attributes_before_type_cast` /
 * `type_for_attribute` readers Rails' file does not exercise.
 */
describe("Attributes type casting and defaults", () => {
  class User extends Model {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer", { default: 0 });
      this.attribute("score", "float");
      this.attribute("active", "boolean", { default: true });
    }
  }

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
    // Rails BooleanType: only FALSE_VALUES coerce to false; "yes"/"no"
    // are both truthy (not in FALSE_VALUES).
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
      static {
        this.attribute("token", "string", { default: () => `tok_${++counter}` });
      }
    }
    expect(new WithLambda()._readAttribute("token")).toBe("tok_1");
    expect(new WithLambda()._readAttribute("token")).toBe("tok_2");
  });

  it("inheritance: children inherit parent attributes", () => {
    class Admin extends User {
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
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
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
      static {
        this.attribute("name", "string");
      }
    }
    expect(User.typeForAttribute("unknown")).toBeInstanceOf(ValueType);
  });
});

describe("Attributes", () => {
  class User extends Model {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer", { default: 0 });
      this.attribute("score", "float");
      this.attribute("active", "boolean", { default: true });
    }
  }

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
    // Rails BooleanType: "yes"/"no" both truthy (neither in FALSE_VALUES).
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
      static {
        this.attribute("token", "string", { default: () => `tok_${++counter}` });
      }
    }
    expect(new WithLambda()._readAttribute("token")).toBe("tok_1");
    expect(new WithLambda()._readAttribute("token")).toBe("tok_2");
  });

  it("inheritance: children inherit parent attributes", () => {
    class Admin extends User {
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
