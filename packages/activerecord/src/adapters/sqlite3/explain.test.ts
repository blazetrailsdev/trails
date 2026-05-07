/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/explain_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";

let adapter: SQLite3Adapter;

beforeEach(() => {
  adapter = new SQLite3Adapter(":memory:");
});

afterEach(() => {
  adapter.close();
});

// -- Rails test class: explain_test.rb --
describe("SQLite3ExplainTest", () => {
  it("explain for one query", async () => {
    adapter.exec(`CREATE TABLE "explain_items" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
    const result = await adapter.explain(`SELECT * FROM "explain_items" WHERE "id" = 1`);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  // null-overridden: needs eager loading + explain integration
  // it.skip("explain with eager loading", () => {});
  it.skip("explain with eager loading", () => {
    // BLOCKED: adapter-sqlite — SQLite-specific adapter gap in explain
    // ROOT-CAUSE: adapters/sqlite3/explain.ts missing Rails parity
    // SCOPE: ~30–100 LOC fix in adapters/sqlite3/explain.ts; affects ~1–17 tests in explain.test.ts
  });
});
