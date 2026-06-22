/**
 * THROWAWAY INSTRUMENTATION test — guards classifyDdl's SQL classification.
 * Pure string logic, no DB. See ddl-profile.ts.
 */
import { describe, it, expect } from "vitest";
import { classifyDdl } from "./ddl-profile.js";

describe("classifyDdl", () => {
  it("classifies CREATE TABLE and extracts the table name", () => {
    expect(classifyDdl('CREATE TABLE "people" (id integer)')).toEqual({
      op: "CREATE_TABLE",
      table: "people",
    });
    expect(classifyDdl("CREATE TEMPORARY TABLE `tmp` (x int)")).toEqual({
      op: "CREATE_TABLE",
      table: "tmp",
    });
    expect(classifyDdl('CREATE TABLE IF NOT EXISTS "posts" (id int)')?.table).toBe("posts");
  });

  it("classifies DROP TABLE", () => {
    expect(classifyDdl('DROP TABLE "people"')).toEqual({ op: "DROP_TABLE", table: "people" });
    expect(classifyDdl("DROP TABLE IF EXISTS legacy_things")?.op).toBe("DROP_TABLE");
  });

  it("classifies index DDL with the target table", () => {
    expect(classifyDdl('CREATE INDEX "idx" ON "people" (name)')).toEqual({
      op: "ADD_INDEX",
      table: "people",
    });
    expect(classifyDdl('CREATE UNIQUE INDEX "u" ON "accounts" (n)')?.op).toBe("ADD_INDEX");
    expect(classifyDdl('DROP INDEX "idx" ON "people"')).toEqual({
      op: "DROP_INDEX",
      table: "people",
    });
  });

  it("classifies plain ALTER TABLE as a schema change", () => {
    expect(classifyDdl('ALTER TABLE "people" ADD "age" integer')).toEqual({
      op: "ALTER_TABLE",
      table: "people",
    });
  });

  it("classifies DISABLE/ENABLE TRIGGER as referential-integrity, not a schema ALTER", () => {
    expect(classifyDdl('ALTER TABLE "people" DISABLE TRIGGER ALL')).toEqual({
      op: "REFERENTIAL_INTEGRITY",
      table: "people",
    });
    // Combined multi-table statement (PG disableReferentialIntegrity).
    const combined =
      'ALTER TABLE "ar_internal_metadata" ENABLE TRIGGER ALL;ALTER TABLE "people" ENABLE TRIGGER ALL';
    expect(classifyDdl(combined)).toEqual({
      op: "REFERENTIAL_INTEGRITY",
      table: "ar_internal_metadata",
    });
  });

  it("classifies TRUNCATE", () => {
    expect(classifyDdl('TRUNCATE TABLE "people"')?.op).toBe("TRUNCATE");
    expect(classifyDdl('TRUNCATE "people", "posts"')?.table).toBe("people");
  });

  it("returns null for non-DDL (reads / DML)", () => {
    expect(classifyDdl('SELECT * FROM "people"')).toBeNull();
    expect(classifyDdl('INSERT INTO "people" (id) VALUES (1)')).toBeNull();
    expect(classifyDdl('UPDATE "people" SET name = $1')).toBeNull();
    expect(classifyDdl('DELETE FROM "people" WHERE id = 1')).toBeNull();
    expect(classifyDdl("  \n  SELECT 1")).toBeNull();
  });

  it("is case-insensitive on leading whitespace", () => {
    expect(classifyDdl('  create table "x" (a int)')?.op).toBe("CREATE_TABLE");
  });
});
