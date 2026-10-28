// Perry: `stmt.run()` returns `undefined` for any row-returning statement.
// better-sqlite3 allows run() on any statement and returns {changes,lastInsertRowid}.
//
//   node:  npx tsx repro-wall10.ts
//   perry: perry compile repro-wall10.ts -o repro && ./repro
import Database from "better-sqlite3";

const db = new Database(":memory:");
db.exec("create table t (id integer primary key autoincrement, v text)");

// row-returning statements: undefined in perry, {changes:0,...} in node
console.log("select  run() =", JSON.stringify(db.prepare("select 1 as one").run()));
console.log("version run() =", JSON.stringify(db.prepare("SELECT sqlite_version(*)").run()));

// non-row-returning statements: correct in both
console.log("insert  run() =", JSON.stringify(db.prepare("insert into t (v) values ('x')").run()));
console.log("ddl     run() =", JSON.stringify(db.prepare("create table u (id integer)").run()));

// and get() on the same SELECT works, so the statement itself is fine
console.log("select  get() =", JSON.stringify(db.prepare("select 1 as one").get()));
