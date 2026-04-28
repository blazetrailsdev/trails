/**
 * Focused tests for the extractor's re-export path resolution.
 * End-to-end re-export recognition is covered transitively by
 * `api:compare` + the manifest; these pin the path-math so keys
 * stay platform-stable and the two supported patterns both
 * resolve to the same target.
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import * as path from "path";
import {
  resolveRelModule,
  extractClass,
  extractFileLocalHelpers,
  extractFromProgram,
} from "./extract-ts-api.js";
import type { ClassInfo, MethodInfo, PackageInfo } from "./types.js";

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

/**
 * Multi-file virtual-program harness: spin up a TypeScript program from
 * an in-memory map of `path → source`, then run `extractFromProgram`
 * against it. Lets us exercise the include() detection pass which
 * needs program-wide TypeChecker state across multiple files.
 */
function extractFromFiles(srcDir: string, files: Record<string, string>): PackageInfo {
  // Synthesize an `@blazetrails/activesupport` stub so the include()
  // detection's bare-specifier check succeeds in the virtual program.
  const ASC_PATH = "/_node_modules/@blazetrails/activesupport.ts";
  const all: Record<string, string> = {
    [ASC_PATH]: `export function include(klass: any, mod: any): void {}`,
  };
  for (const [rel, text] of Object.entries(files)) all[`${srcDir}/${rel}`] = text;

  const fileNames = Object.keys(files).map((p) => `${srcDir}/${p}`);
  const host: ts.CompilerHost = {
    getSourceFile: (name) =>
      all[name] != null
        ? ts.createSourceFile(name, all[name], ts.ScriptTarget.Latest, true)
        : undefined,
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (n) => n,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (name) => name in all,
    readFile: (name) => all[name],
    resolveModuleNames: (moduleNames, containingFile) =>
      moduleNames.map((m) => {
        if (m === "@blazetrails/activesupport") {
          return { resolvedFileName: ASC_PATH, extension: ts.Extension.Ts };
        }
        if (m.startsWith("./") || m.startsWith("../")) {
          const dir = path.posix.dirname(containingFile);
          const noExt = m.replace(/\.js$/, "");
          const candidate = path.posix.normalize(`${dir}/${noExt}.ts`);
          if (candidate in all) return { resolvedFileName: candidate, extension: ts.Extension.Ts };
        }
        return undefined;
      }),
  };
  const program = ts.createProgram(
    fileNames,
    { noLib: true, target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext },
    host,
  );
  return extractFromProgram(program, srcDir);
}

