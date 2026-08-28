import { describe, expect, test } from "vitest";
import "../sqlite/better-sqlite3.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { loadCanonicalSchema } from "./canonical-schema.js";
import { newSqlitePool } from "./pooled-sqlite-adapter.js";
import { ensureCanonicalTables } from "./canonical-table-rebuild.js";

async function dumpSchema(adapter: AbstractAdapter): Promise<string> {
  const res = await adapter.selectAll(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name, type, sql",
  );
  return res
    .toArray()
    .map((r) => `${r.type} ${r.name}: ${r.sql}`)
    .join("\n");
}

async function tableNames(adapter: AbstractAdapter): Promise<Set<string>> {
  const res = await adapter.selectAll("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(res.pluck("name").map((name) => String(name)));
}

describe("ensureCanonicalTables", () => {
  test("creates only the missing named tables, restoring canonical shape", async () => {
    const pool = newSqlitePool();
    const adapter = (await pool.checkout()) as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      const canonical = await dumpSchema(adapter);

      await adapter.executeMutation("DROP TABLE topics");
      expect(await tableNames(adapter)).not.toContain("topics");

      await ensureCanonicalTables(adapter, ["topics", "authors"]);
      expect(await tableNames(adapter)).toContain("topics");
      expect(await dumpSchema(adapter)).toBe(canonical);
    } finally {
      await pool.disconnect();
    }
  });

  test("is a no-op when every named table already exists", async () => {
    const pool = newSqlitePool();
    const adapter = (await pool.checkout()) as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      await adapter.executeMutation("DROP TABLE topics");
      await adapter.executeMutation("CREATE TABLE topics (id integer PRIMARY KEY, title varchar)");
      const drifted = await dumpSchema(adapter);

      await ensureCanonicalTables(adapter, ["topics", "authors"]);
      expect(await dumpSchema(adapter)).toBe(drifted);
    } finally {
      await pool.disconnect();
    }
  });

  test("throws on an unknown canonical table name", async () => {
    const pool = newSqlitePool();
    const adapter = (await pool.checkout()) as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      await expect(ensureCanonicalTables(adapter, ["topics", "not_a_real_table"])).rejects.toThrow(
        /unknown canonical table\(s\): not_a_real_table/,
      );
    } finally {
      await pool.disconnect();
    }
  });
});
