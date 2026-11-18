// Micro-benchmark: one prepare of the feed query through better-sqlite3.
import { readFile } from "fs/promises";
import Database from "better-sqlite3";
const dir = new URL(".", import.meta.url);
const db = new Database(":memory:");
db.exec(await readFile(new URL("prepare-schema.sql", dir), "utf8"));
const sql = (await readFile(new URL("prepare-feed.sql", dir), "utf8")).trim();
const n = 200_000;
for (let i = 0; i < 20_000; i++) db.prepare(sql);
const t = performance.now();
for (let i = 0; i < n; i++) db.prepare(sql);
const dt = performance.now() - t;
const v = db.prepare("select sqlite_version() v").get().v;
console.log(`better-sqlite3 (SQLite ${v}): ${((dt / n) * 1000).toFixed(2)} us/prepare`);
