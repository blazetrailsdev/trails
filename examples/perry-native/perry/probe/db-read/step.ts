// Narrowing 06d: which step of the adapter path actually fails?
import { BetterSQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/better-sqlite3-adapter.js";

const adapter = new BetterSQLite3Adapter({
  adapter: "better_sqlite3",
  database: ":memory:",
});

console.log("[s1] constructed", typeof adapter);
console.log("[s2] execute is", typeof (adapter as unknown as Record<string, unknown>).execute);
console.log(
  "[s3] selectRows is",
  typeof (adapter as unknown as Record<string, unknown>).selectRows,
);

try {
  await adapter.execute("create table trails (id integer primary key, name text)");
  console.log("[s4] create table ok");
} catch (e) {
  const err = e as Record<string, unknown>;
  console.log("[s4] threw; typeof", typeof e);
  console.log("[s4] message", String(err.message));
  console.log("[s4] setQuery is", typeof err.setQuery);
}
