import * as self from "./selfns2.ts";

export function f(): number {
  return 1;
}
export const C = 7;

// (a) DIRECT member reads -- codegen can resolve these to this module's own
//     perry_fn_* symbols without materializing a namespace object.
console.log("[a1] self.f()          =", self.f());
console.log("[a2] typeof self.f     =", typeof self.f);
console.log("[a3] self.C            =", self.C);

// (b) WHOLE-NAMESPACE reads -- these need the namespace OBJECT to exist.
//     This is what activesupport does: include(RubyTime, DateAndTimeCalculations).
function takesWhole(ns: unknown): string {
  if (ns === undefined) return "WHOLE-NS IS UNDEFINED";
  if (ns === null) return "WHOLE-NS IS NULL";
  return (
    "ok typeof=" +
    typeof ns +
    " keys=" +
    JSON.stringify(Object.getOwnPropertyNames(ns as object).sort())
  );
}
console.log("[b1] whole namespace   =", takesWhole(self));
console.log("[b2] typeof self       =", typeof self);
