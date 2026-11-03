import * as S from "./s.js";
import { N } from "./n.js";
export class X {}
console.log(`X: typeof S = ${typeof S}, nullish = ${S === undefined || S === null}`);
try {
  console.log(`X: hasOwn = ${Object.hasOwn(S as object, "tag")}`);
} catch (e) {
  console.log(`X: hasOwn THREW: ${(e as Error).message}`);
}
console.log(`X: typeof N = ${typeof N}`);
