/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/sqlite3_create_folder_test.rb
 */
import { it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describeIfSqlite } from "./test-helper.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";

// -- Rails test class: sqlite3_create_folder_test.rb --
describeIfSqlite("SQLite3CreateFolder", () => {
  it("sqlite creates directory", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-create-folder-"));
    let conn: BetterSQLite3Adapter | undefined;
    try {
      // The `db` subdirectory does not exist yet — the adapter must create it.
      conn = new BetterSQLite3Adapter({
        database: path.join(dir, "db", "foo.sqlite3"),
      });
      await conn.connectBang();

      expect(fs.existsSync(path.join(dir, "db"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "db", "foo.sqlite3"))).toBe(true);
    } finally {
      await conn?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
