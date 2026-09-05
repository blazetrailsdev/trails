import { IntegerType, StringType, ValueType } from "@blazetrails/activemodel";
import { Array as OidArray } from "./postgresql/oid/array.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HashLookupTypeMap } from "../type/hash-lookup-type-map.js";
import { castResult } from "./postgresql/database-statements.js";
import { Uuid } from "./postgresql/oid/uuid.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

describe("PostgreSQLAdapter#typeMap", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(() => {
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
    adapter.typeMap.registerType(2950, new Uuid());
    const type = adapter.getOidType(2950, -1, "guid");
    expect(type).toBeInstanceOf(Uuid);
  });

  it("warns and registers a fallback ValueType for an unknown OID", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const type = adapter.getOidType(999_999, -1, "mystery_column");
    expect(type).toBeInstanceOf(ValueType);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unknown OID 999999"));
    warn.mockClear();
    const second = adapter.getOidType(999_999, -1, "mystery_column");
    expect(second).toBeInstanceOf(ValueType);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("PostgreSQLAdapter#castResult", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(() => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.close().catch(() => undefined);
  });

  it("loads the type from pg_type on miss before falling back", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loadSpy = vi.spyOn(adapter, "loadAdditionalTypes").mockImplementation(async () => {
      adapter.typeMap.registerType(987_654, new Uuid());
    });

    const result = await castResult.call(
      adapter as never,
      {
        fields: [{ name: "user_defined_column", dataTypeID: 987_654, dataTypeModifier: -1 }],
        rows: [],
      } as never,
    );

    expect(loadSpy).toHaveBeenCalledWith([987_654]);
    expect(result.columnTypes["user_defined_column"]).toBeInstanceOf(Uuid);
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

  function warmIntegerArrayType(): void {
    adapter.typeMap.registerType(1007, new OidArray(new IntegerType()) as never);
    adapter.typeMap.aliasType("integer[]", 1007);
  }

  it("resolves a bare sqlType off the warmed type map instead of querying regtype", () => {
    adapter.typeMap.registerType(23, new IntegerType());
    adapter.typeMap.aliasType("integer", 23);
    const execQuery = vi.spyOn(adapter, "internalExecQuery");

    expect(adapter.quoteDefaultExpression(42.7, { sqlType: "integer" })).toBe("42");
    expect(execQuery).not.toHaveBeenCalled();
  });

  it("strips the type modifier regtype ignores", () => {
    adapter.typeMap.registerType(1043, { serialize: () => "varchar" } as never);
    adapter.typeMap.aliasType("character varying", 1043);
    adapter.typeMap.registerType(1114, { serialize: () => "timestamp" } as never);
    adapter.typeMap.aliasType("timestamp without time zone", 1114);

    expect(adapter.quoteDefaultExpression("hi", { sqlType: "character varying(255)" })).toBe(
      "'varchar'",
    );
    expect(
      adapter.quoteDefaultExpression("2026-01-01", {
        sqlType: "timestamp(6) without time zone",
      }),
    ).toBe("'timestamp'");
  });

  it("reads `array` from ColumnDefinition.options for DDL paths", async () => {
    warmIntegerArrayType();
    const columnDef = { sqlType: "integer[]", options: { array: true } };
    expect(await adapter.quoteDefaultExpression([1, 2, 3], columnDef)).toBe("'{1,2,3}'");
  });

  it("reads `array` from a live Column instance", async () => {
    warmIntegerArrayType();
    const column = { oid: 1007, fmod: -1, sqlType: "integer[]", array: true };
    expect(await adapter.quoteDefaultExpression([4, 5, 6], column)).toBe("'{4,5,6}'");
  });

  it("normalizes `integer[]` sqlType so the integer subtype resolves", async () => {
    warmIntegerArrayType();
    const columnDef = { sqlType: "integer[]", options: { array: true } };
    expect(await adapter.quoteDefaultExpression([1.7, 2.3], columnDef)).toBe("'{1,2}'");
  });

  it("resolves a live column's cast type by oid/fmod, not by formatted name", async () => {
    adapter.typeMap.registerType(918_273, {
      serialize: () => "99",
    } as never);
    const column = { oid: 918_273, fmod: -1, sqlType: "numeric", array: false };
    expect(await adapter.quoteDefaultExpression(1.5, column)).toBe("'99'");
  });

  it("forwards fmod so precision-carrying types resolve", async () => {
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
    await adapter.quoteDefaultExpression("x", {
      oid: 918_274,
      fmod: 655_366,
      sqlType: "numeric",
      array: false,
    });
    expect(seen).toBe(655_366);
    spy.mockRestore();
  });
});
