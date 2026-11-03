export namespace A {
  export namespace ClassMethods { export function withRouting(): string { return "a"; } }
}
export namespace B {
  export namespace ClassMethods { export function withRouting(): string { return "b"; } }
}
console.log(`a = ${A.ClassMethods.withRouting()}`);
console.log(`b = ${B.ClassMethods.withRouting()}`);
