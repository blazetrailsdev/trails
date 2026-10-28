/* eslint-disable @typescript-eslint/no-explicit-any -- probe */
// Wall 11: does a class lose its own methods across a RE-EXPORT hop?
// Importing the same class directly (declmerge.ts) keeps them.
import { Leaf, AdErr, Exc } from "./reexport-barrel.ts";

function names(label: string, ctor: unknown): void {
  const proto = (ctor as { prototype?: object }).prototype;
  console.log(label, "=", JSON.stringify(Object.getOwnPropertyNames(proto ?? {}).sort()));
}
names("Leaf ", Leaf);
names("AdErr", AdErr);
names("Exc  ", Exc);

const l = new Leaf("boom");
console.log("instanceof Leaf   =", l instanceof Leaf);
console.log("typeof selfUnion  =", typeof (l as any).selfUnion);
console.log("typeof detailed   =", typeof (l as any).detailedMessage);