describe("extractFromProgram — include() detection", () => {
  it("records `export const X = { ... }` as a module with method names", () => {
    const info = extractFromFiles("/p", {
      "predications.ts": `
        export const Predications = {
          eq() {},
          gt: function () {},
          lt: () => {},
        };
      `,
    });
    const mod = info.modules["predications.ts:Predications"];
    expect(mod).toBeDefined();
    expect(mod.instanceMethods.map((m) => m.name).sort()).toEqual(["eq", "gt", "lt"]);
  });

  it("captures shorthand-property and callable-RHS object members", () => {
    // Mirrors packages/activerecord/src/locking/pessimistic.ts — bug
    // flagged in PR #961 review.
    const info = extractFromFiles("/p", {
      "pessimistic.ts": `
        export function lockBang(): void {}
        export function withLock(): void {}
        function _readForValidation(): string { return ""; }
        export const InstanceMethods = {
          lockBang,
          withLock,
          readAttributeForValidation: _readForValidation,
        };
      `,
    });
    const mod = info.modules["pessimistic.ts:InstanceMethods"];
    expect(mod.instanceMethods.map((m) => m.name).sort()).toEqual([
      "lockBang",
      "readAttributeForValidation",
      "withLock",
    ]);
  });

  it("pushes a bare-identifier mod arg onto host.extends", () => {
    const info = extractFromFiles("/p", {
      "math.ts": `export const Math = { add() {}, mul() {} };`,
      "node.ts": `
        export class Node {}
      `,
      "wire.ts": `
        import { include } from "@blazetrails/activesupport";
        import { Node } from "./node.js";
        import { Math } from "./math.js";
        include(Node, Math);
      `,
    });
    expect(info.classes["node.ts:Node"].extends).toContain("Math");
  });

  it("follows import aliases (`Math as MathMixin`) to the original module name", () => {
    const info = extractFromFiles("/p", {
      "math.ts": `export const Math = { add() {} };`,
      "node.ts": `export class Node {}`,
      "wire.ts": `
        import { include } from "@blazetrails/activesupport";
        import { Node } from "./node.js";
        import { Math as MathMixin } from "./math.js";
        include(Node, MathMixin);
      `,
    });
    expect(info.classes["node.ts:Node"].extends).toContain("Math");
  });

  it("resolves property-access mod arg by harvesting the declaration's methods directly", () => {
    // Mirrors `include(Base, LockingPessimistic.InstanceMethods)`. The
    // bare name "InstanceMethods" collides across files, so methods
    // must be pushed onto the host directly rather than via name lookup.
    const info = extractFromFiles("/p", {
      "pessimistic.ts": `
        export function lockBang(): void {}
        export const InstanceMethods = { lockBang };
      `,
      "base.ts": `export class Base {}`,
      "wire.ts": `
        import { include } from "@blazetrails/activesupport";
        import * as LockingPessimistic from "./pessimistic.js";
        import { Base } from "./base.js";
        include(Base, LockingPessimistic.InstanceMethods);
      `,
    });
    const base = info.classes["base.ts:Base"];
    expect(base.instanceMethods.map((m) => m.name)).toContain("lockBang");
    // Should NOT push "InstanceMethods" onto extends — that's the
    // collision-prone path the fix avoids.
    expect(base.extends).not.toContain("InstanceMethods");
  });

  it("pushes inline object-literal mod methods directly onto the host", () => {
    const info = extractFromFiles("/p", {
      "base.ts": `export class Base {}`,
      "wire.ts": `
        import { include } from "@blazetrails/activesupport";
        import { Base } from "./base.js";
        include(Base, { foo() {}, bar: () => {}, baz: function () {} });
      `,
    });
    expect(info.classes["base.ts:Base"].instanceMethods.map((m) => m.name).sort()).toEqual([
      "bar",
      "baz",
      "foo",
    ]);
  });

  it("ignores `include()` calls when the file doesn't import from @blazetrails/activesupport", () => {
    // A local `include` function with the same name shouldn't be
    // confused for the activesupport mixin — the detection pass keys
    // off the import specifier.
    const info = extractFromFiles("/p", {
      "node.ts": `export class Node {}`,
      "math.ts": `export const Math = { add() {} };`,
      "wire.ts": `
        import { Node } from "./node.js";
        import { Math } from "./math.js";
        function include(a: any, b: any) {}
        include(Node, Math);
      `,
    });
    expect(info.classes["node.ts:Node"].extends).not.toContain("Math");
  });

  it("dedupes repeated include() calls for the same (host, mod) pair", () => {
    const info = extractFromFiles("/p", {
      "node.ts": `export class Node {}`,
      "math.ts": `export const Math = { add() {} };`,
      "wire.ts": `
        import { include } from "@blazetrails/activesupport";
        import { Node } from "./node.js";
        import { Math } from "./math.js";
        include(Node, Math);
        include(Node, Math);
      `,
    });
    const ext = info.classes["node.ts:Node"].extends.filter((e) => e === "Math");
    expect(ext).toHaveLength(1);
  });

  it("resolves a const-cast host (`const _X = X as unknown as new (...) => X`)", () => {
    // Mirrors arel/index.ts post-#814.
    const info = extractFromFiles("/p", {
      "predications.ts": `export const Predications = { eq() {} };`,
      "node-expression.ts": `export class NodeExpression {}`,
      "wire.ts": `
        import { include } from "@blazetrails/activesupport";
        import { NodeExpression } from "./node-expression.js";
        import { Predications } from "./predications.js";
        const _NodeExpression = NodeExpression as unknown as new (...args: any[]) => NodeExpression;
        include(_NodeExpression, Predications);
      `,
    });
    expect(info.classes["node-expression.ts:NodeExpression"].extends).toContain("Predications");
  });
});
