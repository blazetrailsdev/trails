function rest(...syms: unknown[]): string {
  return `len=${syms.length} isArr=${String(Array.isArray(syms))} v=${JSON.stringify(syms)}`;
}
function fixedRest(first?: unknown, ...more: unknown[]): string {
  return `first=${String(first)} moreLen=${more.length} more=${JSON.stringify(more)}`;
}
const alias = rest;
const ctx = {};
console.log(`K1 direct two args : ${rest("attr", { d: 1 })}`);
console.log(`K2 .call two args  : ${rest.call(ctx, "attr", { d: 1 })}`);
console.log(`K3 .call one arg   : ${rest.call(ctx, "attr")}`);
console.log(`K4 alias .call     : ${alias.call(ctx, "attr", { d: 1 })}`);
console.log(`K5 .apply two args : ${rest.apply(ctx, ["attr", { d: 1 }])}`);
console.log(`K6 fixed+rest .call: ${fixedRest.call(ctx, "attr", { d: 1 })}`);
