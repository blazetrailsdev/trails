/* global console */
import { K, D } from "./a.js";

// A local alias of the very same value reads correctly, and a class
// *declaration* reads correctly. Only the direct read of a class *expression*
// through its import binding is wrong.
const alias = K;

console.log("K.prototype     (class expression, direct) :", typeof K.prototype);
console.log("alias.prototype (class expression, alias)  :", typeof alias.prototype);
console.log("D.prototype     (class declaration, direct):", typeof D.prototype);
