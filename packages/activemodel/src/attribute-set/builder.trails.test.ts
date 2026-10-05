import { describe, it, expect } from "vitest";
import { Builder, LazyAttributeSet, LazyAttributeHash } from "./builder.js";
import { Attribute } from "../attribute.js";
import { hasKey, hashAref, keys } from "@blazetrails/ruby-compat";
import { registry } from "../type.js";

const typeRegistry = registry();

describe("Builder", () => {
  const strType = typeRegistry.lookup("string");

  it("buildFromDatabase creates initialized attributes for present values", () => {
    const types = { name: strType };
    const builder = new Builder(types);
    const set = builder.buildFromDatabase({ name: "Alice" });
    expect(set.fetchValue("name")).toBe("Alice");
  });

  it("buildFromDatabase creates uninitialized attributes for absent values", () => {
    const types = { name: strType };
    const builder = new Builder(types);
    const set = builder.buildFromDatabase({});
    expect(set.getAttribute("name").isInitialized()).toBe(false);
  });
});

describe("LazyAttributeSet", () => {
  const strType = typeRegistry.lookup("string");
  const intType = typeRegistry.lookup("integer");

  it("only materializes an attribute when it is first read", () => {
    const types = { name: strType };
    const lazy = new LazyAttributeSet({ name: "Alice" }, types, {}, {});
    expect(Object.keys((lazy as any)._attributes as object)).toHaveLength(0);
    expect(lazy.fetchValue("name")).toBe("Alice");
    expect(lazy.keys()).toEqual(["name"]);
    expect(Object.hasOwn((lazy as any)._attributes as object, "name")).toBe(true);
  });

  it("key? reports values, types and materialized attributes", () => {
    const types = { name: strType };
    const lazy = new LazyAttributeSet({ score: "42" }, types, {}, {});
    expect(lazy.isKey("score")).toBe(true);
    expect(lazy.isKey("name")).toBe(false);
    expect(lazy.isKey("missing")).toBe(false);
  });

  it("uses additional_types over the declared type", () => {
    const types = { score: strType };
    const additional = { score: intType };
    const lazy = new LazyAttributeSet({ score: "42" }, types, additional, {});
    expect(lazy.fetchValue("score")).toBe(42);
  });

  it("falls back to a default attribute when the value is absent", () => {
    const types = { status: strType };
    const defaults = { status: Attribute.fromDatabase("status", "draft", strType) };
    const lazy = new LazyAttributeSet({}, types, {}, defaults);
    expect(lazy.fetchValue("status")).toBe("draft");
  });

  it("returns an uninitialized attribute for a known type with no value or default", () => {
    const types = { name: strType };
    const lazy = new LazyAttributeSet({}, types, {}, {});
    expect(lazy.getAttribute("name").isInitialized()).toBe(false);
    expect(lazy.keys()).toEqual([]);
  });

  it("returns a null attribute for an unknown name", () => {
    const lazy = new LazyAttributeSet({}, {}, {}, {});
    expect(lazy.fetchValue("nope")).toBe(null);
  });

  it("reads a name Object.prototype answers as an ordinary key", () => {
    const lazy = new LazyAttributeSet({ constructor: "Alice" }, { constructor: strType }, {}, {});
    expect(lazy.fetchValue("constructor")).toBe("Alice");
    expect(new LazyAttributeSet({}, {}, {}, {}).fetchValue("toString")).toBe(null);
  });

  describe("over an indexed row", () => {
    class IndexedRow {
      constructor(
        private readonly columnIndexes: Record<string, number>,
        private readonly row: unknown[],
      ) {}
      isKey(column: string) {
        return Object.hasOwn(this.columnIndexes, column);
      }
      keys() {
        return Object.keys(this.columnIndexes);
      }
      eachKey(block: (key: string) => void) {
        Object.keys(this.columnIndexes).forEach(block);
      }
      fetch(column: string, block?: () => unknown) {
        return this.isKey(column) ? this.row[this.columnIndexes[column]] : block?.();
      }
    }
    function indexedRow(columnIndexes: Record<string, number>, row: unknown[]) {
      return new IndexedRow(columnIndexes, row) as unknown as Record<string, unknown>;
    }

    it("reads present values through fetch and casts them", () => {
      const types = { name: strType, age: intType };
      const lazy = new LazyAttributeSet(
        indexedRow({ name: 0, age: 1 }, ["Alice", "30"]),
        types,
        {},
        {},
      );
      expect(lazy.fetchValue("age")).toBe(30);
      expect(lazy.getAttribute("name").valueBeforeTypeCast).toBe("Alice");
      expect(lazy.isKey("name")).toBe(true);
    });

    it("keeps a stored null distinct from an absent column", () => {
      const types = { name: strType, status: strType };
      const defaults = { status: Attribute.fromDatabase("status", "draft", strType) };
      const lazy = new LazyAttributeSet(indexedRow({ name: 0 }, [null]), types, {}, defaults);
      expect(lazy.getAttribute("name").isInitialized()).toBe(true);
      expect(lazy.fetchValue("name")).toBe(null);
      expect(lazy.fetchValue("status")).toBe("draft");
    });

    it("unions the row's keys with the typed ones and materializes both", () => {
      const types = { name: strType, missing: strType };
      const lazy = new LazyAttributeSet(
        indexedRow({ extra: 0, name: 1 }, [1, "Alice"]),
        types,
        { extra: intType },
        {},
      );
      expect(lazy.keys()).toEqual(["extra", "name"]);
      expect(lazy.isKey("missing")).toBe(false);
      expect(lazy.toHash()).toEqual({ extra: 1, name: "Alice" });
    });
  });
});

