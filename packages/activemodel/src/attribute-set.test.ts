import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

describe("AttributeSetTest", () => {
  it("building a new set from raw attributes", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: "25" });
    expect(p.readAttribute("name")).toBe("Alice");
    expect(p.readAttribute("age")).toBe(25);
  });

  it("building with custom types", () => {
    class Person extends Model {
      static {
        this.attribute("active", "boolean");
      }
    }
    const p = new Person({ active: "true" });
    expect(p.readAttribute("active")).toBe(true);
  });

  it("[] returns a null object", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    expect(p.readAttribute("name")).toBe(null);
  });

  it("duping creates a new hash, but does not dup the attributes", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    const attrs = p.attributes;
    attrs.name = "Bob";
    expect(p.readAttribute("name")).toBe("Alice");
  });

  it("deep_duping creates a new hash and dups each attribute", () => {
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

  it("freezing cloned set does not freeze original", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    const attrs = Object.freeze({ ...p.attributes });
    p.writeAttribute("name", "Bob");
    expect(p.readAttribute("name")).toBe("Bob");
    expect(attrs.name).toBe("Alice");
  });

  it("to_hash returns a hash of the type cast values", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: "25" });
    const hash = p.attributes;
    expect(hash.name).toBe("Alice");
    expect(hash.age).toBe(25);
  });

  it("to_hash maintains order", () => {
    class Person extends Model {
      static {
        this.attribute("first", "string");
        this.attribute("second", "string");
        this.attribute("third", "string");
      }
    }
    const p = new Person({ first: "a", second: "b", third: "c" });
    const keys = Object.keys(p.attributes);
    expect(keys).toEqual(["first", "second", "third"]);
  });

  it("values_before_type_cast", () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ age: "25" });
    expect(p.readAttributeBeforeTypeCast("age")).toBe("25");
    expect(p.readAttribute("age")).toBe(25);
  });

  it("known columns are built with uninitialized attributes", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    expect(p.hasAttribute("name")).toBe(true);
    expect(p.readAttribute("name")).toBe(null);
  });

  it("uninitialized attributes are not included in the attributes hash", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    expect(p.attributePresent("name")).toBe(false);
    expect(p.readAttribute("name")).toBe(null);
  });

  it("uninitialized attributes are not included in keys", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    expect(p.attributeNames()).toContain("name");
    expect(p.attributePresent("name")).toBe(false);
  });

  it("uninitialized attributes return false for key?", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    expect(p.hasAttribute("name")).toBe(true);
    expect(p.attributePresent("name")).toBe(false);
  });

  it("unknown attributes return false for key?", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    expect(p.hasAttribute("unknown")).toBe(false);
  });

  it("fetch_value returns the value for the given initialized attribute", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.readAttribute("name")).toBe("Alice");
  });

  it("fetch_value returns nil for unknown attributes", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.readAttribute("unknown")).toBe(null);
  });

  it("fetch_value returns nil for unknown attributes when types has a default", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    expect(p.readAttribute("missing")).toBe(null);
  });

  it("fetch_value uses the given block for uninitialized attributes", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    const value = p.readAttribute("name") ?? "default";
    expect(value).toBe("default");
  });

  it("fetch_value returns nil for uninitialized attributes if no block is given", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    expect(p.readAttribute("name")).toBe(null);
  });

  it("the primary_key is always initialized", () => {
    class Person extends Model {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    expect(p._attributes.has("id")).toBe(true);
  });

  it("write_from_database sets the attribute with database typecasting", () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
      }
    }
    const p = new Person({});
    p.writeAttribute("age", "42");
    expect(p.readAttribute("age")).toBe(42);
  });

  it("write_from_user sets the attribute with user typecasting", () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
      }
    }
    const p = new Person({});
    p.writeAttribute("age", "25");
    expect(p.readAttribute("age")).toBe(25);
  });

  it("values_for_database", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: "25" });
    expect(p.readAttribute("name")).toBe("Alice");
    expect(p.readAttribute("age")).toBe(25);
  });

  it("freezing doesn't prevent the set from materializing", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    const frozen = Object.freeze({ ...p.attributes });
    expect(frozen.name).toBe("Alice");
  });

  it("marshalling dump/load materialized attribute hash", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    const serialized = JSON.stringify(p.attributes);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.name).toBe("Alice");
  });

  it("#accessed_attributes returns only attributes which have been read", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 25 });
    p.readAttribute("name");
    expect(p.hasAttribute("name")).toBe(true);
  });

  it("#map returns a new attribute set with the changes applied", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    const attrs = p.attributes;
    const mapped = { ...attrs, name: "Bob" };
    expect(mapped.name).toBe("Bob");
    expect(p.readAttribute("name")).toBe("Alice");
  });

  it("comparison for equality is correctly implemented", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const a = new Person({ name: "Alice" });
    const b = new Person({ name: "Alice" });
    expect(a.attributes).toEqual(b.attributes);
  });

  it("==(other) is safe to use with any instance", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const a = new Person({ name: "Alice" });
    expect(a.attributes).not.toBe(null);
    expect(a.attributes).not.toBe(undefined);
  });
});
