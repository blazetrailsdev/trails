// Loading rows out of SQLite through ActiveRecord's adapter, with no model
// layer: no `Base`, no `Relation`, no scoping or delegation.
//
// `06` drives better-sqlite3 directly and proves nothing about the framework.
// `06b` goes through a model and dies in codegen. This rung sits between them
// and asks the narrower question: can ActiveRecord's own SQLite adapter read
// data in a native binary?
import { BetterSQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/better-sqlite3-adapter.js";

const adapter = new BetterSQLite3Adapter({
  adapter: "better_sqlite3",
  database: ":memory:",
});

await adapter.execute("create table trails (id integer primary key, name text, length integer)");
await adapter.execute("insert into trails (name, length) values ('Ridge', 12)");
await adapter.execute("insert into trails (name, length) values ('Saddle', 8)");

const rows = await adapter.selectRows("select name, length from trails order by length", "SQL", []);
const value = await adapter.selectValue("select count(*) from trails", "SQL", []);

console.log(`[06d] rows=${JSON.stringify(rows)} count=${String(value)}`);
