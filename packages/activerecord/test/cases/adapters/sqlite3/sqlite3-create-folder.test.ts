import { it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describeIfSqlite } from "../../../support/describe-if-sqlite.js";
import { SQLite3Adapter } from "../../../../lib/connection-adapters/sqlite3-adapter.js";

describeIfSqlite("SQLite3CreateFolder", () => {
  it("sqlite creates directory", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-create-folder-"));
    let conn: SQLite3Adapter | undefined;
    try {
      conn = new SQLite3Adapter({
        database: path.join(dir, "db", "foo.sqlite3"),
      });
      await conn.connectBang();

      expect(fs.existsSync(path.join(dir, "db"))).toBeTruthy();
      expect(fs.existsSync(path.join(dir, "db", "foo.sqlite3"))).toBeTruthy();
    } finally {
      await conn?.disconnectBang();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
