import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

describe("AttributesTest", () => {
  // =========================================================================
  // Phase 1000/1050 — Attributes and Type Casting
  // =========================================================================
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
    expect(u.readAttribute("name")).toBe(null);
    expect(u.readAttribute("age")).toBe(0);
    expect(u.readAttribute("active")).toBe(true);
  });

  it("initializes with provided values", () => {
    const u = new User({ name: "dean", age: 30 });
    expect(u.readAttribute("name")).toBe("dean");
    expect(u.readAttribute("age")).toBe(30);
  });

  it("casts string to integer", () => {
    const u = new User({ age: "25" });
    expect(u.readAttribute("age")).toBe(25);
  });

  it("integer truncates floats", () => {
    const u = new User({ age: 25.9 });
    expect(u.readAttribute("age")).toBe(25);
  });

  it("casts string to float", () => {
    const u = new User({ score: "9.5" });
    expect(u.readAttribute("score")).toBe(9.5);
  });

  it("casts string to boolean", () => {
    // Rails BooleanType: only FALSE_VALUES coerce to false; "yes"/"no"
    // are both truthy (not in FALSE_VALUES).
    expect(new User({ active: "false" }).readAttribute("active")).toBe(false);
    expect(new User({ active: "true" }).readAttribute("active")).toBe(true);
    expect(new User({ active: "yes" }).readAttribute("active")).toBe(true);
    expect(new User({ active: "no" }).readAttribute("active")).toBe(true);
    expect(new User({ active: "1" }).readAttribute("active")).toBe(true);
    expect(new User({ active: "0" }).readAttribute("active")).toBe(false);
    expect(new User({ active: 1 }).readAttribute("active")).toBe(true);
    expect(new User({ active: 0 }).readAttribute("active")).toBe(false);
  });

  it("casts null to null for all types", () => {
    const u = new User({ name: null, age: null, score: null, active: null });
    expect(u.readAttribute("name")).toBe(null);
    expect(u.readAttribute("age")).toBe(null);
    expect(u.readAttribute("score")).toBe(null);
    expect(u.readAttribute("active")).toBe(null);
  });

  it("writeAttribute casts the value", () => {
    const u = new User();
    u.writeAttribute("age", "42");
    expect(u.readAttribute("age")).toBe(42);
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

  it("attributePresent checks for non-blank values", () => {
    const u = new User({ name: "dean" });
    expect(u.attributePresent("name")).toBe(true);
    expect(u.attributePresent("score")).toBe(false);
  });

  it("attributePresent returns false for empty string", () => {
    const u = new User({ name: "" });
    expect(u.attributePresent("name")).toBe(false);
  });

  it("attributePresent returns false for whitespace-only string", () => {
    const u = new User({ name: "   " });
    expect(u.attributePresent("name")).toBe(false);
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
    expect(new WithLambda().readAttribute("token")).toBe("tok_1");
    expect(new WithLambda().readAttribute("token")).toBe("tok_2");
  });

  it("inheritance: children inherit parent attributes", () => {
    class Admin extends User {
      static {
        this.attribute("role", "string", { default: "admin" });
      }
    }
    const admin = new Admin({ name: "dean" });
    expect(admin.readAttribute("name")).toBe("dean");
    expect(admin.readAttribute("role")).toBe("admin");
    expect(Admin.attributeNames()).toContain("name");
    expect(Admin.attributeNames()).toContain("role");
  });
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
    expect(a.readAttribute("name")).toBe("Alice");
    expect(b.readAttribute("name")).toBe("Bob");
  });

  it("nonexistent attribute", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const m = new MyModel({});
    expect(m.readAttribute("nonexistent")).toBeNull();
  });

  it("attributes with proc defaults can be marshalled", () => {
    class MyModel extends Model {
      static {
        this.attribute("tags", "string", { default: () => "default" });
      }
    }
    const m = new MyModel({});
    expect(m.readAttribute("tags")).toBe("default");
  });

  it("can't modify attributes if frozen", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const m = new MyModel({ name: "test" });
    // Freeze the entire model instance
    const frozen = Object.freeze({ ...m.attributes });
    expect(() => {
      (frozen as any).name = "changed";
    }).toThrow();
  });

  it("attributes can be frozen again", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const m = new MyModel({ name: "test" });
    Object.freeze(m._attributes);
    expect(() => Object.freeze(m._attributes)).not.toThrow();
  });

  it(".type_for_attribute supports attribute aliases", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
        this.aliasAttribute("fullName", "name");
      }
    }
    const m = new MyModel({ name: "test" });
    expect(m.typeForAttribute("name")).not.toBeNull();
  });

  it("properties assignment", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 30 });
    expect(p.readAttribute("name")).toBe("Alice");
    expect(p.readAttribute("age")).toBe(30);
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
    expect(new Child().readAttribute("name")).toBe("child");
    expect(new Parent().readAttribute("name")).toBe("parent");
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
    expect(p.readAttribute("name")).toBe("Alice");
  });

  it("children inherit attributes", () => {
    class Parent extends Model {
      static {
        this.attribute("integer_field", "integer");
      }
    }
    class Child extends Parent {}
    const data = new Child({ integer_field: "4.4" });
    expect(data.readAttribute("integer_field")).toBe(4);
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
describe("normalizes", () => {
  it("applies normalization on write", () => {
    class User extends Model {
      static {
        this.attribute("email", "string");
        this.normalizes("email", (v: unknown) =>
          typeof v === "string" ? v.trim().toLowerCase() : v,
        );
      }
    }

    const u = new User({ email: "  Alice@Example.COM  " });
    expect(u.readAttribute("email")).toBe("alice@example.com");
  });

  it("applies normalization on subsequent writeAttribute", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.normalizes("name", (v: unknown) => (typeof v === "string" ? v.trim() : v));
      }
    }

    const u = new User({ name: "Alice" });
    u.writeAttribute("name", "  Bob  ");
    expect(u.readAttribute("name")).toBe("Bob");
  });

  it("supports multiple attributes", () => {
    class User extends Model {
      static {
        this.attribute("first_name", "string");
        this.attribute("last_name", "string");
        this.normalizes("first_name", "last_name", (v: unknown) =>
          typeof v === "string" ? v.toUpperCase() : v,
        );
      }
    }

    const u = new User({ first_name: "alice", last_name: "smith" });
    expect(u.readAttribute("first_name")).toBe("ALICE");
    expect(u.readAttribute("last_name")).toBe("SMITH");
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
    const raw = u.attributesBeforeTypeCast;
    expect(raw.name).toBe("Alice");
    expect(raw.age).toBe("25"); // raw, not cast to integer
    expect(u.readAttribute("age")).toBe(25); // cast version
  });
});

