export namespace Outer {
  export namespace ClassMethods { export function withRouting(): string { return "nested"; } }
}
console.log(`nested = ${Outer.ClassMethods.withRouting()}`);
