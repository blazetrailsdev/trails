/* eslint-disable @typescript-eslint/no-explicit-any -- probe: an erased (`any`) receiver is the thing under test; see FINDINGS "Walls 9-11". */
// The failing statement is `SELECT sqlite_version(*)`. Does prepare accept it?
// js_sqlite_prepare returns -1 on failure, and nanbox maps only 0 -> null,
// so a rejected prepare would yield a valid-looking but unusable handle.
import Database from "better-sqlite3";
const db = new Database(":memory:") as any;

function probe(label: string, sql: string): void {
  try {
    const s = db.prepare(sql);
    console.log(label, "prepare ok; typeof =", typeof s);
    try {
      console.log(label, "get() ->", JSON.stringify(s.get()));
    } catch (e) {
      console.log(label, "get() threw:", String((e as Error)?.message));
    }
    try {
      console.log(label, "run() ->", JSON.stringify(s.run()));
    } catch (e) {
      console.log(label, "run() threw:", String((e as Error)?.message));
    }
  } catch (e) {
    console.log(label, "prepare THREW:", String((e as Error)?.message));
  }
}

probe("[v1] star-arg   ", "SELECT sqlite_version(*)");
probe("[v2] no-arg     ", "SELECT sqlite_version()");
probe("[v3] plain select", "SELECT 1 AS one");
