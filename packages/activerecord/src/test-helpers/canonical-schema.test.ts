import { describe, expect, test } from "vitest";
import "../sqlite/better-sqlite3.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { defineSchema } from "./define-schema.js";
import {
  ensureCanonicalTables,
  loadCanonicalSchema,
  rebuildCanonicalTables,
} from "./canonical-schema.js";
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

// Reads sqlite_master through both the object-row and `{ columns, rows }`
// array-row selectAll shapes — the BetterSQLite3Adapter returns the latter, so
// naive `r.type`/`r.name`/`r.sql` access on the array rows yields undefined and
// silently collapses every dump line to "undefined undefined: undefined".
async function dumpSchema(adapter: AbstractAdapter): Promise<string> {
  const res = (await adapter.selectAll(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name, type, sql",
  )) as unknown;
  let objectRows: { type: unknown; name: unknown; sql: unknown }[];
  if (Array.isArray(res)) {
    objectRows = res as { type: unknown; name: unknown; sql: unknown }[];
  } else {
    const { columns, rows } = res as { columns: string[]; rows: unknown[][] };
    const t = columns.indexOf("type");
    const n = columns.indexOf("name");
    const s = columns.indexOf("sql");
    objectRows = rows.map((row) => ({ type: row[t], name: row[n], sql: row[s] }));
  }
  return objectRows.map((r) => `${r.type} ${r.name}: ${r.sql}`).join("\n");
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
      // Content floor: the dump must carry real DDL, not placeholder rows — a
      // shape mismatch collapses every line to "undefined undefined: undefined".
      expect(expected).not.toContain("undefined undefined: undefined");
      expect(expected).toMatch(/table topics: CREATE TABLE "?topics"?/);
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

// Read the live table-name set from sqlite_master, tolerating both the
// object-row and `{ columns, rows }` array-row selectAll shapes.
async function tableNames(adapter: AbstractAdapter): Promise<Set<string>> {
  const res = (await adapter.selectAll(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  )) as unknown;
  if (Array.isArray(res)) {
    return new Set((res as { name: string }[]).map((r) => r.name));
  }
  const { columns, rows } = res as { columns: string[]; rows: unknown[][] };
  const i = columns.indexOf("name");
  return new Set(rows.map((row) => String(row[i])));
}

describe("ensureCanonicalTables", () => {
  test("creates only the missing named tables, restoring canonical shape", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      const canonical = await dumpSchema(adapter);

      // Drop one table; ensure recreates just it (drop-free for the survivors)
      // and restores it to its full canonical shape.
      await adapter.executeMutation("DROP TABLE topics");
      expect(await tableNames(adapter)).not.toContain("topics");

      await ensureCanonicalTables(adapter, ["topics", "authors"]);
      expect(await tableNames(adapter)).toContain("topics");
      expect(await dumpSchema(adapter)).toBe(canonical);
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });

  test("is a no-op when every named table already exists", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      // A drifted `topics` must survive: ensure creates nothing (all present)
      // and — unlike rebuildCanonicalTables — never drops to restore shape.
      await adapter.executeMutation("DROP TABLE topics");
      await adapter.executeMutation("CREATE TABLE topics (id integer PRIMARY KEY, title varchar)");
      const drifted = await dumpSchema(adapter);

      await ensureCanonicalTables(adapter, ["topics", "authors"]);
      expect(await dumpSchema(adapter)).toBe(drifted);
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });

  test("throws on an unknown canonical table name", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      await expect(ensureCanonicalTables(adapter, ["topics", "not_a_real_table"])).rejects.toThrow(
        /unknown canonical table\(s\): not_a_real_table/,
      );
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });
});
