import { describe, expect, test } from "vitest";
import "../sqlite/better-sqlite3.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { loadCanonicalSchema } from "./canonical-schema.js";

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

      expect(dump.split("\n").length).toBeGreaterThan(300);
      expect(dump).not.toContain("undefined undefined: undefined");
      expect(dump).toMatch(/table topics: CREATE TABLE "?topics"?/);
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });
});
