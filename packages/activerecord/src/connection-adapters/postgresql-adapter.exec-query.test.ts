/**
 * PostgreSQLAdapter#execQuery + #lookupCastTypeFromColumn.
 *
 * Uses a mocked pg.Client-like connection so the tests don't require a
 * live PostgreSQL; they verify that each field's dataTypeID resolves
 * through the adapter's type_map, that the resulting Result has
 * columnTypes populated, and that iterating those types actually casts
 * cell values through the right OID::Type.
 */
import { ValueType } from "@blazetrails/activemodel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Result } from "../result.js";
import { Uuid } from "./postgresql/oid/uuid.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

const UUID_OID = 2950;

function makeAdapter(queryImpl: (...args: unknown[]) => Promise<unknown>): PostgreSQLAdapter {
  const adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
  // Stub the client acquisition so tests don't touch a real pool.
  // `fakeClient.release` is a no-op; `withClient()` / `execQuery()` call
  // it directly once the block resolves.
  const fakeClient = { query: queryImpl, release: () => {} };
  vi.spyOn(adapter as unknown as { getClient: () => unknown }, "getClient").mockResolvedValue(
    fakeClient,
  );
  // In a live PG adapter, loadAdditionalTypes queries pg_type and
  // aliases numeric OIDs → typnames registered in the static map.
  // Pre-register the known base OIDs so execQuery's miss path resolves
  // them without needing a DB.
  adapter.typeMap.aliasType(UUID_OID, "uuid");
  adapter.typeMap.aliasType(23, "int4");
  return adapter;
}

describe("PostgreSQLAdapter#execQuery", () => {
  let adapter: PostgreSQLAdapter;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (adapter) await adapter.close().catch(() => undefined);
  });

  it("returns a Result with columnTypes resolved from the type_map", async () => {
    adapter = makeAdapter(async () => ({
      rows: [[1, "A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11"]],
      fields: [
        { name: "id", dataTypeID: 23 /* int4 */ },
        { name: "guid", dataTypeID: UUID_OID },
      ],
    }));
    const result = await adapter.execQuery("SELECT id, guid FROM users");
    expect(result).toBeInstanceOf(Result);
    expect(result.columns).toEqual(["id", "guid"]);
    expect(result.columnTypes.guid).toBeInstanceOf(Uuid);
  });

  it("castValues() applies Uuid.deserialize to normalize case and braces", async () => {
    adapter = makeAdapter(async () => ({
      rows: [["{A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11}"]],
      fields: [{ name: "guid", dataTypeID: UUID_OID }],
    }));
    const result = await adapter.execQuery("SELECT guid FROM users");
    expect(result.castValues()).toEqual(["a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"]);
  });

  it("preserves duplicate column names via positional rows", async () => {
    // Query with duplicate column names (e.g. SELECT guid, guid FROM users)
    // would collide under hash-keyed rows. rowMode: "array" keeps both.
    adapter = makeAdapter(async () => ({
      rows: [["a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"]],
      fields: [
        { name: "guid", dataTypeID: UUID_OID },
        { name: "guid", dataTypeID: UUID_OID },
      ],
    }));
    const result = await adapter.execQuery("SELECT guid, guid FROM users");
    expect(result.rows[0]).toHaveLength(2);
    expect(result.rows[0][0]).toBe("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    expect(result.rows[0][1]).toBe("b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22");
    // columnTypes keyed by numeric index so positional lookup still works.
    expect((result.columnTypes as Record<number, unknown>)[0]).toBeInstanceOf(Uuid);
    expect((result.columnTypes as Record<number, unknown>)[1]).toBeInstanceOf(Uuid);
  });

  it("returns a Result with empty fields when the driver reports none", async () => {
    adapter = makeAdapter(async () => ({ rows: [], fields: [] }));
    const result = await adapter.execQuery("CREATE TABLE x (id int)");
    expect(result).toBeInstanceOf(Result);
    expect(result.length).toBe(0);
  });

  it("selectAll delegates through execQuery so the PG override wins", async () => {
    adapter = makeAdapter(async () => ({
      rows: [["A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11"]],
      fields: [{ name: "guid", dataTypeID: UUID_OID }],
    }));
    const result = await adapter.selectAll("SELECT guid FROM users");
    expect(result).toBeInstanceOf(Result);
    expect(result.columnTypes.guid).toBeInstanceOf(Uuid);
  });
});

describe("PostgreSQLAdapter#lookupCastTypeFromColumn", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(() => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
    // Stub loadAdditionalTypes to avoid a DB roundtrip on miss. Tests
    // that need the miss→resolve path register the OID manually.
    vi.spyOn(adapter, "loadAdditionalTypes").mockResolvedValue(undefined);
    adapter.typeMap.aliasType(UUID_OID, "uuid");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.close().catch(() => undefined);
  });

  it("resolves the OID → Type via the type_map", () => {
    const type = adapter.lookupCastTypeFromColumn({ oid: UUID_OID, name: "guid" });
    expect(type).toBeInstanceOf(Uuid);
  });

  it("falls back to sqlType lookup when oid is missing", () => {
    const type = adapter.lookupCastTypeFromColumn({
      oid: null,
      sqlType: "uuid",
      name: "guid",
    });
    expect(type).toBeInstanceOf(Uuid);
  });

  it("returns a ValueType when neither oid nor sqlType is available", () => {
    const type = adapter.lookupCastTypeFromColumn({});
    expect(type).toBeInstanceOf(ValueType);
  });

  it("normalizes format_type output to typname for the sqlType fallback", () => {
    // pg_catalog.format_type returns "integer", "character varying(255)",
    // etc. Our type_map is keyed by typname (int4, varchar). The
    // fallback needs to map between them so the well-known types
    // resolve when oid is missing.
    expect(adapter.lookupCastTypeFromColumn({ oid: null, sqlType: "integer" })).not.toBeInstanceOf(
      ValueType,
    );
    expect(
      adapter.lookupCastTypeFromColumn({ oid: null, sqlType: "character varying(255)" }),
    ).not.toBeInstanceOf(ValueType);
    expect(adapter.lookupCastTypeFromColumn({ oid: null, sqlType: "bigint" })).not.toBeInstanceOf(
      ValueType,
    );
  });
});
