/* eslint-disable @typescript-eslint/no-explicit-any -- probe: an erased (`any`) receiver is the thing under test; see FINDINGS "Walls 9-11". */
// Does a spread call into the native table lose its return value?
// Call methods directly (never capture them as values -- a handle property
// read returns undefined in Perry, which would mask the thing under test).
import Database from "better-sqlite3";
const db = new Database(":memory:") as any;
db.exec("create table t (id integer primary key autoincrement, v text)");

const ins = db.prepare("insert into t (v) values ('x')");
console.log("[r1] run() direct      =", JSON.stringify(ins.run()));
const none: unknown[] = [];
console.log("[r2] run(...emptyVar)  =", JSON.stringify(ins.run(...none)));
console.log("[r3] run(...[])        =", JSON.stringify(ins.run(...[])));
const viaClosure = ((args: unknown[]) => ins.run(...args))(none);
console.log("[r4] run via closure   =", JSON.stringify(viaClosure));

const sel = db.prepare("select count(*) as n from t");
console.log("[r5] get() direct      =", JSON.stringify(sel.get()));
console.log("[r6] get(...[]) spread =", JSON.stringify(sel.get(...([] as unknown[]))));

const bound = db.prepare("insert into t (v) values (?)");
console.log("[r7] run('a') direct   =", JSON.stringify(bound.run("a")));
const one: unknown[] = ["b"];
console.log("[r8] run(...['b'])     =", JSON.stringify(bound.run(...one)));
