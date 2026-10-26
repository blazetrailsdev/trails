// Is a sqlite Statement a primitive number, or an object with no properties?
import Database from "better-sqlite3";

const db = new Database(":memory:") as unknown as Record<string, unknown>;
const s1 = (db.prepare as (q: string) => unknown)("select 1") as Record<string, unknown>;
const s2 = (db.prepare as (q: string) => unknown)("select 2") as Record<string, unknown>;

console.log("[t1] typeof db  =", typeof db);
console.log("[t2] typeof s1  =", typeof s1);
console.log("[t3] String(s1) =", String(s1));
console.log("[t4] Number(s1) =", String(Number(s1)));
console.log("[t5] s1 + 0     =", String((s1 as unknown as number) + 0));
console.log("[t6] isInteger  =", Number.isInteger(s1 as unknown as number));
console.log("[t7] instanceof Object =", s1 instanceof Object);
console.log("[t8] proto === Object.prototype =", Object.getPrototypeOf(s1) === Object.prototype);
console.log("[t9] proto is null =", Object.getPrototypeOf(s1) === null);
console.log("[t10] JSON =", JSON.stringify({ s: s1 }));
console.log("[t11] s1 === s2 =", (s1 as unknown) === (s2 as unknown));
console.log("[t12] s1 == s2 (loose) =", (s1 as unknown as number) == (s2 as unknown as number));

// decisive: a write to a primitive is silently dropped in sloppy mode
(s1 as Record<string, unknown>).probeField = 42;
console.log("[t13] write stuck? =", String((s1 as Record<string, unknown>).probeField));
