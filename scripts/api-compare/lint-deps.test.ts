import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as ts from "typescript";
import {
  collectDirectImports,
  collectTaintedSymbols,
  isImportFromPackage,
  methodUsesDepImport,
} from "./lint-deps.js";

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
  it("body-cast (as Imported) does NOT count as usage", () => {
    const sf = makeSourceFile(`
      function foo(x: unknown) { return (x as Nodes); }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(false);
  });

  it("return type annotation COUNTS (signature is part of the API)", () => {
    const sf = makeSourceFile(`
      function foo(): Nodes { throw new Error(); }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(true);
  });

  it("parameter type annotation COUNTS", () => {
    const sf = makeSourceFile(`
      function foo(x: ArelTable): void {}
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["ArelTable"]), new Set(), DEP, sf)).toBe(true);
  });

  it("generic type arg in return type COUNTS", () => {
    const sf = makeSourceFile(`
      function foo(): Promise<Nodes> { return Promise.resolve(null as any); }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(true);
  });

  it("body old-style type assertion <Imported>x does NOT count", () => {
    const sf = makeSourceFile(`
      function foo(x: unknown) { return <Nodes>x; }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(false);
  });

  it("body satisfies expression does NOT count", () => {
    const sf = makeSourceFile(`
      function foo(x: unknown) { return x satisfies Nodes; }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(false);
  });

  it("type predicate (x is T) in return type COUNTS", () => {
    const sf = makeSourceFile(`
      function foo(x: unknown): x is Nodes { return true; }
    `);
    const node = firstMethod(sf);
    expect(methodUsesDepImport(node, new Set(["Nodes"]), new Set(), DEP, sf)).toBe(true);
  });

  it("body-local variable type annotation does NOT count", () => {
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

describe("collectTaintedSymbols — transitive dep usage", () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    while (tmpDirs.length) {
      const d = tmpDirs.pop()!;
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  function writePkg(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-deps-"));
    tmpDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return dir;
  }

  function programFor(dir: string): ts.Program {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ts")) files.push(p);
      }
    };
    walk(dir);
    return ts.createProgram(files, {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      skipLibCheck: true,
    });
  }

  it("credits a method that calls a same-package wrapper of the dep", () => {
    const pkg = "@blazetrails/activesupport";
    const dir = writePkg({
      "helper.ts": `
        import { getAsyncContext } from "${pkg}";
        export function executionContextId() { return getAsyncContext().getStore() ?? 0; }
      `,
      "consumer.ts": `
        import { executionContextId } from "./helper.js";
        export class Pool {
          checkout() { return executionContextId(); }
        }
      `,
    });
    const program = programFor(dir);
    const tainted = collectTaintedSymbols(program, dir, pkg, [], "activesupport");
    const helperSf = program.getSourceFiles().find((sf) => sf.fileName.endsWith("helper.ts"))!;
    const consumerSf = program.getSourceFiles().find((sf) => sf.fileName.endsWith("consumer.ts"))!;
    const checker = program.getTypeChecker();

    // Helper's exported function is tainted (direct use).
    const helperFn = helperSf.statements.find((s): s is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(s),
    )!;
    const helperSym = checker.getSymbolAtLocation(helperFn.name!)!;
    expect(tainted.has(helperSym)).toBe(true);

    // Consumer's checkout() method body references the tainted helper.
    let checkoutBody: ts.Node | undefined;
    const findCheckout = (n: ts.Node) => {
      if (
        ts.isMethodDeclaration(n) &&
        n.name &&
        ts.isIdentifier(n.name) &&
        n.name.text === "checkout"
      ) {
        checkoutBody = n;
      }
      ts.forEachChild(n, findCheckout);
    };
    ts.forEachChild(consumerSf, findCheckout);
    expect(
      methodUsesDepImport(
        checkoutBody!,
        collectDirectImports(consumerSf, pkg),
        new Set(),
        "activesupport",
        consumerSf,
        checkoutBody!,
        { checker, taintedSymbols: tainted },
      ),
    ).toBe(true);
  });

  it("propagates taint through a chain of wrappers (fixed point)", () => {
    const pkg = "@blazetrails/activesupport";
    const dir = writePkg({
      "a.ts": `
        import { getAsyncContext } from "${pkg}";
        export function a() { return getAsyncContext(); }
      `,
      "b.ts": `
        import { a } from "./a.js";
        export function b() { return a(); }
      `,
      "c.ts": `
        import { b } from "./b.js";
        export function c() { return b(); }
      `,
    });
    const program = programFor(dir);
    const tainted = collectTaintedSymbols(program, dir, pkg, [], "activesupport");
    const checker = program.getTypeChecker();
    for (const f of ["a.ts", "b.ts", "c.ts"]) {
      const sf = program.getSourceFiles().find((s) => s.fileName.endsWith(f))!;
      const fn = sf.statements.find((s): s is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(s),
      )!;
      expect(tainted.has(checker.getSymbolAtLocation(fn.name!)!)).toBe(true);
    }
  });

  it("does not taint a function that calls an unrelated helper", () => {
    const pkg = "@blazetrails/activesupport";
    const dir = writePkg({
      "unrelated.ts": `export function noop() { return 0; }`,
      "consumer.ts": `
        import { noop } from "./unrelated.js";
        export function caller() { return noop(); }
      `,
    });
    const program = programFor(dir);
    const tainted = collectTaintedSymbols(program, dir, pkg, [], "activesupport");
    expect(tainted.size).toBe(0);
  });

  it("taints a module-level constant whose initializer uses the dep", () => {
    const pkg = "@blazetrails/activemodel";
    const dir = writePkg({
      "helper.ts": `
        import { BooleanType } from "${pkg}";
        export const booleanType = new BooleanType();
      `,
    });
    const program = programFor(dir);
    const tainted = collectTaintedSymbols(program, dir, pkg, [], "activemodel");
    const sf = program.getSourceFiles().find((s) => s.fileName.endsWith("helper.ts"))!;
    const stmt = sf.statements.find((s): s is ts.VariableStatement => ts.isVariableStatement(s))!;
    const decl = stmt.declarationList.declarations[0];
    const sym = program.getTypeChecker().getSymbolAtLocation(decl.name)!;
    expect(tainted.has(sym)).toBe(true);
  });

  it("does not taint wrappers that opt out via lint-deps-ignore", () => {
    // A helper that declares it intentionally does NOT use the dep
    // (e.g. raw-SQL path) must not poison callers via the taint set.
    const pkg = "@blazetrails/arel";
    const dir = writePkg({
      "helper.ts": `
        // lint-deps-ignore: arel — uses raw SQL; no Arel needed
        export function rawSqlHelper() { return "SELECT 1"; }
      `,
    });
    const program = programFor(dir);
    const tainted = collectTaintedSymbols(program, dir, pkg, [], "arel");
    expect(tainted.size).toBe(0);
  });
});
