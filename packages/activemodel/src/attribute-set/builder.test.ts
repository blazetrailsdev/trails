import { describe, it, expect } from "vitest";
import { Builder, LazyAttributeSet, LazyAttributeHash } from "./builder.js";
import { Attribute } from "../attribute.js";
import { typeRegistry } from "../type/registry.js";

describe("Builder", () => {
  const strType = typeRegistry.lookup("string");

  it("buildFromDatabase creates initialized attributes for present values", () => {
    const types = new Map([["name", strType]]);
    const builder = new Builder(types);
    const set = builder.buildFromDatabase({ name: "Alice" });
    expect(set.fetchValue("name")).toBe("Alice");
  });

  it("buildFromDatabase creates uninitialized attributes for absent values", () => {
    const types = new Map([["name", strType]]);
    const builder = new Builder(types);
    const set = builder.buildFromDatabase({});
    expect(set.getAttribute("name").isInitialized()).toBe(false);
  });
});

describe("LazyAttributeSet", () => {
  const strType = typeRegistry.lookup("string");
  const intType = typeRegistry.lookup("integer");

  it("only materializes an attribute when it is first read", () => {
    const types = new Map([["name", strType]]);
    const lazy = new LazyAttributeSet({ name: "Alice" }, types, new Map(), {});
    expect(Object.keys((lazy as any)._attributes as object)).toHaveLength(0);
    expect(lazy.fetchValue("name")).toBe("Alice");
    expect(lazy.keys()).toEqual(["name"]);
    expect(Object.hasOwn((lazy as any)._attributes as object, "name")).toBe(true);
  });

  it("key? reports values, types and materialized attributes", () => {
    const types = new Map([["name", strType]]);
    const lazy = new LazyAttributeSet({ score: "42" }, types, new Map(), {});
    expect(lazy.isKey("score")).toBe(true);
    expect(lazy.isKey("name")).toBe(false);
    expect(lazy.isKey("missing")).toBe(false);
  });

  it("uses additional_types over the declared type", () => {
    const types = new Map([["score", strType]]);
    const additional = new Map([["score", intType]]);
    const lazy = new LazyAttributeSet({ score: "42" }, types, additional, {});
    expect(lazy.fetchValue("score")).toBe(42);
  });

  it("falls back to a default attribute when the value is absent", () => {
    const types = new Map([["status", strType]]);
    const defaults = { status: Attribute.fromDatabase("status", "draft", strType) };
    const lazy = new LazyAttributeSet({}, types, new Map(), defaults);
    expect(lazy.fetchValue("status")).toBe("draft");
  });

  it("returns an uninitialized attribute for a known type with no value or default", () => {
    const types = new Map([["name", strType]]);
    const lazy = new LazyAttributeSet({}, types, new Map(), {});
    expect(lazy.getAttribute("name").isInitialized()).toBe(false);
    expect(lazy.keys()).toEqual([]);
  });

  it("returns a null attribute for an unknown name", () => {
    const lazy = new LazyAttributeSet({}, new Map(), new Map(), {});
    expect(lazy.fetchValue("nope")).toBe(null);
  });
});

describe("LazyAttributeHash", () => {
  const strType = typeRegistry.lookup("string");
  const intType = typeRegistry.lookup("integer");

  it("delegateHash returns an empty map before any access", () => {
    const hash = new LazyAttributeHash(new Map([["name", strType]]), {});
    expect(Object.keys(hash.delegateHash()).length).toBe(0);
  });

  it("delegateHash reflects materialized entries after []", () => {
    const hash = new LazyAttributeHash(new Map([["name", strType]]), { name: "Bob" });
    hash.getAttribute("name");
    expect(Object.hasOwn(hash.delegateHash(), "name")).toBe(true);
  });

  it("assignDefaultValue materializes from the value/type tables", () => {
    const hash = new LazyAttributeHash(new Map([["age", intType]]), { age: "42" });
    const attr = hash.assignDefaultValue("age");
    expect(attr.value).toBe(42);
  });

  it("assignDefaultValue returns Attribute.null for unknown names", () => {
    const hash = new LazyAttributeHash(new Map(), {});
    const attr = hash.assignDefaultValue("missing");
    expect(attr.value).toBeNull();
  });

  it("transform_values materializes and maps every attribute", () => {
    const hash = new LazyAttributeHash(new Map([["age", intType]]), { age: "42" });
    const result = hash.transformValues((attr) => attr);
    expect(result["age"].value).toBe(42);
  });

  it("transform_values is generic over the block result", () => {
    const hash = new LazyAttributeHash(new Map([["age", intType]]), { age: "42" });
    const result: Record<string, unknown> = hash.transformValues((attr) => attr.type);
    expect(result["age"]).toBe(intType);
  });

  it("each_value yields every materialized attribute", () => {
    const hash = new LazyAttributeHash(
      new Map([
        ["age", intType],
        ["name", strType],
      ]),
      { age: "42", name: "Alice" },
    );
    const seen: unknown[] = [];
    hash.eachValue((attr) => seen.push(attr.value));
    expect(seen).toContain(42);
    expect(seen).toContain("Alice");
  });

  it("fetch returns the materialized attribute for the given name", () => {
    const hash = new LazyAttributeHash(new Map([["age", intType]]), { age: "42" });
    expect(hash.fetch("age").value).toBe(42);
  });

  it("fetch raises for an unknown name without a block", () => {
    const hash = new LazyAttributeHash(new Map(), {});
    expect(() => hash.fetch("missing")).toThrow();
  });

  it("fetch returns the given default value for an unknown name", () => {
    const hash = new LazyAttributeHash(new Map(), {});
    const fallback = Attribute.null("missing");
    expect(hash.fetch("missing", fallback)).toBe(fallback);
  });

  it("key? reports the delegate hash, values and types", () => {
    const hash = new LazyAttributeHash(
      new Map([
        ["age", intType],
        ["name", strType],
      ]),
      { age: "42" },
    );
    expect(hash.isKey("age")).toBe(true);
    expect(hash.isKey("name")).toBe(true);
    expect(hash.isKey("missing")).toBe(false);
  });

  it("treats an Object.prototype name as an ordinary absent key", () => {
    const hash = new LazyAttributeHash(new Map(), {});
    expect(hash.isKey("toString")).toBe(false);
    expect(hash.getAttribute("toString").value).toBeNull();
    expect(hash.getAttribute("constructor").value).toBeNull();
  });

  it("stores __proto__ as an ordinary key", () => {
    const hash = new LazyAttributeHash(new Map(), {});
    const attr = Attribute.null("__proto__");
    hash.set("__proto__", attr);
    expect(hash.isKey("__proto__")).toBe(true);
    expect(hash.getAttribute("__proto__")).toBe(attr);
    expect(hash.deepDup().isKey("__proto__")).toBe(true);
  });

  it("deep_dup carries the receiver's materialized flag", () => {
    const hash = new LazyAttributeHash(new Map([["age", intType]]), { age: "42" });
    hash.transformValues((attr) => attr);
    expect((hash.deepDup() as unknown as { materialized: boolean }).materialized).toBe(true);
  });

  it("except returns a copy without the given names", () => {
    const hash = new LazyAttributeHash(
      new Map([
        ["age", intType],
        ["name", strType],
      ]),
      { age: "42", name: "Alice" },
    );
    const rest = hash.except("age");
    expect(Object.hasOwn(rest, "age")).toBe(false);
    expect(Object.hasOwn(rest, "name")).toBe(true);
    hash.set("__proto__", Attribute.null("__proto__"));
    expect(Object.hasOwn(hash.except("age"), "__proto__")).toBe(true);
  });
});
