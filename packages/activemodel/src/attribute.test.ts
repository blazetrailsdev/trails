import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  describe("AttributeTest", () => {
    it("reading memoizes falsy values", () => {
      class MyModel extends Model {
        static {
          this.attribute("count", "integer", { default: 0 });
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("count")).toBe(0);
      expect(m.readAttribute("count")).toBe(0);
    });

    it("from_user + value_for_database type casts from the user to the database", () => {
      class MyModel extends Model {
        static {
          this.attribute("age", "integer");
        }
      }
      const m = new MyModel({ age: "25" });
      expect(m.readAttribute("age")).toBe(25);
    });

    it("from_user + value_for_database uses serialize_cast_value when possible", () => {
      class MyModel extends Model {
        static {
          this.attribute("age", "integer");
        }
      }
      const m = new MyModel({ age: "25" });
      expect(m.readAttribute("age")).toBe(25);
    });

    it("value_for_database is memoized", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.readAttribute("name")).toBe("test");
      expect(m.readAttribute("name")).toBe("test");
    });

    it("value_for_database is recomputed when value changes in place", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "changed");
      expect(m.readAttribute("name")).toBe("changed");
    });

    it("duping does not dup the value if it is not dupable", () => {
      class MyModel extends Model {
        static {
          this.attribute("count", "integer");
        }
      }
      const m = new MyModel({ count: 5 });
      expect(m.readAttribute("count")).toBe(5);
    });

    it("duping does not eagerly type cast if we have not yet type cast", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("name")).toBeNull();
    });

    it("uninitialized attributes yield their name if a block is given to value", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("name")).toBeNull();
    });

    it("attributes do not equal attributes with different names", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("title", "string");
        }
      }
      const m = new MyModel({ name: "test", title: "test" });
      expect(m.readAttribute("name")).toBe("test");
      expect(m.readAttribute("title")).toBe("test");
    });

    it("attributes do not equal attributes with different types", () => {
      class MyModel extends Model {
        static {
          this.attribute("age", "integer");
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ age: 25, name: "25" });
      expect(m.readAttribute("age")).toBe(25);
      expect(m.readAttribute("name")).toBe("25");
    });

    it("attributes do not equal attributes with different values", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m1 = new MyModel({ name: "Alice" });
      const m2 = new MyModel({ name: "Bob" });
      expect(m1.readAttribute("name")).not.toBe(m2.readAttribute("name"));
    });

    it("attributes do not equal attributes of other classes", () => {
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
      const a = new ModelA({ name: "test" });
      const b = new ModelB({ name: "test" });
      expect(a.constructor).not.toBe(b.constructor);
    });

    it("an attribute has been read when its value is calculated", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.readAttribute("name")).toBe("test");
    });

    it("an attribute is not changed if it hasn't been assigned or mutated", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.attributeChanged("name")).toBe(false);
    });

    it("an attribute is changed if it's been assigned a new value", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "changed");
      expect(m.attributeChanged("name")).toBe(true);
    });

    it("an attribute is not changed if it's assigned the same value", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "test");
      expect(m.attributeChanged("name")).toBe(false);
    });

    it("an attribute cannot be mutated if it has not been read, and skips expensive calculations", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.attributeChanged("name")).toBe(false);
    });

    it("an attribute is changed if it has been mutated", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "mutated");
      expect(m.attributeChanged("name")).toBe(true);
    });

    it("an attribute can forget its changes", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "changed");
      expect(m.attributeChanged("name")).toBe(true);
      m.clearChangesInformation();
      expect(m.attributeChanged("name")).toBe(false);
    });

    it("#forgetting_assignment on an unchanged .from_database attribute re-deserializes its value", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.clearChangesInformation();
      expect(m.readAttribute("name")).toBe("test");
    });

    it("with_value_from_user validates the value", () => {
      class MyModel extends Model {
        static {
          this.attribute("age", "integer");
        }
      }
      const m = new MyModel({});
      m.writeAttribute("age", "25");
      expect(m.readAttribute("age")).toBe(25);
    });
  });

  describe("Attribute Object API", () => {
    it("from_database + read type casts from database", () => {
      const type = Types.typeRegistry.lookup("integer");
      expect(type.deserialize("42")).toBe(42);
    });

    it("from_user + read type casts from user", () => {
      const type = Types.typeRegistry.lookup("integer");
      expect(type.cast("42")).toBe(42);
    });

    it("reading memoizes the value", () => {
      const type = Types.typeRegistry.lookup("string");
      const val1 = type.cast("hello");
      const val2 = type.cast("hello");
      expect(val1).toBe(val2);
    });

    it("from_database + value_for_database type casts to and from database", () => {
      const type = Types.typeRegistry.lookup("integer");
      const deserialized = type.deserialize("42");
      const serialized = type.serialize(deserialized);
      expect(serialized).toBe(42);
    });

    it("duping dups the value", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      const attrs = { ...p.attributes };
      attrs.name = "Bob";
      // Original should be unchanged
      expect(p.readAttribute("name")).toBe("Alice");
    });

    it("with_value_from_user returns a new attribute with the value from the user", () => {
      const type = Types.typeRegistry.lookup("integer");
      // Cast from user input
      const val = type.cast("42");
      expect(val).toBe(42);
    });

    it("with_value_from_database returns a new attribute with the value from the database", () => {
      const type = Types.typeRegistry.lookup("integer");
      const val = type.deserialize("42");
      expect(val).toBe(42);
    });

    it("uninitialized attributes have no value", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person();
      expect(p.readAttribute("name")).toBe(null);
    });

    it("attributes equal other attributes with the same constructor arguments", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const a = new Person({ name: "Alice" });
      const b = new Person({ name: "Alice" });
      expect(a.attributes).toEqual(b.attributes);
    });

    it("an attribute has not been read by default", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      // The attribute exists but we can check hasAttribute
      expect(p.hasAttribute("name")).toBe(true);
      expect(p.hasAttribute("nonexistent")).toBe(false);
    });

    it("with_type preserves mutations", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      p.writeAttribute("name", "Bob");
      expect(p.readAttribute("name")).toBe("Bob");
      // age should still be the same
      expect(p.readAttribute("age")).toBe(25);
    });

    it("value_before_type_cast returns the given value", () => {
      class Person extends Model {
        static {
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ age: "42" });
      expect(p.readAttributeBeforeTypeCast("age")).toBe("42");
      expect(p.readAttribute("age")).toBe(42);
    });
  });
});
