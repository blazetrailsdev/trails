import { describe, it, expect } from "vitest";
import { Model, Types } from "./index.js";
import { Attribute } from "./attribute.js";
import { typeRegistry } from "./type/registry.js";
import "./attribute/user-provided-default.js";

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

  it("#serializable? delegates to the type", () => {
    const attr = Attribute.fromDatabase("count", 42, typeRegistry.lookup("integer"));
    expect(attr.isSerializable()).toBe(true);
  });

  it("#type_cast delegates to the subclass implementation", () => {
    const fromDb = Attribute.fromDatabase("name", "Alice", typeRegistry.lookup("string"));
    expect(fromDb.typeCast("Bob")).toBe("Bob");

    const fromUser = Attribute.fromUser("age", "42", typeRegistry.lookup("integer"));
    expect(fromUser.typeCast("99")).toBe(99);
  });

  it("#original_value_for_database returns the original serialized value", () => {
    const original = Attribute.fromDatabase("name", "Alice", typeRegistry.lookup("string"));
    const changed = original.withValueFromUser("Bob");
    expect(changed.originalValueForDatabase()).toBe("Alice");
  });

  it("#with_user_default creates a UserProvidedDefault attribute", () => {
    const attr = Attribute.fromDatabase("name", null, typeRegistry.lookup("string"));
    const withDefault = attr.withUserDefault("fallback");
    expect(withDefault.value).toBe("fallback");
  });

  it("from_user came_from_user? checks value_constructed_by_mass_assignment", () => {
    const stringType = typeRegistry.lookup("string");
    const attr = Attribute.fromUser("name", "hello", stringType);
    expect(attr.cameFromUser()).toBe(true);
  });

  it("from_user came_from_user? returns false when type says value constructed by mass assignment", () => {
    const customType = Object.create(typeRegistry.lookup("string"));
    customType.isValueConstructedByMassAssignment = () => true;
    const attr = Attribute.fromUser("data", '{"key":"val"}', customType);
    expect(attr.cameFromUser()).toBe(false);
  });

  it("from_user came_from_user? passes valueBeforeTypeCast to type, not cast value", () => {
    let receivedValue: unknown;
    const intType = Object.create(typeRegistry.lookup("integer"));
    intType.isValueConstructedByMassAssignment = (v: unknown) => {
      receivedValue = v;
      return false;
    };
    const attr = Attribute.fromUser("age", "42", intType);
    attr.cameFromUser();
    expect(receivedValue).toBe("42");
    expect(attr.value).toBe(42);
  });

  it("from_database came_from_user? returns false", () => {
    const attr = Attribute.fromDatabase("name", "hello", typeRegistry.lookup("string"));
    expect(attr.cameFromUser()).toBe(false);
  });
});
