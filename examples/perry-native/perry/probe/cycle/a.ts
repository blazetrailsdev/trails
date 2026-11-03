import * as B from "./b.js";
export class A {}
// Top level, inside an import cycle: a.ts -> b.ts -> a.ts
console.log(`typeof B = ${typeof B}`);
console.log(`B is undefined = ${B === undefined}`);
console.log(`keys = ${B === undefined ? "N/A" : Object.keys(B).sort().join(",")}`);
// what rbModAppendFeatures does first with the module object:
try {
  console.log(`hasOwn works = ${Object.hasOwn(B as object, "marker")}`);
} catch (e) {
  console.log(`hasOwn THREW: ${(e as Error).message}`);
}
