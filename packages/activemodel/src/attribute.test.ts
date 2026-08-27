/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Dirty` in its class body, the way the Rails test
   model it mirrors does; the empty class/interface merge beside it is how `include()` surfaces
   those members on the type side. */
import { include } from "@blazetrails/activesupport";
import { Dirty } from "./dirty.js";
import { describe, it, expect } from "vitest";
import { Model, Types } from "./index.js";
import "./attribute/user-provided-default.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";

describe("AttributeTest", () => {
  it("reading memoizes falsy values", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("count", "integer", { default: 0 });
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({});
    expect(m._readAttribute("count")).toBe(0);
    expect(m._readAttribute("count")).toBe(0);
  });

  it("from_user + value_for_database type casts from the user to the database", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({ age: "25" });
    expect(m._readAttribute("age")).toBe(25);
  });

  it("from_user + value_for_database uses serialize_cast_value when possible", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({ age: "25" });
    expect(m._readAttribute("age")).toBe(25);
  });

  it("value_for_database is memoized", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({ name: "test" });
    expect(m._readAttribute("name")).toBe("test");
    expect(m._readAttribute("name")).toBe("test");
  });

  it("value_for_database is recomputed when value changes in place", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({ name: "test" });
    m._writeAttribute("name", "changed");
    expect(m._readAttribute("name")).toBe("changed");
  });

  it("duping does not dup the value if it is not dupable", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("count", "integer");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({ count: 5 });
    expect(m._readAttribute("count")).toBe(5);
  });

  it("duping does not eagerly type cast if we have not yet type cast", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({});
    expect(m._readAttribute("name")).toBeNull();
  });

  it("uninitialized attributes yield their name if a block is given to value", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({});
    expect(m._readAttribute("name")).toBeNull();
  });

  it("attributes do not equal attributes with different names", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("title", "string");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({ name: "test", title: "test" });
    expect(m._readAttribute("name")).toBe("test");
    expect(m._readAttribute("title")).toBe("test");
  });

  it("attributes do not equal attributes with different types", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({ age: 25, name: "25" });
    expect(m._readAttribute("age")).toBe(25);
    expect(m._readAttribute("name")).toBe("25");
  });

  it("attributes do not equal attributes with different values", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

    const m1 = new MyModel({ name: "Alice" });
    const m2 = new MyModel({ name: "Bob" });
    expect(m1._readAttribute("name")).not.toBe(m2._readAttribute("name"));
  });

  it("attributes do not equal attributes of other classes", () => {
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

    const a = new ModelA({ name: "test" });
    const b = new ModelB({ name: "test" });
    expect(a.constructor).not.toBe(b.constructor);
  });

  it("an attribute has been read when its value is calculated", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({ name: "test" });
    expect(m._readAttribute("name")).toBe("test");
  });

  it("an attribute is not changed if it hasn't been assigned or mutated", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes, Dirty {}
    const m = new MyModel({ name: "test" });
    m.changesApplied();
    expect(m.attributeChanged("name")).toBe(false);
  });

  it("an attribute is changed if it's been assigned a new value", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes, Dirty {}
    const m = new MyModel({ name: "test" });
    m._writeAttribute("name", "changed");
    expect(m.attributeChanged("name")).toBe(true);
  });

  it("an attribute is not changed if it's assigned the same value", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes, Dirty {}
    const m = new MyModel({ name: "test" });
    m.changesApplied();
    m._writeAttribute("name", "test");
    expect(m.attributeChanged("name")).toBe(false);
  });

  it("an attribute cannot be mutated if it has not been read, and skips expensive calculations", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes, Dirty {}
    const m = new MyModel({ name: "test" });
    m.changesApplied();
    expect(m.attributeChanged("name")).toBe(false);
  });

  it("an attribute is changed if it has been mutated", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes, Dirty {}
    const m = new MyModel({ name: "test" });
    m._writeAttribute("name", "mutated");
    expect(m.attributeChanged("name")).toBe(true);
  });

  it("an attribute can forget its changes", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes, Dirty {}
    const m = new MyModel({ name: "test" });
    m._writeAttribute("name", "changed");
    expect(m.attributeChanged("name")).toBe(true);
    m.clearChangesInformation();
    expect(m.attributeChanged("name")).toBe(false);
  });

  it("#forgetting_assignment on an unchanged .from_database attribute re-deserializes its value", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes, Dirty {}
    const m = new MyModel({ name: "test" });
    m.clearChangesInformation();
    expect(m._readAttribute("name")).toBe("test");
  });

  it("with_value_from_user validates the value", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({});
    m._writeAttribute("age", "25");
    expect(m._readAttribute("age")).toBe(25);
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

  it("with_value_from_user returns a new attribute with the value from the user", () => {
    const type = Types.typeRegistry.lookup("integer");
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
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person();
    expect(p._readAttribute("name")).toBe(null);
  });

  it("attributes equal other attributes with the same constructor arguments", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const a = new Person({ name: "Alice" });
    const b = new Person({ name: "Alice" });
    expect(a.attributes).toEqual(b.attributes);
  });

  it("an attribute has not been read by default", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(p._attributes.isKey("name")).toBe(true);
    expect(p._attributes.isKey("nonexistent")).toBe(false);
  });

  it("with_type preserves mutations", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice", age: 25 });
    p._writeAttribute("name", "Bob");
    expect(p._readAttribute("name")).toBe("Bob");
    expect(p._readAttribute("age")).toBe(25);
  });

  it("value_before_type_cast returns the given value", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ age: "42" });
    expect(p._attributes.getAttribute("age").valueBeforeTypeCast).toBe("42");
    expect(p._readAttribute("age")).toBe(42);
  });
});
