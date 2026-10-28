// Self-namespace-import; the whole-NS read happens in an exported function,
// i.e. AFTER this module's init has finished.
import * as self from "./selflate-dep.ts";

export function f(): number {
  return 1;
}
export const C = 7;

export function readWholeLate(): string {
  if (self === undefined) return "WHOLE-NS IS UNDEFINED";
  return (
    "ok typeof=" +
    typeof self +
    " keys=" +
    JSON.stringify(Object.getOwnPropertyNames(self as object).sort())
  );
}

// and the during-init read, for contrast
export const duringInit: string =
  (self as unknown) === undefined ? "UNDEFINED DURING INIT" : "populated during init";
