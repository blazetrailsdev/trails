import { describe, it, expect, afterEach } from "vitest";
import { Base } from "../index.js";
import { columnsOf } from "./define-schema.js";
import { setupFixtures } from "./fixtures.js";
import { TEST_SCHEMA } from "./test-schema.js";
import {
  driftedTables,
  repairWorkerSchema,
  recordRepairMetrics,
  repairMetricsSnapshot,
} from "./schema-repair.js";

/** The physical column set a canonical table has when undrifted (lowercased). */
function canonicalCols(table: keyof typeof TEST_SCHEMA): Set<string> {
  const cols = Object.keys(columnsOf(TEST_SCHEMA[table])).map((c) => c.toLowerCase());
  return new Set(["id", ...cols]);
}

describe("schema-repair", () => {
  describe("driftedTables (pure)", () => {
    // Only the official TEST_SCHEMA layouts — no invented tables.
    const canonical = { topics: TEST_SCHEMA.topics, posts: TEST_SCHEMA.posts };

    it("flags a canonical table missing entirely", () => {
      const physical = new Map([["posts", canonicalCols("posts")]]);
      expect(driftedTables(physical, canonical)).toEqual(["topics"]);
    });

    it("flags a canonical table missing a declared column", () => {
      const drifted = canonicalCols("topics");
      drifted.delete("author_name"); // what a bespoke `defineSchema` redefine drops
      const physical = new Map([
        ["topics", drifted],
        ["posts", canonicalCols("posts")],
      ]);
      expect(driftedTables(physical, canonical)).toEqual(["topics"]);
    });

    it("ignores extra columns and extra tables (no false positive)", () => {
      const topicsPlus = canonicalCols("topics");
      topicsPlus.add("extra");
      const physical = new Map([
        ["topics", topicsPlus],
        ["posts", canonicalCols("posts")],
        ["bespoke_leftover", new Set(["id"])],
      ]);
      expect(driftedTables(physical, canonical)).toEqual([]);
    });

    it("is case-insensitive on column names", () => {
      const physical = new Map([
        ["topics", new Set([...canonicalCols("topics")].map((c) => c.toUpperCase()))],
        ["posts", canonicalCols("posts")],
      ]);
      expect(driftedTables(physical, canonical)).toEqual([]);
    });
  });

  describe("repairWorkerSchema (live DB)", () => {
    setupFixtures();

    afterEach(async () => {
      // Leave the shared worker DB canonical for sibling files.
      await repairWorkerSchema(Base.connection, TEST_SCHEMA);
    });

    it("restores a canonical table a prior file left in a drifted state", async () => {
      // Simulate the leftover state a bespoke sibling produces: the canonical
      // `topics` no longer matches TEST_SCHEMA on the shared worker DB. Dropping
      // it stands in for the broader "shape diverged" condition driftedTables
      // detects (missing table OR missing declared column).
      const { SchemaStatements } =
        await import("../connection-adapters/abstract/schema-statements.js");
      const conn = Base.connection;
      const ss = conn.schemaStatements ? conn.schemaStatements() : new SchemaStatements(conn);
      await ss.dropTable("topics", { ifExists: true });
      await expect(conn.selectAll("SELECT author_name FROM topics")).rejects.toThrow();

      const repaired = await repairWorkerSchema(conn, TEST_SCHEMA);
      expect(repaired).toContain("topics");

      // The canonical shape is back — what a passive sibling file would read.
      const rows = await conn.selectAll("SELECT author_name FROM topics");
      expect(rows.columns).toEqual(["author_name"]);
    });

    it("is a no-op when nothing drifted", async () => {
      const repaired = await repairWorkerSchema(Base.connection, TEST_SCHEMA);
      expect(repaired).toEqual([]);
    });
  });

  describe("recordRepairMetrics (measurement)", () => {
    // Metrics accumulate at module scope, so assert on deltas from a baseline
    // rather than absolute values (a sibling file may have recorded already).
    it("counts files seen, files repaired, and per-table drift frequency", () => {
      const before = structuredClone(repairMetricsSnapshot());

      recordRepairMetrics([]); // a clean file: seen, not repaired
      recordRepairMetrics(["topics", "posts"]); // one file drifted two tables
      recordRepairMetrics(["topics"]); // another file drifted one

      const after = repairMetricsSnapshot();
      expect(after.filesSeen - before.filesSeen).toBe(3);
      expect(after.filesRepaired - before.filesRepaired).toBe(2);
      expect(after.totalTablesRepaired - before.totalTablesRepaired).toBe(3);
      expect((after.byTable.topics ?? 0) - (before.byTable.topics ?? 0)).toBe(2);
      expect((after.byTable.posts ?? 0) - (before.byTable.posts ?? 0)).toBe(1);
    });
  });
});
