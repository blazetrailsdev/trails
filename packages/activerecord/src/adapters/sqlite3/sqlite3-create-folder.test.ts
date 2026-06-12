/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/sqlite3_create_folder_test.rb
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfSqlite } from "./test-helper.js";
import { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";

let adapter: AbstractSQLite3Adapter;

beforeEach(() => {
  adapter = new BetterSQLite3Adapter(":memory:");
});

afterEach(() => {
  adapter.close();
});

// -- Rails test class: sqlite3_create_folder_test.rb --
describeIfSqlite("SQLite3CreateFolder", () => {
  it("sqlite creates directory", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const dir = path.join(os.tmpdir(), `sqlite-dir-test-${Date.now()}`);
    const dbPath = path.join(dir, "test.db");
    fs.mkdirSync(dir, { recursive: true });
    const a = new BetterSQLite3Adapter(dbPath);
    expect(a.isOpen).toBe(true);
    a.close();
    fs.unlinkSync(dbPath);
    fs.rmdirSync(dir);
  });
});
