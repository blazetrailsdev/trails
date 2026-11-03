// Two namespaces with the SAME name in one module: one nested, one top-level,
// each exporting a function of the same name. This is the shape in
// actionpack/action-dispatch/testing/assertions/routing.ts.
export namespace WithIntegrationRouting {
  export namespace ClassMethods {
    export function withRouting(): string { return "nested"; }
  }
}
export namespace ClassMethods {
  export function withRouting(): string { return "toplevel"; }
}
export function withRouting(): string { return "bare"; }

console.log(`nested   = ${WithIntegrationRouting.ClassMethods.withRouting()}`);
console.log(`toplevel = ${ClassMethods.withRouting()}`);
console.log(`bare     = ${withRouting()}`);
