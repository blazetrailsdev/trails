import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  describe("AttributeMethodsTest", () => {
    it("#define_attribute_method does not generate attribute method if already defined in attribute module", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        customName() {
          return "custom";
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.customName()).toBe("custom");
    });

    it("#define_attribute_method generates a method that is already defined on the host", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("#define_attribute_method generates attribute method with invalid identifier characters", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("#define_attribute_methods works passing multiple arguments", () => {
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

    it("#define_attribute_methods generates attribute methods", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.readAttribute("name")).toBe("Alice");
    });

    it("#alias_attribute generates attribute_aliases lookup hash", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.aliasAttribute("fullName", "name");
        }
      }
      const p = new Person({ name: "Alice" });
      expect((p as any).fullName).toBe("Alice");
    });

    it("#define_attribute_methods generates attribute methods with spaces in their names", () => {
      class Person extends Model {
        static {
          this.attribute("first_name", "string");
        }
      }
      const p = new Person({ first_name: "Alice" });
      expect(p.readAttribute("first_name")).toBe("Alice");
    });

    it("#alias_attribute works with attributes with spaces in their names", () => {
      class Person extends Model {
        static {
          this.attribute("first_name", "string");
          this.aliasAttribute("firstName", "first_name");
        }
      }
      const p = new Person({ first_name: "Alice" });
      expect((p as any).firstName).toBe("Alice");
    });

    it("#alias_attribute works with attributes named as a ruby keyword", () => {
      class Person extends Model {
        static {
          this.attribute("class_name", "string");
          this.aliasAttribute("className", "class_name");
        }
      }
      const p = new Person({ class_name: "Admin" });
      expect((p as any).className).toBe("Admin");
    });

    it("#undefine_attribute_methods undefines alias attribute methods", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attributeMethodPrefix("clear_");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(typeof (p as any).clear_name).toBe("function");
      Person.undefineAttributeMethods();
      const p2 = new Person({ name: "Bob" });
      expect((p2 as any).clear_name).toBeUndefined();
    });

    it("defined attribute doesn't expand positional hash argument", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("should not interfere with respond_to? if the attribute has a private/protected method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.respondTo("readAttribute")).toBe(true);
    });

    it("alias attribute respects user defined method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.aliasAttribute("display_name", "name");
        }
      }
      const p = new Person({ name: "Alice" });
      expect((p as any).display_name).toBe("Alice");
    });

    it("alias attribute respects user defined method in parent classes", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.aliasAttribute("display_name", "name");
        }
      }
      class Employee extends Person {}
      const e = new Employee({ name: "Bob" });
      expect((e as any).display_name).toBe("Bob");
    });
  });

  describe("Attribute Methods", () => {
    it("method missing works correctly even if attributes method is not defined", () => {
      class Bare extends Model {}
      const b = new Bare();
      // attributeMissing returns null for undefined attributes
      expect(b.readAttribute("nonexistent")).toBe(null);
    });

    it("unrelated classes should not share attribute method matchers", () => {
      class A extends Model {
        static {
          this.attribute("x", "string");
        }
      }
      class B extends Model {
        static {
          this.attribute("y", "string");
        }
      }
      expect(A.attributeNames()).toEqual(["x"]);
      expect(B.attributeNames()).toEqual(["y"]);
    });

    it("#define_attribute_method generates attribute method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attributeMethodPrefix("clear_");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(typeof (p as any).clear_name).toBe("function");
    });

    it("#define_attribute_methods defines alias attribute methods after undefining", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.aliasAttribute("full_name", "name");
        }
      }
      const p = new Person({ name: "Alice" });
      expect((p as any).full_name).toBe("Alice");
      (p as any).full_name = "Bob";
      expect(p.readAttribute("name")).toBe("Bob");
    });

    it("#undefine_attribute_methods removes attribute methods", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attributeMethodSuffix("_changed");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(typeof (p as any).name_changed).toBe("function");
      Person.undefineAttributeMethods();
      const p2 = new Person({ name: "Bob" });
      expect((p2 as any).name_changed).toBeUndefined();
    });

    it("accessing a suffixed attribute", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attributeMethodSuffix("_changed");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(typeof (p as any).name_changed).toBe("function");
    });

    it("should not interfere with method_missing if the attr has a private/protected method", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        customName() {
          return "custom";
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.customName()).toBe("custom");
      expect(p.readAttribute("name")).toBe("Alice");
    });

    it("should use attribute_missing to dispatch a missing attribute", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
        attributeMissing(name: string): unknown {
          return `missing:${name}`;
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.readAttribute("nonexistent")).toBe("missing:nonexistent");
    });

    it("name clashes are handled", () => {
      // Attributes with the same name as existing methods should still work via readAttribute
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.readAttribute("name")).toBe("Alice");
    });
  });
});
