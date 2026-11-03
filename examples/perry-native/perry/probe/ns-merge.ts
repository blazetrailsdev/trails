// TypeScript declaration merging: the same top-level namespace declared twice
// in one module. activesupport/src/callbacks.ts does this with `CallTemplate`.
export namespace CallTemplate {
  export function first(): string { return "first"; }
}
export namespace CallTemplate {
  export function second(): string { return "second"; }
}
console.log(`first()  = ${CallTemplate.first()}`);
console.log(`second() = ${CallTemplate.second()}`);
console.log(`both present = ${typeof CallTemplate.first === "function" && typeof CallTemplate.second === "function"}`);
