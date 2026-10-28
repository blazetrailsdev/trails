/* eslint-disable @typescript-eslint/no-explicit-any -- probe */
// Two modules, nothing else. Does a class lose its own methods merely by being
// imported? Local classes kept theirs (sigshape.ts); the barrel-imported
// StatementInvalid did not.
import { Leaf, Mid, Exc } from "./twofile-dep.ts";

function names(label: string, ctor: unknown): void {
  const proto = (ctor as { prototype?: object }).prototype;
  console.log(label, "=", JSON.stringify(Object.getOwnPropertyNames(proto ?? {}).sort()));
}
names("Leaf", Leaf);
names("Mid ", Mid);
names("Exc ", Exc);

const l = new Leaf("boom");
console.log("instanceof Leaf      =", l instanceof Leaf);
console.log("typeof selfUnion     =", typeof (l as any).selfUnion);
console.log("typeof returnsPlain  =", typeof (l as any).returnsPlain);
