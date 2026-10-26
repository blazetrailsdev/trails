/* eslint-disable @typescript-eslint/no-explicit-any -- probe: an erased (`any`) receiver is the thing under test; see FINDINGS "Walls 9-11". */
// Static native-table lowering (typed receiver) vs dynamic handle-method
// dispatch (erased receiver), on the SAME handle. Every earlier probe used
// `as any` and so only ever tested the dynamic path.
import Database from "better-sqlite3";

const db = new Database(":memory:"); // typed Database
db.exec("create table t (id integer primary key autoincrement, v text)");

const stmt = db.prepare("insert into t (v) values ('A')"); // typed Statement
console.log("[n1] TYPED   run() ->", JSON.stringify(stmt.run()));

const erased = stmt as any;
console.log("[n2] ERASED  run() ->", JSON.stringify(erased.run()));

const stmt2 = db.prepare("select count(*) as n from t");
console.log("[n3] TYPED   get() ->", JSON.stringify(stmt2.get()));
console.log("[n4] ERASED  get() ->", JSON.stringify((stmt2 as any).get()));

// the real adapter's shape: typed field
class TypedWrap {
  constructor(private readonly s: Database.Statement) {}
  go(): unknown {
    return this.s.run();
  }
}
console.log(
  "[n5] TYPED field run ->",
  JSON.stringify(new TypedWrap(db.prepare("insert into t (v) values ('B')")).go()),
);

// and the version query, typed
const ver = db.prepare("SELECT sqlite_version(*)");
console.log("[n6] TYPED  version get() ->", JSON.stringify(ver.get()));
console.log("[n7] ERASED version get() ->", JSON.stringify((ver as any).get()));
