/**
 * Opt-in DDL profiler test — guards classifyDdl's SQL classification.
 * Pure string logic, no DB. See ddl-profile.ts.
 */
import { describe, it, expect } from "vitest";
import { classifyDdl, classifyStatements } from "./ddl-profile.js";

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
    // PG/SQLite DROP INDEX has no ON clause — fall back to the index name.
    expect(classifyDdl('DROP INDEX "idx_people_on_name"')).toEqual({
      op: "DROP_INDEX",
      table: "idx_people_on_name",
    });
    expect(classifyDdl("DROP INDEX CONCURRENTLY IF EXISTS my_idx")?.table).toBe("my_idx");
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

describe("classifyStatements", () => {
  it("returns a single op for a lone statement", () => {
    expect(classifyStatements('DROP TABLE "people"')).toEqual([
      { op: "DROP_TABLE", table: "people" },
    ]);
  });

  it("splits a ;-joined combined string into per-statement ops", () => {
    // MariaDB combineMultiStatements / PG combined FK-toggle form.
    const combined = 'TRUNCATE TABLE "people";TRUNCATE TABLE "posts";TRUNCATE TABLE "books"';
    expect(classifyStatements(combined)).toEqual([
      { op: "TRUNCATE", table: "people" },
      { op: "TRUNCATE", table: "posts" },
      { op: "TRUNCATE", table: "books" },
    ]);
  });

  it("classifies each table of a combined referential-integrity toggle", () => {
    const combined =
      'ALTER TABLE "people" DISABLE TRIGGER ALL;ALTER TABLE "posts" DISABLE TRIGGER ALL';
    expect(classifyStatements(combined)).toEqual([
      { op: "REFERENTIAL_INTEGRITY", table: "people" },
      { op: "REFERENTIAL_INTEGRITY", table: "posts" },
    ]);
  });

  it("skips empty and non-DDL fragments", () => {
    expect(classifyStatements('DROP TABLE "a";;SELECT 1;DROP TABLE "b";')).toEqual([
      { op: "DROP_TABLE", table: "a" },
      { op: "DROP_TABLE", table: "b" },
    ]);
  });
});
