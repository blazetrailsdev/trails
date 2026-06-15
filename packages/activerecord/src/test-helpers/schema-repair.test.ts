import { describe, it, expect, afterEach } from "vitest";
import { Base } from "../index.js";
import { columnsOf } from "./define-schema.js";
import { setupHandlerSuite } from "./setup-handler-suite.js";
import { TEST_SCHEMA } from "./test-schema.js";
import { driftedTables, repairWorkerSchema } from "./schema-repair.js";

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
    setupHandlerSuite();

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
});
