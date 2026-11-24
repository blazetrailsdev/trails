import { SQLite3 } from "../lib/index.js";
import { it, expect } from "vitest";
import { File, getOs } from "@blazetrails/ruby-compat";
import { Backup } from "../lib/backup.js";
import { engine } from "../lib/engine/better-sqlite3.js";

it("SQLite3::Backup backup all", async () => {
  const file = `${getOs().tmpdir()}/backup-${Date.now()}-${Math.random()}.sqlite3`;
  const sdb = new SQLite3.Database(file, { engine });
  const ddb = new SQLite3.Database(":memory:", { engine });
  await sdb.executeBatch(
    "CREATE TABLE bar (id INTEGER PRIMARY KEY, foo_id INTEGER REFERENCES foo(id));" +
      "CREATE TABLE foo (id INTEGER PRIMARY KEY AUTOINCREMENT, val);" +
      "CREATE INDEX index_foo_on_val ON foo (val);" +
      "INSERT INTO foo (val) VALUES ('A'), ('B'), ('C'); DELETE FROM foo WHERE val = 'C';" +
      "INSERT INTO bar (foo_id) VALUES (2);",
  );
  await ddb.setForeignKeys(true);
  const b = new Backup(ddb, "main", sdb, "main");
  expect(await b.step(-1)).toBe(SQLite3.Constants.ErrorCode.DONE);
  b.finish();
  expect(await ddb.execute("SELECT * FROM foo")).toHaveLength(2);
  expect(await ddb.getFirstValue("SELECT foo_id FROM bar")).toBe(2);
  expect(await ddb.getFirstValue("SELECT seq FROM sqlite_sequence")).toBe(3);
  expect(await ddb.execute("PRAGMA index_list(foo)")).toHaveLength(1);
  expect(await ddb.getFirstValue("PRAGMA foreign_keys")).toBe(1);
  await Promise.all([sdb.close(), ddb.close()]);
  File.delete(file);
});
