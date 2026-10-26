/* eslint-disable @typescript-eslint/no-explicit-any -- probe: an erased (`any`) receiver is the thing under test; see FINDINGS "Walls 9-11". */
// Does a native-table call lose its return value when the receiver is a
// class field rather than a local?
import Database from "better-sqlite3";
const db = new Database(":memory:") as any;
db.exec("create table t (id integer primary key autoincrement, v text)");

// A: local const receiver (known to work)
const local = db.prepare("insert into t (v) values ('A')");
console.log("[f1] local const      =", JSON.stringify(local.run()));

// B: class field receiver, exactly BetterSqlite3Statement's shape
class Wrap {
  constructor(private readonly stmt: any) {}
  direct(): unknown {
    return this.stmt.run();
  }
  viaClosure(): unknown {
    const call = (): unknown => this.stmt.run();
    return call();
  }
  viaLocalCopy(): unknown {
    const s = this.stmt;
    return s.run();
  }
}
const w = new Wrap(db.prepare("insert into t (v) values ('B')"));
console.log("[f2] field direct     =", JSON.stringify(w.direct()));
console.log("[f3] field via closure=", JSON.stringify(w.viaClosure()));
console.log("[f4] field local copy =", JSON.stringify(w.viaLocalCopy()));

// C: plain function parameter
function viaParam(s: any): unknown {
  return s.run();
}
console.log(
  "[f5] via parameter    =",
  JSON.stringify(viaParam(db.prepare("insert into t (v) values ('C')"))),
);

// D: object property (not a class)
const holder = { stmt: db.prepare("insert into t (v) values ('D')") };
console.log("[f6] object property  =", JSON.stringify(holder.stmt.run()));