describe("LazyAttributeHash", () => {
  const strType = typeRegistry.lookup("string");
  const intType = typeRegistry.lookup("integer");

  it("delegateHash returns an empty map before any access", () => {
    const hash = new LazyAttributeHash({ name: strType }, {});
    expect(keys(hash.delegateHash()).length).toBe(0);
  });

  it("delegateHash reflects materialized entries after []", () => {
    const hash = new LazyAttributeHash({ name: strType }, { name: "Bob" });
    hash.get("name");
    expect(hasKey(hash.delegateHash(), "name")).toBe(true);
  });

  it("assignDefaultValue materializes from the value/type tables", () => {
    const hash = new LazyAttributeHash({ age: intType }, { age: "42" });
    const attr = hash.assignDefaultValue("age");
    expect(attr!.value()).toBe(42);
  });

  it("assignDefaultValue answers undefined for a name in neither values nor types", () => {
    const hash = new LazyAttributeHash({}, {});
    expect(hash.assignDefaultValue("missing")).toBeUndefined();
    expect(hash.get("missing")).toBeUndefined();
    expect(hasKey(hash.delegateHash(), "missing")).toBe(false);
  });

  it("transform_values materializes and maps every attribute", () => {
    const hash = new LazyAttributeHash({ age: intType }, { age: "42" });
    const result = hash.transformValues((attr) => attr);
    expect((hashAref(result, "age") as Attribute).value()).toBe(42);
  });

  it("transform_values is generic over the block result", () => {
    const hash = new LazyAttributeHash({ age: intType }, { age: "42" });
    const result = hash.transformValues((attr) => attr.type);
    expect(hashAref(result, "age")).toBe(intType);
  });

  it("each_value yields every materialized attribute", () => {
    const hash = new LazyAttributeHash(
      { age: intType, name: strType },
      { age: "42", name: "Alice" },
    );
    const seen: unknown[] = [];
    hash.eachValue((attr) => seen.push(attr.value()));
    expect(seen).toContain(42);
    expect(seen).toContain("Alice");
  });

  it("fetch returns the materialized attribute for the given name", () => {
    const hash = new LazyAttributeHash({ age: intType }, { age: "42" });
    expect(hash.fetch("age").value()).toBe(42);
  });

  it("fetch raises for an unknown name without a block", () => {
    const hash = new LazyAttributeHash({}, {});
    expect(() => hash.fetch("missing")).toThrow();
  });

  it("fetch returns the given default value for an unknown name", () => {
    const hash = new LazyAttributeHash({}, {});
    const fallback = Attribute.null("missing");
    expect(hash.fetch("missing", fallback)).toBe(fallback);
  });

  it("key? reports the delegate hash, values and types", () => {
    const hash = new LazyAttributeHash({ age: intType, name: strType }, { age: "42" });
    expect(hash.isKey("age")).toBe(true);
    expect(hash.isKey("name")).toBe(true);
    expect(hash.isKey("missing")).toBe(false);
  });

  it("treats an Object.prototype name as an ordinary absent key", () => {
    const hash = new LazyAttributeHash({}, {});
    expect(hash.isKey("toString")).toBe(false);
    expect(hash.get("toString")).toBeUndefined();
    expect(hash.get("constructor")).toBeUndefined();
  });

  it("stores __proto__ as an ordinary key", () => {
    const hash = new LazyAttributeHash({}, {});
    const attr = Attribute.null("__proto__");
    hash.set("__proto__", attr);
    expect(hash.isKey("__proto__")).toBe(true);
    expect(hash.get("__proto__")).toBe(attr);
    expect(hash.deepDup().isKey("__proto__")).toBe(true);
  });

  it("except returns a copy without the given names", () => {
    const hash = new LazyAttributeHash(
      { age: intType, name: strType },
      { age: "42", name: "Alice" },
    );
    const rest = hash.except("age");
    expect(Object.hasOwn(rest, "age")).toBe(false);
    expect(Object.hasOwn(rest, "name")).toBe(true);
    hash.set("__proto__", Attribute.null("__proto__"));
    expect(Object.hasOwn(hash.except("age"), "__proto__")).toBe(true);
  });

  it("dup copies the delegate hash, so a write to the copy does not reach the receiver", () => {
    const hash = new LazyAttributeHash({ age: intType }, { age: "42" });
    const age = hash.get("age");
    const copy = hash.dup();
    expect(copy).toBeInstanceOf(LazyAttributeHash);
    expect(copy.delegateHash()).not.toBe(hash.delegateHash());
    expect(copy.get("age")).toBe(age);
    copy.set("name", Attribute.null("name"));
    expect(keys(hash.delegateHash())).toEqual(["age"]);
    expect(copy.isKey("constructor")).toBe(false);
    expect(copy.get("constructor")).toBeUndefined();
  });

  it("deep_dup carries the receiver's materialized flag", () => {
    const hash = new LazyAttributeHash({ age: intType }, { age: "42" });
    hash.transformValues((attr) => attr);
    expect((hash.deepDup() as unknown as { materialized: boolean }).materialized).toBe(true);
  });
});

