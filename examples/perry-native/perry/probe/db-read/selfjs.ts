// The real spelling: a .ts module importing its own namespace as "./selfjs.js",
// exactly as activesupport/core-ext/date-and-time/calculations.ts:9 does.
import * as self from "./selfjs.js";

export function f(): number {
  return 1;
}
export class K {}

console.log("[J1] typeof self      =", typeof self);
console.log("[J2] typeof self.f    =", typeof (self as { f?: unknown })?.f);
console.log("[J3] typeof self.K    =", typeof (self as { K?: unknown })?.K);
console.log("[J4] include-shaped    =", String((self as { f?: unknown }) === undefined));
