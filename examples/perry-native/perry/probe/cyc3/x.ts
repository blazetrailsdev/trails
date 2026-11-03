// x.ts runs while s.ts is still on the init stack, and asks for its namespace.
import * as S from "./s.js";
console.log(`X: typeof S = ${typeof S}`);
console.log(`X: S nullish = ${S === undefined || S === null}`);
try {
  console.log(`X: hasOwn(tag) = ${Object.hasOwn(S as object, "tag")}`);
} catch (e) {
  console.log(`X: hasOwn THREW: ${(e as Error).message}`);
}
