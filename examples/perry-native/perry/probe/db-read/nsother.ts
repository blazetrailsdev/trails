// Control: whole-namespace read of ANOTHER module (not self).
import * as dep from "./ns-dep.ts";

function takesWhole(ns: unknown): string {
  if (ns === undefined) return "WHOLE-NS IS UNDEFINED";
  return (
    "ok typeof=" +
    typeof ns +
    " keys=" +
    JSON.stringify(Object.getOwnPropertyNames(ns as object).sort())
  );
}
console.log("[n1] dep.f()           =", dep.f());
console.log("[n2] whole namespace   =", takesWhole(dep));
