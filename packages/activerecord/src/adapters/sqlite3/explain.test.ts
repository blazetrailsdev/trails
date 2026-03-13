/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/explain_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteAdapter } from "../sqlite-adapter.js";

let adapter: SqliteAdapter;

beforeEach(() => {
  adapter = new SqliteAdapter(":memory:");
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
});
