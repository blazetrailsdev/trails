// better-sqlite3, the driver the scaffold's ActiveRecord config uses.
//
// This rung passes, but read the result carefully: Perry does not compile the
// installed driver. It reports
//
//   serving `better-sqlite3` from the bundled native binding
//   `perry-ext-better-sqlite3` (a partial drop-in), ignoring your installed
//   `node_modules/better-sqlite3`
//
// so what works here is Perry's own partial reimplementation, not the module
// ActiveRecord was tested against. Compiling the real JS needs
// `perry.compilePackages`. A green row is therefore evidence that SQLite is
// reachable from a native binary, and not evidence of driver parity.
import Database from "better-sqlite3";
const db = new Database(":memory:");
db.exec("create table trails (id integer primary key, name text)");
db.prepare("insert into trails (name) values (?)").run("Ridge");
const row = db.prepare("select name from trails").get() as { name: string };
console.log(`[06] ${row.name}`);
