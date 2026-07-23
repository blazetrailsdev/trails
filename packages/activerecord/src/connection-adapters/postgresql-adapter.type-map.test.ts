import { IntegerType, StringType, ValueType } from "@blazetrails/activemodel";
import { Array as OidArray } from "./postgresql/oid/array.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HashLookupTypeMap } from "../type/hash-lookup-type-map.js";
import { Uuid } from "./postgresql/oid/uuid.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

describe("PostgreSQLAdapter#typeMap", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(() => {
    // No real connection needed — we never execute SQL in these tests.
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
  });

  afterEach(async () => {
    await adapter.close().catch(() => undefined);
  });

  it("is a HashLookupTypeMap populated with known PG types", () => {
    expect(adapter.typeMap).toBeInstanceOf(HashLookupTypeMap);
    expect(adapter.typeMap.lookup("uuid")).toBeInstanceOf(Uuid);
    expect(adapter.typeMap.lookup("text")).toBeInstanceOf(StringType);
  });

  it("is memoized across calls", () => {
    const first = adapter.typeMap;
    const second = adapter.typeMap;
    expect(first).toBe(second);
  });
});

describe("PostgreSQLAdapter#getOidType", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(() => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.close().catch(() => undefined);
  });

  it("returns the registered type for a known OID", async () => {
    // Register a fake OID → Uuid mapping (the adapter type_map is keyed
    // by both string typnames and integer OIDs, matching Rails Hash
    // semantics).
    adapter.typeMap.registerType(2950, new Uuid());
    const type = await adapter.getOidType(2950, -1, "guid");
    expect(type).toBeInstanceOf(Uuid);
  });

  it("warns and registers a fallback ValueType for an unknown OID", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Stub loadAdditionalTypes so the test doesn't hit a real DB. The
    // stub leaves the type_map unchanged, simulating "pg_type has no
    // matching row for this oid".
    vi.spyOn(adapter, "loadAdditionalTypes").mockResolvedValue(undefined);

    const type = await adapter.getOidType(999_999, -1, "mystery_column");
    expect(type).toBeInstanceOf(ValueType);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unknown OID 999999"));
    // Subsequent lookup returns the same fallback without re-warning.
    warn.mockClear();
    const second = await adapter.getOidType(999_999, -1, "mystery_column");
    expect(second).toBeInstanceOf(ValueType);
    expect(warn).not.toHaveBeenCalled();
  });

  it("loads the type from pg_type on miss before falling back", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Simulate the miss path: loadAdditionalTypes gets called, then
    // registers the type via the initializer. Here we just register
    // directly in the mock.
    const loadSpy = vi.spyOn(adapter, "loadAdditionalTypes").mockImplementation(async () => {
      adapter.typeMap.registerType(987_654, new Uuid());
    });
    const type = await adapter.getOidType(987_654, -1, "user_defined_column");
    expect(loadSpy).toHaveBeenCalledWith([987_654]);
    expect(type).toBeInstanceOf(Uuid);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("PostgreSQLAdapter#quoteDefaultExpression", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(() => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
  });

  afterEach(async () => {
    await adapter.close().catch(() => undefined);
  });

  /** Stub Rails' `SELECT '<sql_type>'::regtype::oid` round-trip
   * (postgresql/quoting.rb:195) with a warmed type map: `integer[]` resolves
   * to the `_int4` array OID (1007), registered as OID::Array(integer) the way
   * the type-map initializer's array pass would. */
  function stubRegtypeLookup(): void {
    adapter.typeMap.registerType(1007, new OidArray(new IntegerType()) as never);
    vi.spyOn(adapter, "schemaQuery").mockResolvedValue([{ oid: 1007 }]);
  }

  it("reads `array` from ColumnDefinition.options for DDL paths", async () => {
    // Simulates a ColumnDefinition built by addColumn/changeColumn:
    // array lives on `.options`, sqlType is the `[]`-suffixed form.
    stubRegtypeLookup();
    const columnDef = { sqlType: "integer[]", options: { array: true } };
    expect(await adapter.quoteDefaultExpression([1, 2, 3], columnDef)).toBe("'{1,2,3}'");
  });

  it("reads `array` from a live Column instance", async () => {
    stubRegtypeLookup();
    const column = { sqlType: "integer", array: true };
    expect(await adapter.quoteDefaultExpression([4, 5, 6], column)).toBe("'{4,5,6}'");
  });

  it("normalizes `integer[]` sqlType so the integer subtype resolves", async () => {
    // The regtype round-trip resolves `integer[]` to the array OID whose
    // registered type is OID::Array(integer). If it fell to ValueType instead,
    // the floats would be emitted verbatim ('{1.7,2.3}'); IntegerType#serialize
    // truncates to integers, so '{1,2}' confirms the subtype resolved.
    stubRegtypeLookup();
    const columnDef = { sqlType: "integer[]", options: { array: true } };
    expect(await adapter.quoteDefaultExpression([1.7, 2.3], columnDef)).toBe("'{1,2}'");
  });

  it("resolves a live column's cast type by oid/fmod, not by formatted name", async () => {
    // Rails keys lookup_cast_type_from_column on (oid, fmod, sql_type)
    // (postgresql/quoting.rb:191). Registering a distinguishable type under
    // an OID whose sqlType would otherwise resolve elsewhere proves the OID
    // wins: `numeric` by name is a decimal, so `'99'` can only come from the
    // OID-registered type.
    adapter.typeMap.registerType(918_273, {
      serialize: () => "99",
    } as never);
    const column = { oid: 918_273, fmod: -1, sqlType: "numeric", array: false };
    expect(await adapter.quoteDefaultExpression(1.5, column)).toBe("'99'");
  });

  it("forwards fmod so precision-carrying types resolve", async () => {
    // fmod is how numeric(10,2) recovers its precision/scale; dropping it
    // would silently hand the factory -1.
    let seen: number | undefined;
    adapter.typeMap.registerType(918_274, {
      serialize: (v: unknown) => v,
    } as never);
    const spy = vi.spyOn(adapter.typeMap, "fetch").mockImplementation(((
      _oid: number,
      fmod: number,
    ) => {
      seen = fmod;
      return { serialize: (v: unknown) => v };
    }) as never);
    await adapter.quoteDefaultExpression("x", { oid: 918_274, fmod: 655_366, sqlType: "numeric" });
    expect(seen).toBe(655_366);
    spy.mockRestore();
  });
});
