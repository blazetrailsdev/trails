/* eslint-disable @typescript-eslint/no-explicit-any -- probe */
// Wall 11 bisect: my own 2-file class (keeps its methods at 3 modules) plus a
// bulk import purely to inflate the graph. If Leaf now loses its methods, the
// trigger is graph SIZE and this is the repro: two small files + one import.
import { Leaf, Exc } from "./twofile-dep.ts";
import { pluralize } from "@blazetrails/activesupport";

function names(label: string, ctor: unknown): void {
  const proto = (ctor as { prototype?: object }).prototype;
  console.log(label, "=", JSON.stringify(Object.getOwnPropertyNames(proto ?? {}).sort()));
}
names("Leaf", Leaf);
names("Exc ", Exc);
console.log("bulk import present =", typeof pluralize === "function");

const l = new Leaf("boom");
console.log("instanceof Leaf     =", l instanceof Leaf);
console.log("typeof selfUnion    =", typeof (l as any).selfUnion);
console.log("typeof returnsPlain =", typeof (l as any).returnsPlain);