describe("LazyAttributeSet#fetch_value cast cache", () => {
  it("deserializes a value once and answers later reads from casted_values, a cast nil included", () => {
    let deserialized = 0;
    const type = Object.create(typeRegistry.lookup("string"));
    type.deserialize = (value: unknown) => {
      deserialized++;
      return value === "" ? null : value;
    };
    const lazy = new LazyAttributeSet(
      { name: "Alice", bio: "" },
      { name: type, bio: type },
      {},
      {},
    );
    expect(lazy.fetchValue("name")).toBe("Alice");
    expect(lazy.fetchValue("name")).toBe("Alice");
    expect(lazy.fetchValue("bio")).toBeNull();
    expect(lazy.fetchValue("bio")).toBeNull();
    expect(deserialized).toBe(2);
    expect(Object.keys((lazy as any)._attributes as object)).toHaveLength(0);
  });
});

describe("names Object.prototype answers", () => {
  const strType = typeRegistry.lookup("string");
  const names = ["constructor", "toString"];

  it("LazyAttributeSet reads types as a Hash", () => {
    for (const name of names) {
      const lazy = new LazyAttributeSet({ [name]: "x" }, {}, {}, {});
      expect(lazy.getAttribute(name).type).toBeNull();
    }
  });

  it("LazyAttributeSet reads the default of a types hash that carries one", () => {
    const types = new Proxy({} as Record<string, typeof strType>, {
      get: (target, prop) => (Object.hasOwn(target, prop) ? target[prop as string] : strType),
    });
    for (const name of [...names, "aliased"]) {
      const lazy = new LazyAttributeSet({ [name]: "x" }, types, {}, {});
      expect(lazy.getAttribute(name).type).toBe(strType);
      expect(lazy.fetchValue(name)).toBe("x");
    }
  });

  it("LazyAttributeSet reads casted_values as a Hash", () => {
    for (const name of names) {
      const lazy = new LazyAttributeSet({ [name]: "x" }, { [name]: strType }, {}, {});
      expect(lazy.getAttribute(name).value()).toBe("x");
      expect(
        new LazyAttributeSet({ [name]: "x" }, { [name]: strType }, {}, {}).fetchValue(name),
      ).toBe("x");
    }
  });

  it("LazyAttributeSet reads default_attributes as a Hash", () => {
    for (const name of names) {
      const lazy = new LazyAttributeSet({}, { [name]: strType }, {}, {});
      expect(lazy.getAttribute(name).isInitialized()).toBe(false);
    }
  });

  it("LazyAttributeHash reads types and default_attributes as a Hash", () => {
    for (const name of names) {
      expect(new LazyAttributeHash({}, { [name]: "x" }).get(name)!.type).toBeNull();
      const attr = new LazyAttributeHash({ [name]: strType }, {}).get(name)!;
      expect(attr.isInitialized()).toBe(false);
    }
  });
});
