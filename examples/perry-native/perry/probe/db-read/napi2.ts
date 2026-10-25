// Where exactly is the N-API boundary? Database vs Statement, reflection vs dispatch.
import Database from "better-sqlite3";

const db = new Database(":memory:") as unknown as Record<string, unknown>;
console.log("[d1] typeof db.prepare", typeof db.prepare);
console.log("[d2] typeof db.exec", typeof db.exec);
console.log("[d3] typeof db.open (getter)", typeof db.open, "value", String(db.open));
console.log("[d4] db own keys", JSON.stringify(Object.keys(db)));
console.log(
  "[d5] db proto keys",
  JSON.stringify(Object.getOwnPropertyNames(Object.getPrototypeOf(db) ?? {})),
);

// dispatch despite invisible reflection?
const stmt = (db.prepare as (s: string) => unknown)(
  "create table t (id integer primary key)",
) as Record<string, unknown>;
console.log("[s1] typeof stmt.run", typeof stmt.run);
try {
  const r = (stmt.run as () => unknown)();
  console.log("[s2] stmt.run() dispatched ok ->", JSON.stringify(r));
} catch (e) {
  console.log("[s2] stmt.run() threw:", String((e as Error).message));
}
console.log("[s3] 'source' in stmt", "source" in stmt);
console.log(
  "[s4] getOwnPropertyDescriptor source",
  JSON.stringify(Object.getOwnPropertyDescriptor(stmt, "source") ?? null),
);
try {
  (db.exec as (s: string) => unknown)("create table t2 (id integer)");
  console.log("[d6] db.exec dispatched ok");
} catch (e) {
  console.log("[d6] db.exec threw:", String((e as Error).message));
}
