/* eslint-disable @typescript-eslint/no-explicit-any -- probe */
// An unresolved RELATIVE import of a class. Node refuses to run at all;
// Perry warns once and compiles a program whose class is silently empty.
//
//   node:  npx tsx repro-unresolved.ts     -> ERR_MODULE_NOT_FOUND
//   perry: perry compile repro-unresolved.ts -o r && ./r   -> runs, all wrong
import { Thing } from "./definitely-does-not-exist.ts";

const t = new Thing();
console.log("new Thing() succeeded  =", t !== undefined);
console.log("t instanceof Thing     =", t instanceof Thing);
console.log(
  "prototype own names    =",
  JSON.stringify(Object.getOwnPropertyNames(Object.getPrototypeOf(t) ?? {})),
);
console.log("typeof (t as any).any  =", typeof (t as any).anyMethodAtAll);
console.log("typeof Thing           =", typeof Thing);
