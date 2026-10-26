/* eslint-disable @typescript-eslint/no-explicit-any -- probe: an erased (`any`) receiver is the thing under test; see FINDINGS "Walls 9-11". */
// Same minimal call, but inside the big ActiveRecord graph.
// If this fails where cross.ts/field.ts pass, the native-table match is
// graph-dependent, not shape-dependent.
import Database from "better-sqlite3";
// pull in the large graph without using it for the call under test
import { BetterSQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/better-sqlite3-adapter.js";

const db = new Database(":memory:") as any;
db.exec("create table t (id integer primary key autoincrement, v text)");
const stmt = db.prepare("insert into t (v) values ('A')");
console.log("[g1] local const run() =", JSON.stringify(stmt.run()));
const none: unknown[] = [];
console.log("[g2] local + spread    =", JSON.stringify(stmt.run(...none)));
console.log("[g3] adapter imported  =", typeof BetterSQLite3Adapter);
