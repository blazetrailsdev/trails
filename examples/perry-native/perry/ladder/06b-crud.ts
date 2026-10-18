// One model against a REAL SQLite connection: create, find, update, destroy.
//
// This rung exists because `06-sqlite` proves less than it looks like it does.
// That rung drives `better-sqlite3` directly, in a 1-module binary, with no
// ActiveRecord in it — and Perry serves it from the bundled
// `perry-ext-better-sqlite3` partial drop-in rather than compiling the
// installed driver. So a green `06` says SQLite is reachable from a native
// binary and says nothing about whether the drop-in behaves the way
// ActiveRecord expects it to.
//
// This rung asks that question instead: the four operations an application
// actually performs, through ActiveRecord, over a connection the adapter
// opened. It sits between `06` (driver, no framework) and `07` (whole
// framework boot), so a failure here names adapter parity rather than scale.
import { Base } from "@blazetrails/activerecord";

class Trail extends Base {
  declare name: string;
  declare length: number;
}

await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });

const conn = await Base.leaseConnection();
await conn.createTable("trails", { force: true }, (t) => {
  t.string("name");
  t.integer("length");
  t.timestamps();
});

const created = await Trail.create({ name: "Ridge", length: 12 });
const id = created.id;

const found = await Trail.find(id);
await found.update({ length: 14 });

const reread = await Trail.find(id);
const afterUpdate = reread.length;

await reread.destroy();
const remaining = await Trail.count();

console.log(`[06b] id=${typeof id === "number" ? "num" : typeof id} length=${afterUpdate} count=${remaining}`);
