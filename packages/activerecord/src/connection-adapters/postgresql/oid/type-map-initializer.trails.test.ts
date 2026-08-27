import { describe, expect, it } from "vitest";
import type { Type } from "@blazetrails/activemodel";
import { Array as OidArray } from "./array.js";
import { Enum } from "./enum.js";
import { RangeType } from "./range.js";
import { HashLookupTypeMap } from "../../../type/hash-lookup-type-map.js";
import { TypeMapInitializer } from "./type-map-initializer.js";
import { Vector } from "./vector.js";

const integerSubtype = {
  cast: (value: unknown) => (value == null ? null : Number(value)),
  serialize: (value: unknown) => (value == null ? null : Number(value)),
} as unknown as Type;

describe("PostgreSQL::OID::TypeMapInitializer", () => {
  it("registers arrays, ranges, enums, domains, mapped types, and composites", () => {
    const store = new HashLookupTypeMap();
    store.registerType("int4", integerSubtype);
    store.registerType(23, integerSubtype);

    new TypeMapInitializer(store).run([
      row({ oid: 1007, typname: "_int4", typinput: "array_in", typelem: 23 }),
      row({ oid: 3904, typname: "int4range", typtype: "r", rngsubtype: 23 }),
      row({ oid: 5000, typname: "mood", typtype: "e" }),
      row({ oid: 6000, typname: "positive_int", typtype: "d", typbasetype: 23 }),
      row({ oid: 7000, typname: "int_pair", typelem: 23 }),
      row({ oid: 8000, typname: "int4" }),
    ]);

    expect(store.lookup(1007)).toBeInstanceOf(OidArray);
    expect(store.lookup(3904)).toBeInstanceOf(RangeType);
    expect(store.lookup(5000)).toBeInstanceOf(Enum);
    expect(store.lookup(6000)).toBe(integerSubtype);
    const vector = store.lookup(7000) as Vector;
    expect(vector).toBeInstanceOf(Vector);
    expect(vector.delim).toBe(",");
    expect(vector.subtype).toBe(integerSubtype);
    expect(vector.cast("[1,2,3]")).toBe("[1,2,3]");
    expect(store.lookup(8000)).toBe(integerSubtype);
  });

  it("registers array and range types lazily with lookup arguments", () => {
    const store = new HashLookupTypeMap();
    store.registerType(
      23,
      undefined,
      (_oid, ...args) =>
        ({
          ...(integerSubtype as object),
          metadata: args[0],
        }) as unknown as Type,
    );

    new TypeMapInitializer(store).run([
      row({ oid: "1007", typname: "_int4", typinput: "array_in", typelem: "23" }),
      row({ oid: "3904", typname: "int4range", typtype: "r", rngsubtype: "23" }),
    ]);

    const array = store.lookup(1007, { scale: 2 }) as OidArray;
    const range = store.lookup(3904, { scale: 4 }) as RangeType;

    expect(array).toBeInstanceOf(OidArray);
    expect((array.subtype as { metadata?: { scale?: number } }).metadata?.scale).toBe(2);
    expect(range).toBeInstanceOf(RangeType);
    expect((range.subtype as { metadata?: { scale?: number } }).metadata?.scale).toBe(4);
  });

  it("skips array registration when element OID is not in the store", () => {
    const store = new HashLookupTypeMap();
    store.registerType("numeric", integerSubtype);

    new TypeMapInitializer(store).run([
      row({ oid: 1231, typname: "_numeric", typinput: "array_in", typelem: 1700 }),
    ]);
    expect(store.lookup(1231)).not.toBeInstanceOf(OidArray);

    store.aliasType(1700, "numeric");
    new TypeMapInitializer(store).run([
      row({ oid: 1231, typname: "_numeric", typinput: "array_in", typelem: 1700 }),
    ]);
    expect(store.lookup(1231)).toBeInstanceOf(OidArray);
  });

  it("builds query condition fragments", () => {
    const store = new HashLookupTypeMap();
    store.registerType("int4", integerSubtype);
    store.registerType(23, integerSubtype);
    const initializer = new TypeMapInitializer(store);

    expect(initializer.queryConditionsForKnownTypeNames()).toContain("'int4'");
    expect(initializer.queryConditionsForKnownTypeTypes()).toContain("'r'");
    expect(initializer.queryConditionsForArrayTypes()).toContain("23");
  });
});

function row(overrides: Partial<Parameters<TypeMapInitializer["run"]>[0][number]>) {
  return {
    oid: 1,
    typname: "type",
    typelem: 0,
    typdelim: ",",
    typtype: "b",
    typbasetype: 0,
    typarray: 0,
    ...overrides,
  };
}
