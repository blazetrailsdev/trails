import { it, expect } from "vitest";
import { File, getOs } from "@blazetrails/ruby-compat";
import { SQLite3Constants } from "../sqlite-adapter.js";
import { Backup } from "./backup.js";
import { betterSqlite3Driver } from "./better-sqlite3.js";

it("SQLite3::Backup backup all", async () => {
  const file = `${getOs().tmpdir()}/backup-${Date.now()}-${Math.random()}.sqlite3`;
  const sdb = await betterSqlite3Driver.open({ database: file });
  const ddb = await betterSqlite3Driver.open({ database: ":memory:" });
  await sdb.exec(
    "CREATE TABLE bar (id INTEGER PRIMARY KEY, foo_id INTEGER REFERENCES foo(id));" +
      "CREATE TABLE foo (id INTEGER PRIMARY KEY AUTOINCREMENT, val);" +
      "CREATE INDEX index_foo_on_val ON foo (val);" +
      "INSERT INTO foo (val) VALUES ('A'), ('B'), ('C'); DELETE FROM foo WHERE val = 'C';" +
      "INSERT INTO bar (foo_id) VALUES (2);",
  );
  await ddb.pragma("foreign_keys = ON");
  const b = new Backup(ddb, "main", sdb, "main");
  expect(await b.step(-1)).toBe(SQLite3Constants.ErrorCode.DONE);
  b.finish();
  expect(await ddb.execute("SELECT * FROM foo")).toHaveLength(2);
  expect(await ddb.getFirstValue("SELECT foo_id FROM bar")).toBe(2);
  expect(await ddb.getFirstValue("SELECT seq FROM sqlite_sequence")).toBe(3);
  expect(await ddb.pragma("index_list(foo)")).toHaveLength(1);
  expect(await ddb.pragma("foreign_keys", { simple: true })).toBe(1);
  await sdb.close();
  await ddb.close();
  File.delete(file);
});
