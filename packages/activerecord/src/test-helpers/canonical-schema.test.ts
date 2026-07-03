import { describe, expect, test } from "vitest";
import "../sqlite/better-sqlite3.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { defineSchema } from "./define-schema.js";
import { loadCanonicalSchema, rebuildCanonicalTables } from "./canonical-schema.js";
import { TEST_SCHEMA } from "./test-schema.js";

// Phase-1 invariant (RFC 0059): `loadCanonicalSchema` must lay down byte-for-byte
// the same schema `defineSchema(TEST_SCHEMA)` does. This guards against drift
// while both live in parallel (phases 2–3) — e.g. a column added to test-schema.ts
// but not to the loader. Deleted alongside defineSchema/TEST_SCHEMA in phase 4.
//
// Runs on SQLite regardless of the ambient ARCONN adapter (it constructs its own
// in-memory adapters), which is where any faithful-transcription slip surfaces:
// column names, types, defaults, nullability, PKs, and indexes all appear in the
// dumped DDL. The per-adapter transforms (serialIdType, DATETIME(6)) are shared
// code imported from define-schema.ts, so PG/MySQL cannot diverge independently.

async function dumpSchema(adapter: AbstractAdapter): Promise<string> {
  const res = (await adapter.selectAll(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name, type, sql",
  )) as unknown;
  const rows = (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as {
    type: string;
    name: string;
    sql: string;
  }[];
  return rows.map((r) => `${r.type} ${r.name}: ${r.sql}`).join("\n");
}

describe("loadCanonicalSchema", () => {
  test("lays down byte-for-byte the same schema as defineSchema(TEST_SCHEMA)", async () => {
    const viaDefineSchema = new BetterSQLite3Adapter(":memory:");
    const viaLoader = new BetterSQLite3Adapter(":memory:");
    try {
      await defineSchema(viaDefineSchema as unknown as AbstractAdapter, TEST_SCHEMA);
      await loadCanonicalSchema(viaLoader as unknown as AbstractAdapter);

      const expected = await dumpSchema(viaDefineSchema as unknown as AbstractAdapter);
      const actual = await dumpSchema(viaLoader as unknown as AbstractAdapter);

      expect(actual).toBe(expected);
      // Sanity floor: the canonical schema is hundreds of tables + indexes, so a
      // silently-empty dump (both empty ⇒ trivially equal) can't pass this test.
      expect(expected.split("\n").length).toBeGreaterThan(300);
    } finally {
      await viaDefineSchema.close();
      await viaLoader.close();
    }
  });
});

describe("rebuildCanonicalTables", () => {
  test("drops + recreates a named subset to its canonical shape", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      const canonical = await dumpSchema(adapter);

      // Simulate a sibling file drifting `topics` to a reduced shape on the
      // shared DB, then rebuild it back to canonical.
      await adapter.executeMutation("DROP TABLE topics");
      await adapter.executeMutation("CREATE TABLE topics (id integer PRIMARY KEY, title varchar)");
      expect(await dumpSchema(adapter)).not.toBe(canonical);

      await rebuildCanonicalTables(adapter, ["topics"]);
      expect(await dumpSchema(adapter)).toBe(canonical);
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });

  test("throws on an unknown canonical table name", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      await expect(rebuildCanonicalTables(adapter, ["topics", "not_a_real_table"])).rejects.toThrow(
        /unknown canonical table\(s\): not_a_real_table/,
      );
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });
});
