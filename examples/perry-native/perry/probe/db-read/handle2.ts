// Was [t13] a real property write, or store-to-load forwarding?
import Database from "better-sqlite3";

const db = new Database(":memory:") as unknown as Record<string, unknown>;
const s1 = (db.prepare as (q: string) => unknown)("select 1") as Record<string, unknown>;

// opaque across a function boundary, dynamic key, read in a separate call
function put(o: Record<string, unknown>, k: string, v: unknown): void {
  o[k] = v;
}
function take(o: Record<string, unknown>, k: string): unknown {
  return o[k];
}

const key = ["probe", "Field"].join("");
put(s1, key, 42);
console.log("[u1] cross-function read =", String(take(s1, key)));
console.log("[u2] keys after write    =", JSON.stringify(Object.keys(s1)));
console.log("[u3] 'in' after write    =", key in s1);
console.log("[u4] same-block read     =", String(s1[key]));

// does it survive being stored and reloaded through an array?
const box: Record<string, unknown>[] = [s1];
console.log("[u5] via array read      =", String(take(box[0], key)));

// a second, independently prepared handle must not share the write
const s2 = (db.prepare as (q: string) => unknown)("select 2") as Record<string, unknown>;
console.log("[u6] other handle sees   =", String(take(s2, key)));
