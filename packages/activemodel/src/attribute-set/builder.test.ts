import { describe, it, expect } from "vitest";
import { Builder, LazyAttributeSet, LazyAttributeHash } from "./builder.js";
import { Attribute } from "../attribute.js";
import { typeRegistry } from "../type/registry.js";

describe("Builder", () => {
  const strType = typeRegistry.lookup("string");
  const intType = typeRegistry.lookup("integer");

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

  it("additionalTypes returns the map passed at construction", () => {
    const extra = new Map([["score", intType]]);
    const lazy = new LazyAttributeSet(new Map(), extra);
    expect(lazy.additionalTypes()).toBe(extra);
  });

  it("materialize includes initialized attributes", () => {
    const attrs = new Map([["name", Attribute.fromDatabase("name", "Alice", strType)]]);
    const lazy = new LazyAttributeSet(attrs);
    const result = (lazy as any).materialize() as Map<string, Attribute>;
    expect(result.get("name")).toBeDefined();
    expect(result.get("name")!.value).toBe("Alice");
  });

  it("materialize includes uninitialized attributes", () => {
    const attrs = new Map<string, Attribute>([
      ["name", Attribute.fromDatabase("name", "Alice", strType)],
      ["age", Attribute.uninitialized("age", intType)],
    ]);
    const lazy = new LazyAttributeSet(attrs);
    const result = (lazy as any).materialize() as Map<string, Attribute>;
    expect(result.has("age")).toBe(true);
    expect(result.get("age")!.isInitialized()).toBe(false);
  });

  it("materialize includes additionalTypes keys not in the attribute map", () => {
    const attrs = new Map([["name", Attribute.fromDatabase("name", "Alice", strType)]]);
    const extra = new Map([["score", intType]]);
    const lazy = new LazyAttributeSet(attrs, extra);
    const result = (lazy as any).materialize() as Map<string, Attribute>;
    expect(result.has("score")).toBe(true);
    expect(result.get("score")!.isInitialized()).toBe(false);
  });

  it("materialize mutates the instance so additionalTypes keys are accessible via getAttribute", () => {
    const extra = new Map([["score", intType]]);
    const lazy = new LazyAttributeSet(new Map(), extra);
    // Before materialize: getAttribute returns a null Attribute (unknown name).
    expect(lazy.getAttribute("score").type.name).toBe("value");
    (lazy as any).materialize();
    // After materialize: entry is written into the internal map with the correct type.
    expect(lazy.getAttribute("score").type.name).toBe("integer");
    expect(lazy.getAttribute("score").isInitialized()).toBe(false);
  });

  it("deepDup preserves additionalTypes", () => {
    const extra = new Map([["score", intType]]);
    const lazy = new LazyAttributeSet(new Map(), extra);
    const dup = lazy.deepDup();
    expect(dup).toBeInstanceOf(LazyAttributeSet);
    expect(dup.additionalTypes()).toEqual(extra);
    expect(dup.additionalTypes()).not.toBe(extra);
  });

  it("map preserves additionalTypes", () => {
    const extra = new Map([["score", intType]]);
    const lazy = new LazyAttributeSet(new Map(), extra);
    const mapped = lazy.map((a) => a);
    expect(mapped).toBeInstanceOf(LazyAttributeSet);
    expect((mapped as LazyAttributeSet).additionalTypes()).toEqual(extra);
  });
});

describe("LazyAttributeHash", () => {
  const strType = typeRegistry.lookup("string");
  const intType = typeRegistry.lookup("integer");

  it("delegateHash returns an empty map before any access", () => {
    const hash = new LazyAttributeHash(new Map([["name", strType]]), {});
    expect(hash.delegateHash().size).toBe(0);
  });

  it("delegateHash reflects materialized entries after get", () => {
    const hash = new LazyAttributeHash(new Map([["name", strType]]), { name: "Bob" });
    hash.get("name");
    expect(hash.delegateHash().has("name")).toBe(true);
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
});
