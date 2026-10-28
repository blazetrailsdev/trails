// A module that imports its own namespace, as
// activesupport/src/core-ext/date-and-time/calculations.ts:9 does in order to
// pass itself to include(). Node: object / function / 1. Perry: ?
import * as self from "./selfns.ts";

export function f(): number {
  return 1;
}

console.log("[S1] typeof self      =", typeof self);
console.log("[S2] typeof self.f    =", typeof (self as { f?: unknown })?.f);
console.log("[S3] self.f()         =", (self as { f?: () => number })?.f?.());
