// Is the version query itself returning undefined?
import { betterSqlite3Driver } from "@blazetrails/activerecord/sqlite/better-sqlite3.js";

const db = betterSqlite3Driver.open(":memory:", {});
for (const sql of ["select sqlite_version() as v", "SELECT sqlite_version(*)"]) {
  try {
    const rows = db.prepare(sql).all();
    console.log(`[qv] ${sql} -> ${JSON.stringify(rows)}`);
  } catch (e) {
    console.log(`[qv] ${sql} -> THREW ${String((e as Record<string, unknown>).message)}`);
  }
}
