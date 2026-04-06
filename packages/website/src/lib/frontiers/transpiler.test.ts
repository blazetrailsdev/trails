import { describe, it, expect } from "vitest";
import { stripTypes } from "./transpiler.js";

describe("stripTypes", () => {
  it("removes type annotations", () => {
    const input = `function greet(name: string, age: number) {`;
    const output = stripTypes(input);
    expect(output).not.toContain(": string");
    expect(output).not.toContain(": number");
    expect(output).toContain("function greet(name");
  });

  it("removes import type statements", () => {
    const input = `import type { Foo } from "./foo.js";`;
    expect(stripTypes(input).trim()).toBe("");
  });

  it("removes export type statements", () => {
    const input = `export type { Bar } from "./bar.js";`;
    expect(stripTypes(input).trim()).toBe("");
  });

  it("removes type keyword from mixed imports", () => {
    const input = `import { type Foo, Bar } from "./mod.js";`;
    const output = stripTypes(input);
    expect(output).toContain("Bar");
    expect(output).not.toContain("type Foo");
  });

  it("removes as casts", () => {
    const input = `const x = value as string;`;
    const output = stripTypes(input);
    expect(output).not.toContain("as string");
  });

  it("removes as const", () => {
    const input = `const arr = [1, 2] as const;`;
    const output = stripTypes(input);
    expect(output).not.toContain("as const");
  });

  it("removes interface declarations", () => {
    const input = `interface Foo { bar: string; }`;
    expect(stripTypes(input).trim()).toBe("");
  });

  it("removes exported interface declarations", () => {
    const input = `export interface Foo { bar: string; }`;
    expect(stripTypes(input).trim()).toBe("");
  });

  it("removes generic type params from functions", () => {
    const input = `function identity<T>(x) { return x; }`;
    const output = stripTypes(input);
    expect(output).toContain("function identity(x)");
    expect(output).not.toContain("<T>");
  });

  it("removes non-null assertions after word chars", () => {
    const input = `const el = foo!.bar;`;
    const output = stripTypes(input);
    expect(output).toContain("foo.bar");
  });

  it("preserves regular code", () => {
    const input = `
const x = 42;
function greet(name) {
  return "Hello, " + name;
}
export { greet };
`;
    const output = stripTypes(input);
    expect(output).toContain("const x = 42");
    expect(output).toContain("function greet(name)");
    expect(output).toContain('return "Hello, " + name');
    expect(output).toContain("export { greet }");
  });

  it("handles union type annotations before comma/paren", () => {
    const input = `function foo(x: string | null, y: number) {`;
    const output = stripTypes(input);
    expect(output).not.toContain(": string | null");
    expect(output).toContain("function foo(x");
  });

  it("handles Promise type annotations", () => {
    const input = `async function foo(): Promise<void> {`;
    const output = stripTypes(input);
    expect(output).not.toContain("Promise<void>");
  });
});
