/* eslint-disable @typescript-eslint/no-explicit-any -- probe: an erased (`any`) receiver is the thing under test; see FINDINGS "Walls 9-11". */
// The untested cell: field receiver AND spread args together.
import Database from "better-sqlite3";
const db = new Database(":memory:") as any;
db.exec("create table t (id integer primary key autoincrement, v text)");

const none: unknown[] = [];

// local receiver + spread  (already known good)
const local = db.prepare("insert into t (v) values ('A')");
console.log("[x1] local + spread   =", JSON.stringify(local.run(...none)));

class Wrap {
  constructor(private readonly stmt: any) {}
  noSpread(): unknown {
    return this.stmt.run();
  }
  withSpread(args: unknown[]): unknown {
    return this.stmt.run(...args);
  }
  withSpreadInClosure(args: unknown[]): unknown {
    const call = (a: unknown[]): unknown => this.stmt.run(...a);
    return call(args);
  }
  // generic, like bind<T>
  generic<T>(args: unknown[], call: (a: unknown[]) => T): T {
    return call(args);
  }
  viaGeneric(args: unknown[]): unknown {
    return this.generic(args, (a) => this.stmt.run(...a));
  }
}

console.log(
  "[x2] field, no spread =",
  JSON.stringify(new Wrap(db.prepare("insert into t (v) values ('B')")).noSpread()),
);
console.log(
  "[x3] field + spread   =",
  JSON.stringify(new Wrap(db.prepare("insert into t (v) values ('C')")).withSpread(none)),
);
console.log(
  "[x4] field+spread+clos=",
  JSON.stringify(new Wrap(db.prepare("insert into t (v) values ('D')")).withSpreadInClosure(none)),
);
console.log(
  "[x5] via generic<T>   =",
  JSON.stringify(new Wrap(db.prepare("insert into t (v) values ('E')")).viaGeneric(none)),
);
