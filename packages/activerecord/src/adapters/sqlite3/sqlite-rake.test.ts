import { it } from "vitest";
import { describeIfSqlite } from "./test-helper.js";

describeIfSqlite("SqliteDBCreateTest", () => {
  it.skip("db checks database exists", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
  it.skip("when db created successfully outputs info to stdout", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
  it.skip("db create when file exists", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
  it.skip("db create with file does nothing", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
  it.skip("db create establishes a connection", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
  it.skip("db create with error prints message", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
});

describeIfSqlite("SqliteDBDropTest", () => {
  it.skip("checks db dir is absolute", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
  it.skip("removes file with absolute path", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
  it.skip("generates absolute path with given root", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
  it.skip("removes file with relative path", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
  it.skip("when db dropped successfully outputs info to stdout", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
});

describeIfSqlite("SqliteDBCharsetTest", () => {
  it.skip("db retrieves charset", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
});

describeIfSqlite("SqliteDBCollationTest", () => {
  it.skip("db retrieves collation", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
});

describeIfSqlite("SqliteStructureDumpTest", () => {
  it.skip("structure dump", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
  it.skip("structure dump with ignore tables", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
  it.skip("structure dump execution fails", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
});

describeIfSqlite("SqliteStructureLoadTest", () => {
  it.skip("structure load", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — rake
  });
});
