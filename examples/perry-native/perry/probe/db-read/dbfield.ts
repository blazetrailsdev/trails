/* eslint-disable @typescript-eslint/no-explicit-any -- probe: an erased (`any`) receiver is the thing under test; see FINDINGS "Walls 9-11". */
// Untested cell: the DATABASE as a class field, as BetterSqlite3Driver holds it.
// js_sqlite_prepare returns -1 on failure; a bogus handle would make run()
// return undefined without throwing.
import Database from "better-sqlite3";

class Driver {
  private readonly raw: any;
  constructor(path: string) {
    this.raw = new Database(path);
  }
  exec(sql: string): void {
    this.raw.exec(sql);
  }
  prepareAndRun(sql: string): unknown {
    const stmt = this.raw.prepare(sql);
    console.log("[d1] stmt typeof =", typeof stmt, "| String =", String(stmt));
    return stmt.run();
  }
  prepareOnly(sql: string): any {
    return this.raw.prepare(sql);
  }
}

const d = new Driver(":memory:");
d.exec("create table t (id integer primary key autoincrement, v text)");
console.log(
  "[d2] field-db prepare+run =",
  JSON.stringify(d.prepareAndRun("insert into t (v) values ('A')")),
);

// prepare through the field, run outside the class
const s = d.prepareOnly("insert into t (v) values ('B')");
console.log("[d3] run outside class    =", JSON.stringify(s.run()));

// control: module-level db, same calls
const plain = new Database(":memory:") as any;
plain.exec("create table t (id integer primary key autoincrement, v text)");
console.log(
  "[d4] const-db control     =",
  JSON.stringify(plain.prepare("insert into t (v) values ('C')").run()),
);

// DDL through a prepared statement, as the step probe does
const d2 = new Driver(":memory:");
console.log(
  "[d5] DDL via prepare+run  =",
  JSON.stringify(d2.prepareAndRun("create table trails (id integer primary key, name text)")),
);
