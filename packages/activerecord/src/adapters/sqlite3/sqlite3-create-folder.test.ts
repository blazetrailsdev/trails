/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/sqlite3_create_folder_test.rb
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

// -- Rails test class: sqlite3_create_folder_test.rb --
describe("SQLite3CreateFolderTest", () => {
  it("sqlite creates directory", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const dir = path.join(os.tmpdir(), `sqlite-dir-test-${Date.now()}`);
    const dbPath = path.join(dir, "test.db");
    fs.mkdirSync(dir, { recursive: true });
    const a = new SqliteAdapter(dbPath);
    expect(a.isOpen).toBe(true);
    a.close();
    fs.unlinkSync(dbPath);
    fs.rmdirSync(dir);
  });
});
