import { describe, expect, test } from "vitest";
import "../sqlite/better-sqlite3.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { defineSchema } from "./define-schema.js";
import { loadCanonicalSchema } from "./canonical-schema.js";
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
