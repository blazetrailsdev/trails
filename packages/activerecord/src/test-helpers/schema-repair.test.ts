import { describe, it, expect, afterEach } from "vitest";
import { Base } from "../index.js";
import { defineSchema } from "./define-schema.js";
import { setupHandlerSuite } from "./setup-handler-suite.js";
import { TEST_SCHEMA } from "./test-schema.js";
import { driftedTables, repairWorkerSchema } from "./schema-repair.js";

describe("schema-repair", () => {
  describe("driftedTables (pure)", () => {
    const canonical = {
      topics: { title: "string", author_name: "string" },
      posts: { title: "string", body: "text" },
    } as const;

    it("flags a canonical table missing entirely", () => {
      const physical = new Map([["posts", new Set(["id", "title", "body"])]]);
      expect(driftedTables(physical, canonical as never)).toEqual(["topics"]);
    });

    it("flags a canonical table missing a declared column", () => {
      const physical = new Map([
        ["topics", new Set(["id", "title"])], // author_name dropped
        ["posts", new Set(["id", "title", "body"])],
      ]);
      expect(driftedTables(physical, canonical as never)).toEqual(["topics"]);
    });

    it("ignores extra columns and extra tables (no false positive)", () => {
      const physical = new Map([
        ["topics", new Set(["id", "title", "author_name", "extra"])],
        ["posts", new Set(["id", "title", "body"])],
        ["bespoke_leftover", new Set(["id"])],
      ]);
      expect(driftedTables(physical, canonical as never)).toEqual([]);
    });

    it("is case-insensitive on column names", () => {
      const physical = new Map([
        ["topics", new Set(["id", "title", "author_name"])],
        ["posts", new Set(["id", "title", "body"])],
      ]);
      expect(driftedTables(physical, canonical as never)).toEqual([]);
    });
  });

  describe("repairWorkerSchema (live DB)", () => {
    setupHandlerSuite();

    afterEach(async () => {
      // Leave the shared worker DB canonical for sibling files.
      await repairWorkerSchema(Base.connection, TEST_SCHEMA);
    });

    it("restores a canonical table drifted to a bespoke shape", async () => {
      // Simulate a sibling file's inline `defineSchema({ topics: { title } })`,
      // which drops the canonical `topics` and recreates it without author_name.
      await defineSchema({ topics: { title: "string" } });
      await expect(Base.connection.selectAll("SELECT author_name FROM topics")).rejects.toThrow();

      const repaired = await repairWorkerSchema(Base.connection, TEST_SCHEMA);
      expect(repaired).toContain("topics");

      // The canonical column is back — what a passive sibling file would read.
      const rows = await Base.connection.selectAll("SELECT author_name FROM topics");
      expect(rows.columns).toEqual(["author_name"]);
    });

    it("is a no-op when nothing drifted", async () => {
      const repaired = await repairWorkerSchema(Base.connection, TEST_SCHEMA);
      expect(repaired).toEqual([]);
    });
  });
});
