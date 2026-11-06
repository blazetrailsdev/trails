function sink(...syms: unknown[]): string {
  return `len=${syms.length} ${JSON.stringify(syms)}`;
}
function fixedThenRest(first?: unknown, ...rest: unknown[]): string {
  return `first=${String(first)} restLen=${rest.length} rest=${JSON.stringify(rest)}`;
}
const names: unknown[] = ["attr"];
const opts = { default: ["installed"] };
const two: unknown[] = ["a", "b"];

console.log(`T1 spread+trailing  : ${sink(...names, opts)}`);
console.log(`T2 call spread+trail: ${sink.call(null, ...names, opts)}`);
console.log(`T3 two+trailing     : ${sink(...two, opts)}`);
console.log(`T4 trailing+spread  : ${sink(opts, ...two)}`);
console.log(`T5 fixed+spread+trl : ${fixedThenRest(...two, opts)}`);
console.log(`T6 spread only      : ${sink(...two)}`);
