// Does Perry surface getters on better-sqlite3's native Statement object?
import Database from "better-sqlite3";

const db = new Database(":memory:");
console.log("[n1] db typeof", typeof db);
const stmt = db.prepare("create table t (id integer primary key, name text)");
console.log("[n2] stmt typeof", typeof stmt);
console.log("[n3] stmt.source typeof", typeof (stmt as unknown as Record<string, unknown>).source);
console.log("[n4] stmt.source value", String((stmt as unknown as Record<string, unknown>).source));
console.log("[n5] stmt.reader typeof", typeof (stmt as unknown as Record<string, unknown>).reader);
console.log("[n6] own keys", JSON.stringify(Object.keys(stmt as object)));
const proto = Object.getPrototypeOf(stmt);
console.log("[n7] proto keys", JSON.stringify(Object.getOwnPropertyNames(proto ?? {})));
console.log("[n8] run typeof", typeof (stmt as unknown as Record<string, unknown>).run);
