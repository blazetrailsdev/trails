import { describe, expect, it } from "vitest";
import { Array as OidArray } from "./array.js";
import { Enum } from "./enum.js";
import { RangeType, MultiRangeType } from "./range.js";
import { TypeMapInitializer, type TypeMap } from "./type-map-initializer.js";
import { Vector } from "./vector.js";

class TestStore implements TypeMap {
  readonly mapping = new Map<number | string, unknown>();

  registerType(oid: number | string, type: unknown): void {
    this.mapping.set(oid, type);
  }

  aliasType(oid: number | string, targetOid: number | string): void {
    this.mapping.set(oid, this.mapping.get(targetOid));
  }

  lookup(oid: number | string, ...args: unknown[]): unknown {
    const value = this.mapping.get(oid);
    if (typeof value === "function")
      return (value as (...args: unknown[]) => unknown)(oid, ...args);
    return value;
  }

  has(oid: number | string): boolean {
    return this.mapping.has(oid);
  }

  keys(): Array<number | string> {
    return [...this.mapping.keys()];
  }
}

const integerSubtype = {
  cast: (value: unknown) => (value == null ? null : Number(value)),
  serialize: (value: unknown) => (value == null ? null : Number(value)),
};

describe("PostgreSQL::OID::TypeMapInitializer", () => {
  it("registers arrays, ranges, enums, domains, mapped types, and composites", () => {
    const store = new TestStore();
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
    const store = new TestStore();
    store.registerType(23, (_oid: number | string, metadata?: { scale?: number }) => ({
      ...integerSubtype,
      metadata,
    }));

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

  it("registers multirange types with the underlying range subtype", () => {
    const store = new TestStore();
    store.registerType(23, integerSubtype);
    // Synthetic rows supply typelem=3904 (fast path); real PG has typelem=0.
    new TypeMapInitializer(store).run([
      row({ oid: 3904, typname: "int4range", typtype: "r", rngsubtype: 23 }),
      row({ oid: 4451, typname: "int4multirange", typtype: "m", typelem: 3904 }),
    ]);

    expect(store.lookup(3904)).toBeInstanceOf(RangeType);
    const multiRange = store.lookup(4451) as MultiRangeType;
    expect(multiRange).toBeInstanceOf(MultiRangeType);
    expect(multiRange.subtype).toBe((store.lookup(3904) as RangeType).subtype);
    expect(multiRange.name).toBe("int4multirange");
  });

  it("registers multirange types when typelem is 0 (real PG shape)", () => {
    const store = new TestStore();
    store.registerType(23, integerSubtype);
    // Real PG 14+ sets typelem=0 for multirange rows; range OID is found
    // by iterating the store for a RangeType matching the naming convention.
    new TypeMapInitializer(store).run([
      row({ oid: 3904, typname: "int4range", typtype: "r", rngsubtype: 23 }),
      row({ oid: 4451, typname: "int4multirange", typtype: "m", typelem: 0 }),
    ]);

    const multiRange = store.lookup(4451) as MultiRangeType;
    expect(multiRange).toBeInstanceOf(MultiRangeType);
    expect(multiRange.subtype).toBe((store.lookup(3904) as RangeType).subtype);
    expect(multiRange.name).toBe("int4multirange");
  });

  it("skips multirange registration when range OID is not in the store", () => {
    const store = new TestStore();
    store.registerType(23, integerSubtype);
    // Process only the multirange row (no range row in the batch). Mirrors
    // Rails' register_with_subtype: a miss is skipped silently. The eager full
    // load registers the range before its multirange in the same pass, so this
    // miss never happens in practice.
    new TypeMapInitializer(store).run([
      row({ oid: 4451, typname: "int4multirange", typtype: "m", typelem: 3904 }),
    ]);
    expect(store.lookup(4451)).not.toBeInstanceOf(MultiRangeType);

    // When the range and multirange rows arrive together (the eager-load
    // shape), the range registers first and the multirange resolves it.
    new TypeMapInitializer(store).run([
      row({ oid: 3904, typname: "int4range", typtype: "r", rngsubtype: 23 }),
      row({ oid: 4451, typname: "int4multirange", typtype: "m", typelem: 3904 }),
    ]);
    const multiRange = store.lookup(4451) as MultiRangeType;
    expect(multiRange).toBeInstanceOf(MultiRangeType);
    expect(multiRange.name).toBe("int4multirange");
  });

  it("skips array registration when element OID is not in the store", () => {
    const store = new TestStore();
    // The base type map keys scalar types by name (e.g. "numeric"), not by OID.
    store.registerType("numeric", integerSubtype);

    // Process only the array row (element OID 1700 not yet keyed in the store).
    // Mirrors Rails' register_with_subtype skip-on-miss.
    new TypeMapInitializer(store).run([
      row({ oid: 1231, typname: "_numeric", typinput: "array_in", typelem: 1700 }),
    ]);
    expect(store.lookup(1231)).not.toBeInstanceOf(OidArray);

    // When the element row aliases OID 1700 → "numeric" first (the by-typname
    // pass of the eager full load), the array row resolves its subtype.
    store.aliasType(1700, "numeric");
    new TypeMapInitializer(store).run([
      row({ oid: 1231, typname: "_numeric", typinput: "array_in", typelem: 1700 }),
    ]);
    expect(store.lookup(1231)).toBeInstanceOf(OidArray);
  });

  it("queryConditionsForKnownTypeTypes includes multirange typtype m", () => {
    const store = new TestStore();
    const initializer = new TypeMapInitializer(store);
    expect(initializer.queryConditionsForKnownTypeTypes()).toContain("'m'");
  });

  it("builds query condition fragments", () => {
    const store = new TestStore();
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