describe("columnForAttribute()", () => {
  it("returns type info for defined attribute", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const u = new User({ name: "Alice", age: 25 });
    const col = u.columnForAttribute("name");
    expect(col).not.toBeNull();
    expect(col!.name).toBe("name");

    const ageCol = u.columnForAttribute("age");
    expect(ageCol).not.toBeNull();
    expect(ageCol!.name).toBe("age");
  });

  it("returns null for unknown attribute", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "Alice" });
    expect(u.columnForAttribute("nonexistent")).toBeNull();
  });
});

describe("typeForAttribute", () => {
  it(".type_for_attribute returns the default type when an unregistered attribute is specified", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "Alice" });
    expect(u.typeForAttribute("unknown")).toBeNull();
  });
});

describe("nullifyBlanks()", () => {
  it("converts blank strings to null for specified attributes", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("bio", "string");
        this.nullifyBlanks("name");
      }
    }
    const u = new User({ name: "  ", bio: "  " });
    expect(u.readAttribute("name")).toBeNull();
    expect(u.readAttribute("bio")).toBe("  "); // not nullified
  });

  it("nullifies all string attrs when called with no arguments", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.nullifyBlanks();
      }
    }
    const u = new User({ name: "", email: "" });
    expect(u.readAttribute("name")).toBeNull();
    expect(u.readAttribute("email")).toBeNull();
  });

  it("nullifies on writeAttribute too", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.nullifyBlanks("name");
      }
    }
    const u = new User({ name: "Alice" });
    u.writeAttribute("name", "");
    expect(u.readAttribute("name")).toBeNull();
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
    expect(u.readAttribute("name")).toBe(null);
    expect(u.readAttribute("age")).toBe(0);
    expect(u.readAttribute("active")).toBe(true);
  });

  it("initializes with provided values", () => {
    const u = new User({ name: "dean", age: 30 });
    expect(u.readAttribute("name")).toBe("dean");
    expect(u.readAttribute("age")).toBe(30);
  });

  it("casts string to integer", () => {
    const u = new User({ age: "25" });
    expect(u.readAttribute("age")).toBe(25);
  });

  it("integer truncates floats", () => {
    const u = new User({ age: 25.9 });
    expect(u.readAttribute("age")).toBe(25);
  });

  it("casts string to float", () => {
    const u = new User({ score: "9.5" });
    expect(u.readAttribute("score")).toBe(9.5);
  });

  it("casts string to boolean", () => {
    // Rails BooleanType: "yes"/"no" both truthy (neither in FALSE_VALUES).
    expect(new User({ active: "false" }).readAttribute("active")).toBe(false);
    expect(new User({ active: "true" }).readAttribute("active")).toBe(true);
    expect(new User({ active: "yes" }).readAttribute("active")).toBe(true);
    expect(new User({ active: "no" }).readAttribute("active")).toBe(true);
    expect(new User({ active: "1" }).readAttribute("active")).toBe(true);
    expect(new User({ active: "0" }).readAttribute("active")).toBe(false);
    expect(new User({ active: 1 }).readAttribute("active")).toBe(true);
    expect(new User({ active: 0 }).readAttribute("active")).toBe(false);
  });

  it("casts null to null for all types", () => {
    const u = new User({ name: null, age: null, score: null, active: null });
    expect(u.readAttribute("name")).toBe(null);
    expect(u.readAttribute("age")).toBe(null);
    expect(u.readAttribute("score")).toBe(null);
    expect(u.readAttribute("active")).toBe(null);
  });

  it("writeAttribute casts the value", () => {
    const u = new User();
    u.writeAttribute("age", "42");
    expect(u.readAttribute("age")).toBe(42);
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

  it("attributePresent checks for non-blank values", () => {
    const u = new User({ name: "dean" });
    expect(u.attributePresent("name")).toBe(true);
    expect(u.attributePresent("score")).toBe(false);
  });

  it("attributePresent returns false for empty string", () => {
    const u = new User({ name: "" });
    expect(u.attributePresent("name")).toBe(false);
  });

  it("attributePresent returns false for whitespace-only string", () => {
    const u = new User({ name: "   " });
    expect(u.attributePresent("name")).toBe(false);
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
    expect(new WithLambda().readAttribute("token")).toBe("tok_1");
    expect(new WithLambda().readAttribute("token")).toBe("tok_2");
  });

  it("inheritance: children inherit parent attributes", () => {
    class Admin extends User {
      static {
        this.attribute("role", "string", { default: "admin" });
      }
    }
    const admin = new Admin({ name: "dean" });
    expect(admin.readAttribute("name")).toBe("dean");
    expect(admin.readAttribute("role")).toBe("admin");
    expect(Admin.attributeNames()).toContain("name");
    expect(Admin.attributeNames()).toContain("role");
  });
});
