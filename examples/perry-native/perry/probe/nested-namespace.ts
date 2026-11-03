export namespace Outer {
  export namespace Inner {
    export function f(): string { return "inner-f"; }
    export const k = "inner-k";
  }
  export function g(): string { return "outer-g"; }
}
// also the dotted form, which tsc treats as nesting
export namespace A.B {
  export function h(): string { return "dotted-h"; }
}
console.log(`Outer.g()        = ${Outer.g()}`);
console.log(`Outer.Inner.f()  = ${Outer.Inner.f()}`);
console.log(`Outer.Inner.k    = ${Outer.Inner.k}`);
console.log(`A.B.h()          = ${A.B.h()}`);
