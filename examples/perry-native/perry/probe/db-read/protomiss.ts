/* eslint-disable @typescript-eslint/no-explicit-any -- probe: an erased (`any`) receiver is the thing under test; see FINDINGS "Walls 9-11". */
// StatementInvalid.prototype.setQuery is missing at construction.
// Is it this class, this chain, or any imported class's own method?
import {
  StatementInvalid,
  QueryAborted,
  AdapterError,
  ActiveRecordError,
} from "@blazetrails/activerecord";

const si = new StatementInvalid("x");
console.log("[k1] instanceof SI      =", si instanceof StatementInvalid);
console.log("[k2] typeof setQuery    =", typeof (si as any).setQuery);
console.log(
  "[k3] proto own names    =",
  JSON.stringify(Object.getOwnPropertyNames(Object.getPrototypeOf(si))),
);
console.log(
  "[k4] SI.prototype names =",
  JSON.stringify(Object.getOwnPropertyNames(StatementInvalid.prototype)),
);
console.log("[k5] proto === SI.proto =", Object.getPrototypeOf(si) === StatementInvalid.prototype);

// walk the whole chain
let p: any = Object.getPrototypeOf(si);
const chain: string[] = [];
for (let i = 0; p && i < 8; i++) {
  chain.push(String(p.constructor?.name) + ":[" + Object.getOwnPropertyNames(p).join(",") + "]");
  p = Object.getPrototypeOf(p);
}
console.log("[k6] chain =", chain.join(" -> "));

// subclass
const qa = new QueryAborted("y");
console.log("[k7] QueryAborted setQuery =", typeof (qa as any).setQuery);
console.log(
  "[k8] AdapterError exists   =",
  typeof AdapterError,
  "| ARError",
  typeof ActiveRecordError,
);
