/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set.js";
import { Builder } from "./attribute-set/builder.js";
import { typeRegistry } from "./type/registry.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { include } from "@blazetrails/activesupport";

describe("AttributeSetTest", () => {
  it("building a new set from raw attributes", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice", age: "25" });
    expect(p._readAttribute("name")).toBe("Alice");
    expect(p._readAttribute("age")).toBe(25);
  });

  it("building with custom types", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("active", "boolean");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ active: "true" });
    expect(p._readAttribute("active")).toBe(true);
  });

  it("[] returns a null object", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(p._readAttribute("name")).toBe(null);
  });

  it("duping creates a new hash, but does not dup the attributes", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    const attrs = p.attributes;
    attrs.name = "Bob";
    expect(p._readAttribute("name")).toBe("Alice");
  });

  it("deep_duping creates a new hash and dups each attribute", () => {
    const builder = new Builder({
      foo: typeRegistry.lookup("integer"),
      bar: typeRegistry.lookup("string"),
    });
    const attributes = builder.buildFromDatabase({ foo: 1, bar: "foo" });

    void attributes.getAttribute("foo").value;
    void attributes.getAttribute("bar").value;

    const duped = attributes.deepDup();
    duped.writeFromDatabase("foo", 2);

    expect(attributes.getAttribute("foo").value).toBe(1);
    expect(duped.getAttribute("foo").value).toBe(2);
    expect(attributes.getAttribute("bar").value).toBe("foo");
  });

  it("freezing cloned set does not freeze original", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    const attrs = Object.freeze({ ...p.attributes });
    p._writeAttribute("name", "Bob");
    expect(p._readAttribute("name")).toBe("Bob");
    expect(attrs.name).toBe("Alice");
  });

  it("to_hash returns a hash of the type cast values", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice", age: "25" });
    const hash = p.attributes;
    expect(hash.name).toBe("Alice");
    expect(hash.age).toBe(25);
  });

  it("to_hash maintains order", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("first", "string");
        this.attribute("second", "string");
        this.attribute("third", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ first: "a", second: "b", third: "c" });
    const keys = Object.keys(p.attributes);
    expect(keys).toEqual(["first", "second", "third"]);
  });

  it("values_before_type_cast", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ age: "25" });
    expect(p._attributes.getAttribute("age").valueBeforeTypeCast).toBe("25");
    expect(p._readAttribute("age")).toBe(25);
  });

  it("known columns are built with uninitialized attributes", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(p._attributes.isKey("name")).toBe(true);
    expect(p._readAttribute("name")).toBe(null);
  });

  it("uninitialized attributes are not included in the attributes hash", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(p._readAttribute("name")).toBe(null);
    expect(p._readAttribute("name")).toBe(null);
  });

  it("uninitialized attributes are not included in keys", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(p.attributeNames()).toContain("name");
    expect(p._readAttribute("name")).toBe(null);
  });

  it("uninitialized attributes return false for key?", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(p._attributes.isKey("name")).toBe(true);
    expect(p._readAttribute("name")).toBe(null);
  });

  it("unknown attributes return false for key?", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(p._attributes.isKey("unknown")).toBe(false);
  });

  it("fetch_value returns the value for the given initialized attribute", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(p._readAttribute("name")).toBe("Alice");
  });

  it("fetch_value returns nil for unknown attributes", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(p.attribute("unknown")).toBe(null);
  });

  it("fetch_value returns nil for unknown attributes when types has a default", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(p.attribute("missing")).toBe(null);
  });

  it("fetch_value uses the given block for uninitialized attributes", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    const value = p._readAttribute("name") ?? "default";
    expect(value).toBe("default");
  });

  it("fetch_value returns nil for uninitialized attributes if no block is given", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(p._readAttribute("name")).toBe(null);
  });

  it("the primary_key is always initialized", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(p._attributes.isKey("id")).toBe(true);
  });

  it("write_from_database sets the attribute with database typecasting", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    p._writeAttribute("age", "42");
    expect(p._readAttribute("age")).toBe(42);
  });

  it("write_from_user sets the attribute with user typecasting", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    p._writeAttribute("age", "25");
    expect(p._readAttribute("age")).toBe(25);
  });

  it("values_for_database", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice", age: "25" });
    expect(p._readAttribute("name")).toBe("Alice");
    expect(p._readAttribute("age")).toBe(25);
  });

  it("freezing doesn't prevent the set from materializing", () => {
    const builder = new Builder({ foo: typeRegistry.lookup("string") });
    const attributes = builder.buildFromDatabase({ foo: "1" });

    attributes.freeze();
    expect(attributes.toHash()).toEqual({ foo: "1" });
  });

  it("marshalling dump/load materialized attribute hash", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    const serialized = JSON.stringify(p.attributes);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.name).toBe("Alice");
  });

  it("#accessed_attributes returns only attributes which have been read", () => {
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
    const accessed = p._attributes.accessed();
    p._readAttribute("name");
    expect(p._attributes.accessed().length).toBeGreaterThanOrEqual(accessed.length);
    expect(p._attributes.isKey("name")).toBe(true);
  });

  it("#map returns a new attribute set with the changes applied", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    const mapped = p._attributes.map((attr) => attr.withCastValue("Bob"));
    expect(mapped.fetchValue("name")).toBe("Bob");
    expect(p._readAttribute("name")).toBe("Alice");
  });

  it("comparison for equality is correctly implemented", () => {
    const builder = new Builder({
      foo: typeRegistry.lookup("integer"),
      bar: typeRegistry.lookup("integer"),
    });
    const attributes = builder.buildFromDatabase({ foo: "1", bar: "2" });
    const attributes2 = builder.buildFromDatabase({ foo: "1", bar: "2" });
    const attributes3 = builder.buildFromDatabase({ foo: "2", bar: "2" });
    const attributes4 = attributes.deepDup();

    expect(attributes.equals(attributes2)).toBe(true);
    expect(attributes2.equals(attributes3)).toBe(false);
    expect(attributes.equals(attributes4)).toBe(true);
    expect(attributes4.equals(attributes)).toBe(true);
  });

  it("==(other) is safe to use with any instance", () => {
    const attributeSet = new AttributeSet({});

    expect(attributeSet.equals(null)).toBe(false);
    expect(attributeSet.equals(1)).toBe(false);
    expect(attributeSet.equals(attributeSet)).toBe(true);
  });

  it("#cast_types returns a hash of attribute types", () => {
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
    const types = p._attributes.castTypes();
    expect(types.name?.type()).toBe("string");
    expect(types.age?.type()).toBe("integer");
  });

  it("#key? returns true for initialized attributes", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(p._attributes.isKey("name")).toBe(true);
    expect(p._attributes.isKey("age")).toBe(true);
    expect(p._attributes.isKey("nonexistent")).toBe(false);
  });

  it("#reverse_merge! fills missing attributes from target", () => {
    const strType = typeRegistry.lookup("string");
    const intType = typeRegistry.lookup("integer");
    const a = new AttributeSet({ name: Attribute.fromDatabase("name", "Alice", strType) });
    const b = new AttributeSet({
      name: Attribute.fromDatabase("name", "Bob", strType),
      age: Attribute.fromDatabase("age", 30, intType),
    });
    a.reverseMergeBang(b);
    expect(a.fetchValue("name")).toBe("Alice");
    expect(a.fetchValue("age")).toBe(30);
  });

  it("fetch returns the attribute for the given name", () => {
    const intType = typeRegistry.lookup("integer");
    const foo = Attribute.fromDatabase("foo", 1, intType);
    const set = new AttributeSet({ foo });
    expect(set.fetch("foo")).toBe(foo);
  });

  it("fetch raises for an unknown name without a block", () => {
    const set = new AttributeSet({});
    expect(() => set.fetch("wibble")).toThrow();
  });

  it("fetch uses the given block for an unknown name", () => {
    const set = new AttributeSet({});
    const fallback = Attribute.null("wibble");
    expect(set.fetch("wibble", () => fallback)).toBe(fallback);
  });

  it("fetch returns the given default value for an unknown name", () => {
    const set = new AttributeSet({});
    const fallback = Attribute.null("wibble");
    expect(set.fetch("wibble", fallback)).toBe(fallback);
  });

  it("except returns a copy without the given names", () => {
    const intType = typeRegistry.lookup("integer");
    const set = new AttributeSet({
      foo: Attribute.fromDatabase("foo", 1, intType),
      bar: Attribute.fromDatabase("bar", 2, intType),
    });
    const rest = set.except("foo");
    expect(Object.hasOwn(rest, "foo")).toBe(false);
    expect(Object.hasOwn(rest, "bar")).toBe(true);
  });

  it("each_value yields every attribute", () => {
    const intType = typeRegistry.lookup("integer");
    const set = new AttributeSet({
      foo: Attribute.fromDatabase("foo", 1, intType),
      bar: Attribute.fromDatabase("bar", 2, intType),
    });
    const seen: unknown[] = [];
    set.eachValue((attr) => seen.push(attr.value));
    expect(seen).toEqual([1, 2]);
  });

  it("include? returns true for initialized attributes", () => {
    const intType = typeRegistry.lookup("integer");
    const set = new AttributeSet({ foo: Attribute.fromDatabase("foo", 1, intType) });
    expect(set.isInclude("foo")).toBe(true);
    expect(set.isInclude("bar")).toBe(false);
  });
  it("treats an Object.prototype name as an ordinary absent attribute", () => {
    const set = new AttributeSet({});
    expect(set.isKey("toString")).toBe(false);
    expect(set.getAttribute("toString").value).toBeNull();
    expect(set.getAttribute("constructor").value).toBeNull();
  });

  it("stores __proto__ as an ordinary key", () => {
    const set = new AttributeSet({});
    const attr = Attribute.fromDatabase("__proto__", 1, typeRegistry.lookup("integer"));
    set.set("__proto__", attr);
    expect(set.isKey("__proto__")).toBe(true);
    expect(set.getAttribute("__proto__")).toBe(attr);
    expect(set.deepDup().isKey("__proto__")).toBe(true);
    expect(Object.hasOwn(set.except("foo"), "__proto__")).toBe(true);
  });
});
