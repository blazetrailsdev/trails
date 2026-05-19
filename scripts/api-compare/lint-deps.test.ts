import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { methodUsesDepImport, isImportFromPackage } from "./lint-deps.js";

function makeSourceFile(source: string): ts.SourceFile {
  return ts.createSourceFile("virtual.ts", source, ts.ScriptTarget.Latest, true);
}

function firstMethod(sf: ts.SourceFile): ts.Node {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isMethodDeclaration(n) || ts.isFunctionDeclaration(n) || ts.isArrowFunction(n)) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(sf, visit);
  if (!found) throw new Error("no method found");
  return found;
}

function firstVariableStatement(sf: ts.SourceFile): ts.VariableStatement {
  let found: ts.VariableStatement | undefined;
  ts.forEachChild(sf, (n) => {
    if (!found && ts.isVariableStatement(n)) found = n;
  });
  if (!found) throw new Error("no variable statement found");
  return found;
}

const DEP = "arel";

describe("methodUsesDepImport — type-position filtering", () => {
  it("cast-only (as Imported) does NOT count as usage", () => {
    const sf = makeSourceFile(`
      function foo(x: unknown) { return (x as Nodes); }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(false);
  });

  it("return type annotation does NOT count as usage", () => {
    const sf = makeSourceFile(`
      function foo(): Nodes { throw new Error(); }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(false);
  });

  it("parameter type annotation does NOT count", () => {
    const sf = makeSourceFile(`
      function foo(x: ArelTable): void {}
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["ArelTable"]), new Set(), DEP, sf)).toBe(false);
  });

  it("generic type arg does NOT count", () => {
    const sf = makeSourceFile(`
      function foo(): Promise<Nodes> { return Promise.resolve(null as any); }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(false);
  });

  it("old-style type assertion <Imported>x does NOT count", () => {
    const sf = makeSourceFile(`
      function foo(x: unknown) { return <Nodes>x; }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(false);
  });

  it("satisfies expression does NOT count", () => {
    const sf = makeSourceFile(`
      function foo(x: unknown) { return x satisfies Nodes; }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(false);
  });

  it("type predicate (x is T) does NOT count", () => {
    const sf = makeSourceFile(`
      function foo(x: unknown): x is Nodes { return true; }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(false);
  });

  it("variable type annotation does NOT count", () => {
    const sf = makeSourceFile(`
      function foo() { let x: ArelTable; }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["ArelTable"]), new Set(), DEP, sf)).toBe(false);
  });

  it("real property access call DOES count", () => {
    const sf = makeSourceFile(`
      function foo(x: unknown) { return Nodes.create(x); }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(true);
  });

  it("new expression DOES count", () => {
    const sf = makeSourceFile(`
      function foo() { return new ArelTable("x"); }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["ArelTable"]), new Set(), DEP, sf)).toBe(true);
  });

  it("bare call expression DOES count", () => {
    const sf = makeSourceFile(`
      function foo() { return arelTable("x"); }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(), new Set(["arelTable"]), DEP, sf)).toBe(true);
  });
});

describe("methodUsesDepImport — lint-deps-ignore annotation", () => {
  it("opt-out comment above method marks as covered", () => {
    const sf = makeSourceFile(`
      // lint-deps-ignore: arel — uses raw SQL; no Arel needed
      function foo() {}
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), "arel", sf)).toBe(true);
  });

  it("opt-out for wrong dep does NOT mark as covered", () => {
    const sf = makeSourceFile(`
      // lint-deps-ignore: activesupport
      function foo() {}
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), "arel", sf)).toBe(false);
  });

  it("opt-out above const arrow function works (anchor = VariableStatement)", () => {
    const sf = makeSourceFile(`
      // lint-deps-ignore: arel — uses raw SQL
      const foo = () => {};
    `);
    const node = firstMethod(sf);
    const anchor = firstVariableStatement(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), "arel", sf, anchor)).toBe(true);
  });

  it("opt-out for wrong dep on arrow function does NOT cover", () => {
    const sf = makeSourceFile(`
      // lint-deps-ignore: activesupport
      const foo = () => {};
    `);
    const node = firstMethod(sf);
    const anchor = firstVariableStatement(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), "arel", sf, anchor)).toBe(
      false,
    );
  });
});

describe("isImportFromPackage", () => {
  const pkg = "@blazetrails/activesupport";
  it("matches the package root exactly", () => {
    expect(isImportFromPackage(pkg, pkg)).toBe(true);
  });
  it("matches subpath imports", () => {
    expect(isImportFromPackage(`${pkg}/message-verifier`, pkg)).toBe(true);
    expect(isImportFromPackage(`${pkg}/temporal`, pkg)).toBe(true);
  });
  it("does not match a different package with a shared prefix", () => {
    expect(isImportFromPackage("@blazetrails/activesupporting", pkg)).toBe(false);
    expect(isImportFromPackage("@blazetrails/activerecord", pkg)).toBe(false);
  });
  it("does not match unrelated specifiers", () => {
    expect(isImportFromPackage("typescript", pkg)).toBe(false);
    expect(isImportFromPackage("./local", pkg)).toBe(false);
  });
});
