import { StringType, ValueType } from "@blazetrails/activemodel";
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
