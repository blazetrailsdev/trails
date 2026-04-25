import { describe, it, expect } from "vitest";
import { HashLookupTypeMap } from "./hash-lookup-type-map.js";
import { ValueType } from "@blazetrails/activemodel";

describe("TypeMapTest", () => {
  it.skip("registering types", () => {});
  it.skip("overriding registered types", () => {});
  it.skip("aliasing types", () => {});
  it.skip("changing type changes aliases", () => {});
  it.skip("aliases keep metadata", () => {});
  it.skip("fuzzy lookup", () => {});
  it.skip("register proc", () => {});
  it.skip("parent fallback", () => {});
  it.skip("parent fallback for default type", () => {});
});

describe("HashLookupTypeMapTest", () => {
  it("additional lookup args", () => {
    const mapping = new HashLookupTypeMap();
    mapping.registerType("varchar", (_type: string | number, limit: unknown) =>
      (limit as number) > 255 ? ({ name: "text" } as any) : ({ name: "string" } as any),
    );
    mapping.aliasType("string", "varchar");

    expect((mapping.lookup("varchar", 200) as any).name).toBe("string");
    expect((mapping.lookup("varchar", 400) as any).name).toBe("text");
    expect((mapping.lookup("string", 400) as any).name).toBe("text");
  });

  it("lookup non strings", () => {
    const mapping = new HashLookupTypeMap();
    mapping.registerType(1, { name: "string" } as any);
    mapping.registerType(2, { name: "int" } as any);
    mapping.aliasType(3, 1);

    expect((mapping.lookup(1) as any).name).toBe("string");
    expect((mapping.lookup(2) as any).name).toBe("int");
    expect((mapping.lookup(3) as any).name).toBe("string");
    expect(mapping.lookup(4)).toBeInstanceOf(ValueType);
  });

  it("isKey returns true for registered keys and false otherwise", () => {
    const mapping = new HashLookupTypeMap();
    mapping.registerType("foo", { name: "foo" } as any);

    expect(mapping.isKey("foo")).toBe(true);
    expect(mapping.isKey("bar")).toBe(false);
  });

  it("fetch memoizes on args", () => {
    const mapping = new HashLookupTypeMap();
    let callCount = 0;
    mapping.registerType("foo", (type: string | number, ...args: unknown[]) => {
      callCount++;
      return [type, ...args].join("-") as any;
    });

    expect(mapping.fetch("foo", 1, 2, 3, () => [].join("-"))).toBe("foo-1-2-3");
    expect(mapping.fetch("foo", 1, 2, 3, () => [].join("-"))).toBe("foo-1-2-3");
    expect(callCount).toBe(1);

    expect(mapping.fetch("foo", 2, 3, 4, () => [].join("-"))).toBe("foo-2-3-4");
    expect(callCount).toBe(2);
  });

  it("fetch yields args", () => {
    const mapping = new HashLookupTypeMap();

    expect(mapping.fetch("foo", 1, 2, 3, (...args: unknown[]) => args.join("-"))).toBe("foo-1-2-3");
    expect(mapping.fetch("bar", 1, 2, 3, (...args: unknown[]) => args.join("-"))).toBe("bar-1-2-3");
  });
});

// TypeMapSharedTests — exercised against HashLookupTypeMap below
it("default type", () => {
  const mapping = new HashLookupTypeMap();
  expect(mapping.lookup("undefined_key")).toBeInstanceOf(ValueType);
});

it("requires value or block", () => {
  const mapping = new HashLookupTypeMap();
  expect(() => (mapping as any).registerType(/only key/i)).toThrow();
});

it("fetch", () => {
  const mapping = new HashLookupTypeMap();
  mapping.registerType(1, "string" as any);

  expect(mapping.fetch(1, () => "int")).toBe("string");
  expect(mapping.fetch(2, () => "int")).toBe("int");
});

it("fetch memoizes", () => {
  const mapping = new HashLookupTypeMap();
  let lookupCount = 0;
  mapping.registerType(1, () => {
    if (lookupCount > 0) throw new Error("should not be called twice");
    lookupCount++;
    return "string" as any;
  });

  expect(mapping.fetch(1)).toBe("string");
  expect(mapping.fetch(1)).toBe("string");
});

it("register clears cache", () => {
  const mapping = new HashLookupTypeMap();
  mapping.registerType(1, "string" as any);
  mapping.lookup(1);
  mapping.registerType(1, "int" as any);

  expect(mapping.lookup(1)).toBe("int");
});
