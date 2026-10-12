/* global console */
import * as Mod from "./mod.js";

// A module namespace object has a null [[Prototype]] (ECMA-262, "Module
// Namespace Exotic Objects"), so a prototype-chain walk over one terminates
// after a single step. Under Perry it never terminates, so the loop below is
// bounded only by the step guard.
let p = Mod;
let steps = 0;
while (p !== null && p !== undefined && steps < 12) {
  p = Object.getPrototypeOf(p);
  steps++;
}

console.log("steps to reach null      :", steps, "(node: 1)");
console.log("getPrototypeOf(Mod)      :", String(Object.getPrototypeOf(Mod)), "(node: null)");
console.log("getPrototypeOf(Mod)===null:", Object.getPrototypeOf(Mod) === null, "(node: true)");
