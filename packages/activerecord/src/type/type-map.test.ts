import { describe, it, expect } from "vitest";
import { HashLookupTypeMap } from "./hash-lookup-type-map.js";
import {
  BooleanType,
  BinaryType,
  StringType,
  TimeType,
  DateTimeType,
  ValueType,
} from "@blazetrails/activemodel";
import { TypeMap } from "./type-map.js";

describe("TypeMapTest", () => {
  it("registering types", () => {
    const boolean = new BooleanType();
    const mapping = new TypeMap();
    mapping.registerType(/boolean/i, boolean);
    expect(mapping.lookup("boolean")).toBe(boolean);
  });

  it("overriding registered types", () => {
    const time = new TimeType();
    const timestamp = new DateTimeType();
    const mapping = new TypeMap();
    mapping.registerType(/time/i, time);
    mapping.registerType(/time/i, timestamp);
    expect(mapping.lookup("time")).toBe(timestamp);
  });

  it("aliasing types", () => {
    const string = new StringType();
    const mapping = new TypeMap();
    mapping.registerType(/string/i, string);
    mapping.aliasType(/varchar/i, "string");
    expect(mapping.lookup("varchar")).toBe(string);
  });

  it("changing type changes aliases", () => {
    const time = new TimeType();
    const timestamp = new DateTimeType();
    const mapping = new TypeMap();
    mapping.registerType(/timestamp/i, time);
    mapping.aliasType(/datetime/i, "timestamp");
    mapping.registerType(/timestamp/i, timestamp);
    expect(mapping.lookup("datetime")).toBe(timestamp);
  });

  it("aliases keep metadata", () => {
    const mapping = new TypeMap();
    mapping.registerType(/decimal/i, undefined, (sqlType: string) => sqlType as any);
    mapping.aliasType(/number/i, "decimal");
    expect(mapping.lookup("number(20)")).toBe("decimal(20)");
    expect(mapping.lookup("number")).toBe("decimal");
  });

  it("fuzzy lookup", () => {
    const string = new StringType();
    const mapping = new TypeMap();
    mapping.registerType(/varchar/i, string);
    expect(mapping.lookup("varchar(20)")).toBe(string);
  });

  it("register proc", () => {
    const string = new StringType();
    const binary = new BinaryType();
    const mapping = new TypeMap();
    mapping.registerType(/varchar/i, undefined, (type: string) =>
      type.includes("(") ? string : binary,
    );
    expect(mapping.lookup("varchar(20)")).toBe(string);
    expect(mapping.lookup("varchar")).toBe(binary);
  });

  it("parent fallback", () => {
    const boolean = new BooleanType();
    const parent = new TypeMap();
    parent.registerType(/boolean/i, boolean);
    const mapping = new TypeMap(parent);
    expect(mapping.lookup("boolean")).toBe(boolean);
  });

  it("parent fallback for default type", () => {
    const parent = new TypeMap();
    const mapping = new TypeMap(parent);
    expect(mapping.lookup("undefined_key")).toBeInstanceOf(ValueType);
  });
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
