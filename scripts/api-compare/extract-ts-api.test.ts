/**
 * Focused tests for the extractor's re-export path resolution.
 * End-to-end re-export recognition is covered transitively by
 * `api:compare` + the manifest; these pin the path-math so keys
 * stay platform-stable and the two supported patterns both
 * resolve to the same target.
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { resolveRelModule, extractClass, extractFileLocalHelpers } from "./extract-ts-api.js";
import type { ClassInfo, MethodInfo } from "./types.js";

function extractFromSource(source: string, className = "Foo"): ClassInfo {
  const filename = "virtual.ts";
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const host: ts.CompilerHost = {
    getSourceFile: (name) => (name === filename ? sourceFile : undefined),
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (n) => n,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (name) => name === filename,
    readFile: (name) => (name === filename ? source : undefined),
  };
  const program = ts.createProgram([filename], { noLib: true, noResolve: true }, host);
  const checker = program.getTypeChecker();
  let found: ClassInfo | null = null;
  ts.forEachChild(program.getSourceFile(filename)!, (node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      found = extractClass(node, checker, filename);
    }
  });
  if (!found) throw new Error(`class ${className} not found`);
  return found;
}

describe("resolveRelModule", () => {
  it("resolves a sibling .js import", () => {
    expect(resolveRelModule("migration.ts", "./migration-errors.js")).toBe("migration-errors.ts");
  });

  it("resolves an upward (..) specifier", () => {
    expect(resolveRelModule("connection-adapters/mysql2-adapter.ts", "../adapter.js")).toBe(
      "adapter.ts",
    );
  });

  it("resolves a nested specifier across subfolders", () => {
    expect(
      resolveRelModule(
        "adapters/abstract-mysql-adapter/test-helper.ts",
        "../../connection-adapters/mysql2-adapter.js",
      ),
    ).toBe("connection-adapters/mysql2-adapter.ts");
  });

  it("strips both .js and .ts extensions", () => {
    expect(resolveRelModule("a.ts", "./b.js")).toBe("b.ts");
    expect(resolveRelModule("a.ts", "./b.ts")).toBe("b.ts");
  });

  it("returns null for package / absolute specifiers", () => {
    expect(resolveRelModule("a.ts", "typescript")).toBeNull();
    expect(resolveRelModule("a.ts", "@blazetrails/activesupport")).toBeNull();
    expect(resolveRelModule("a.ts", "node:fs")).toBeNull();
  });

  it("emits POSIX-style separators", () => {
    // relPath is POSIX-normalized at the caller (in extract-ts-api.ts
    // where it's built via `path.relative(...).replace(/\\/g, "/")`),
    // so resolveRelModule's contract is POSIX-in, POSIX-out. This
    // test pins the output format so the caller's keys match what
    // resolveRelModule produces.
    const result = resolveRelModule("dir/sub/file.ts", "./sibling.js");
    expect(result).toBe("dir/sub/sibling.ts");
    expect(result).not.toContain("\\");
  });
});

function helpersFromSource(source: string): MethodInfo[] {
  const sourceFile = ts.createSourceFile("virtual.ts", source, ts.ScriptTarget.Latest, true);
  const out: MethodInfo[] = [];
  ts.forEachChild(sourceFile, (node) => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) &&
      !ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const h of extractFileLocalHelpers(node, "virtual.ts")) out.push(h);
    }
  });
  return out;
}

describe("extractFileLocalHelpers", () => {
  it("captures non-exported function declarations as internal/private", () => {
    const helpers = helpersFromSource(`
      function invertPredicate(node) { return node; }
      function exceptPredicates(cols) { return cols; }
      export function predicatesWithWrappedSqlLiterals(p) { return p; }
    `);
    const names = helpers.map((h) => h.name);
    expect(names).toEqual(["invertPredicate", "exceptPredicates"]);
    for (const h of helpers) {
      expect(h.visibility).toBe("private");
      expect(h.internal).toBe(true);
      expect(h.isStatic).toBe(false);
    }
  });

  it("captures non-exported arrow and function-expression consts", () => {
    const helpers = helpersFromSource(`
      const arrowHelper = (x) => x;
      const fnHelper = function (a, b) { return a + b; };
      const notAFunction = 42;
      export const exportedArrow = (x) => x;
    `);
    const names = helpers.map((h) => h.name);
    expect(names).toEqual(["arrowHelper", "fnHelper"]);
    expect(helpers[0].params.map((p) => p.name)).toEqual(["x"]);
    expect(helpers[1].params.map((p) => p.name)).toEqual(["a", "b"]);
    for (const h of helpers) expect(h.internal).toBe(true);
  });

  it("ignores exported declarations and non-function consts", () => {
    const helpers = helpersFromSource(`
      export function shouldSkip() {}
      export const alsoSkip = () => {};
      const literal = "string";
      const obj = { x: 1 };
    `);
    expect(helpers).toEqual([]);
  });

  it("skips NotImplementedError stubs (function decls and arrow consts)", () => {
    const helpers = helpersFromSource(`
      function realHelper(x) { return x; }
      function stubFn(a, b) {
        throw new NotImplementedError("not implemented");
      }
      const stubArrow = (x) => { throw new NotImplementedError("nope"); };
      const realArrow = (x) => x + 1;
    `);
    expect(helpers.map((h) => h.name)).toEqual(["realHelper", "realArrow"]);
  });

  it("records line numbers for traceback", () => {
    const helpers = helpersFromSource(`function first() {}\nfunction second() {}\n`);
    expect(helpers[0].line).toBe(1);
    expect(helpers[1].line).toBe(2);
  });
});

describe("extractClass — internal tagging", () => {
  it("emits public members without the internal flag", () => {
    const info = extractFromSource(`
      export class Foo {
        pubMethod() {}
        get pubGetter() { return 1; }
        pubProp = 1;
      }
    `);
    const pub = info.instanceMethods.find((m) => m.name === "pubMethod")!;
    expect(pub.visibility).toBe("public");
    expect(pub.internal).toBeUndefined();
    expect(info.instanceMethods.find((m) => m.name === "pubGetter")!.internal).toBeUndefined();
    expect(info.instanceMethods.find((m) => m.name === "pubProp")!.internal).toBeUndefined();
  });

  it("tags `private` and `protected` members with internal: true and matching visibility", () => {
    const info = extractFromSource(`
      export class Foo {
        private privMethod() {}
        protected protMethod() {}
        private privProp = 1;
      }
    `);
    const priv = info.instanceMethods.find((m) => m.name === "privMethod")!;
    expect(priv.visibility).toBe("private");
    expect(priv.internal).toBe(true);

    const prot = info.instanceMethods.find((m) => m.name === "protMethod")!;
    expect(prot.visibility).toBe("protected");
    expect(prot.internal).toBe(true);

    expect(info.instanceMethods.find((m) => m.name === "privProp")!.internal).toBe(true);
  });

  it("tags `#privateIdentifier` members as internal", () => {
    const info = extractFromSource(`
      export class Foo {
        #hidden() {}
        #field = 1;
      }
    `);
    const hidden = info.instanceMethods.find((m) => m.name === "#hidden")!;
    expect(hidden.visibility).toBe("private");
    expect(hidden.internal).toBe(true);
    expect(info.instanceMethods.find((m) => m.name === "#field")!.internal).toBe(true);
  });

  it("tags static private members and keeps them on classMethods", () => {
    const info = extractFromSource(`
      export class Foo {
        static pubStatic() {}
        private static privStatic() {}
      }
    `);
    expect(info.classMethods.find((m) => m.name === "pubStatic")!.internal).toBeUndefined();
    const ps = info.classMethods.find((m) => m.name === "privStatic")!;
    expect(ps.visibility).toBe("private");
    expect(ps.internal).toBe(true);
  });
});
