import { describe, expect, test } from "vitest";
import "../sqlite/better-sqlite3.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { loadCanonicalSchema } from "./canonical-schema.js";

// Runs on SQLite regardless of the ambient ARCONN adapter (it constructs its own
// in-memory adapters), which is where any faithful-transcription slip surfaces:
// column names, types, defaults, nullability, PKs, and indexes all appear in the
// dumped DDL.

// `selectAll` returns a `Result` whose rows are positional arrays; `toArray()`
// maps them to hash rows via the column index, so `r.type`/`r.name`/`r.sql`
// resolve to real values. Reading the raw `{ columns, rows }` array rows
// directly instead silently collapses every dump line to
// "undefined undefined: undefined".
async function dumpSchema(adapter: AbstractAdapter): Promise<string> {
  const res = await adapter.selectAll(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name, type, sql",
  );
  return res
    .toArray()
    .map((r) => `${r.type} ${r.name}: ${r.sql}`)
    .join("\n");
}

describe("loadCanonicalSchema", () => {
  test("lays down real canonical DDL for hundreds of tables", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      const dump = await dumpSchema(adapter);

      // Sanity floor: the canonical schema is hundreds of tables + indexes, so a
      // silently-empty dump can't pass this test.
      expect(dump.split("\n").length).toBeGreaterThan(300);
      // Content floor: the dump must carry real DDL, not placeholder rows — a
      // shape mismatch collapses every line to "undefined undefined: undefined".
      expect(dump).not.toContain("undefined undefined: undefined");
      expect(dump).toMatch(/table topics: CREATE TABLE "?topics"?/);
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });
});
