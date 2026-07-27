/**
 * Focused tests for the extractor's re-export path resolution.
 * End-to-end re-export recognition is covered transitively by
 * `api:compare` + the manifest; these pin the path-math so keys
 * stay platform-stable and the two supported patterns both
 * resolve to the same target.
 */

import { describe, it, expect, afterEach } from "vitest";
import * as ts from "typescript";
import * as path from "path";
import * as fs from "node:fs";
import * as os from "node:os";
import {
  resolveRelModule,
  extractClass,
  extractFileConstants,
  extractFileLocalHelpers,
  extractFromProgram,
  getAllTsFiles,
  harvestObjectLiteralMethods,
  packageFingerprint,
  tsLiteralValue,
} from "./extract-ts-api.js";
import { overlappingSubDirs, packageSrcDir } from "./config.js";
import type { ClassInfo, MethodInfo, PackageInfo } from "./types.js";

const VIRTUAL = "virtual.ts";

/** Compile an in-memory source file with no lib/resolution; return its AST + checker. */
function compile(source: string): { sourceFile: ts.SourceFile; checker: ts.TypeChecker } {
  const sourceFile = ts.createSourceFile(VIRTUAL, source, ts.ScriptTarget.Latest, true);
  const host: ts.CompilerHost = {
    getSourceFile: (name) => (name === VIRTUAL ? sourceFile : undefined),
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (n) => n,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (name) => name === VIRTUAL,
    readFile: (name) => (name === VIRTUAL ? source : undefined),
  };
  const program = ts.createProgram([VIRTUAL], { noLib: true, noResolve: true }, host);
  return { sourceFile: program.getSourceFile(VIRTUAL)!, checker: program.getTypeChecker() };
}

function extractFromSource(source: string, className = "Foo"): ClassInfo {
  const { sourceFile, checker } = compile(source);
  let found: ClassInfo | null = null;
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      found = extractClass(node, checker, VIRTUAL);
    }
  });
  if (!found) throw new Error(`class ${className} not found`);
  return found;
}

function objectLiteralMethods(source: string): MethodInfo[] {
  const { sourceFile, checker } = compile(source);
  let out: MethodInfo[] = [];
  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const decl of node.declarationList.declarations) {
      if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
        out = harvestObjectLiteralMethods(decl.initializer, checker, VIRTUAL);
      }
    }
  });
  return out;
}

describe("harvestObjectLiteralMethods", () => {
  it("reads @internal off the declaration a mixin entry references", () => {
    const methods = objectLiteralMethods(
      `/** @internal */
      function hidden(a: number): void {}
      function shown(a: number): void {}
      const NS = { aliased: hidden };
      export const Reg = {
        hidden,
        shown,
        viaProperty: hidden,
        viaNamespace: NS.aliased,
        /** @internal */
        inline(a: number): void {},
      };`,
    );
    const byName = Object.fromEntries(methods.map((m) => [m.name, m.internal === true]));
    expect(byName).toEqual({
      hidden: true,
      shown: false,
      viaProperty: true,
      viaNamespace: true,
      inline: true,
    });
  });

  it("captures get/set accessors as the Rails-named reader and writer pair", () => {
    const methods = objectLiteralMethods(
      `let backing: boolean | null = null;
      export const ActiveRecord = {
        get maintainTestSchema(): boolean | null {
          return backing;
        },
        set maintainTestSchema(value: boolean | null) {
          backing = value;
        },
      };`,
    );
    expect(methods.map((m) => [m.name, m.params.length])).toEqual([
      ["maintainTestSchema", 0],
      ["maintainTestSchema", 1],
    ]);
  });

  it("captures params for inline method and function-property forms", () => {
    const methods = objectLiteralMethods(
      `export const Reg = {
        registerTemplateHandler(...extensionsAndHandler: unknown[]): void {},
        build: (a: number, b = 1) => {},
        noop,
      };`,
    );
    const byName = Object.fromEntries(methods.map((m) => [m.name, m.params]));
    // Rest param must survive — the bug recorded these as 0-arg, which let
    // Ruby's `register_template_handler(*extensions, handler)` falsely match.
    expect(byName["registerTemplateHandler"]).toEqual([
      { name: "extensionsAndHandler", kind: "rest", type: "unknown[]" },
    ]);
    expect(byName["build"]).toEqual([
      { name: "a", kind: "required", type: "number" },
      { name: "b", kind: "optional", default: "...", literal: { kind: "int", value: "1" } },
    ]);
    // Shorthand reference to an undeclared name: params stay unknown.
    expect(byName["noop"]).toEqual([]);
  });

  it("resolves an overloaded alias target to its widest signature", () => {
    const methods = objectLiteralMethods(
      `function find(id: number): void;
      function find(id: number, options: object): void;
      function find(id: number, options?: object): void {}
      export const ClassMethods = { find };`,
    );
    expect(methods.find((m) => m.name === "find")!.params).toEqual([
      { name: "id", kind: "required", type: "number" },
      { name: "options", kind: "required", type: "object" },
    ]);
  });

  it("resolves alias bindings to the target function's params", () => {
    const methods = objectLiteralMethods(
      `function readonlyAttributeQ(this: unknown, attribute: string): boolean { return true; }
      export const ClassMethods = {
        readonlyAttributeQ,
        isReadonlyAttribute: readonlyAttributeQ,
      };`,
    );
    const byName = Object.fromEntries(methods.map((m) => [m.name, m.params]));
    const expected = [
      { name: "this", kind: "required", type: "unknown" },
      { name: "attribute", kind: "required", type: "string" },
    ];
    // Both the shorthand and the renamed alias must carry the real 1-1 arity
    // (post `this`-strip) into the candidate pool, not an empty list.
    expect(byName["readonlyAttributeQ"]).toEqual(expected);
    expect(byName["isReadonlyAttribute"]).toEqual(expected);
  });
});

describe("body call capture", () => {
  it("records the call-set of a method body, sorted and de-duplicated", () => {
    const cls = extractFromSource(
      `class Foo {
        save() {
          this.runCallbacks("save");
          this.runCallbacks("commit");
          helper();
          obj.nested.touch();
          return 1 + 2;
        }
      }`,
    );
    const save = cls.instanceMethods.find((m) => m.name === "save")!;
    // PropertyAccess callee → final identifier; bare call → identifier;
    // sorted + de-duped (runCallbacks appears twice, recorded once). The
    // intermediate read `obj.nested` in `obj.nested.touch()` is credited as
    // `nested` — a non-callee property read mirrors a Ruby method send.
    expect(save.calls).toEqual(["helper", "nested", "runCallbacks", "touch"]);
  });

  it("marks a call made in a negated position with the ! prefix", () => {
    // The faithful port of ActiveSupport's `exclude?` (`!include?`); the wide
    // call ratchet requires the marker before crediting a negating alias.
    const cls = extractFromSource(
      `class Foo {
        check(xs: string[], set: Set<string>) {
          if (!xs.includes("a")) return true;
          if (!(set.has("b"))) return true;
          return set.has("c") || !this.loaded;
        }
      }`,
    );
    const check = cls.instanceMethods.find((m) => m.name === "check")!;
    expect(check.calls).toEqual(["!has", "!includes", "!loaded", "has", "includes", "loaded"]);
  });

  it("does not mark a call whose negation applies to a surrounding expression", () => {
    // `!a && xs.includes(y)` negates `a`, not the containment call.
    const cls = extractFromSource(
      `class Foo {
        check(a: boolean, xs: string[]) {
          return !a && xs.includes("b");
        }
      }`,
    );
    const check = cls.instanceMethods.find((m) => m.name === "check")!;
    expect(check.calls).toEqual(["includes"]);
  });

  it("omits calls entirely for a body that invokes nothing", () => {
    // No calls and no property reads — a pure arithmetic return.
    const cls = extractFromSource(`class Foo { id() { return 1 + 2; } }`);
    const id = cls.instanceMethods.find((m) => m.name === "id")!;
    expect(id.calls).toBeUndefined();
  });

  it('records a bare super(...) call as "super"', () => {
    const cls = extractFromSource(
      `class Foo extends Bar {
        constructor() {
          super(1, 2);
          this.init();
        }
      }`,
    );
    const ctor = cls.instanceMethods.find((m) => m.name === "constructor")!;
    expect(ctor.calls).toEqual(["init", "super"]);
  });

  it('records super.foo() as the property name, not "super"', () => {
    const cls = extractFromSource(
      `class Foo extends Bar {
        save() { super.save(); }
      }`,
    );
    const save = cls.instanceMethods.find((m) => m.name === "save")!;
    expect(save.calls).toEqual(["save"]);
  });

  it("credits X.call(...)/X.apply(...) to the dispatched identifier as well as call/apply", () => {
    // Mirrors locking/pessimistic.ts `withLock` → `lockBang.call(instance, ...)`,
    // the `lock!` port invoked indirectly inside the wrapping transaction.
    const cls = extractFromSource(
      `class Foo {
        withLock(lock) {
          this.transaction(() => {
            lockBang.call(this, lock);
            helper.apply(this, [1]);
          });
        }
      }`,
    );
    const m = cls.instanceMethods.find((m) => m.name === "withLock")!;
    // Additive: the dispatched identifier is credited alongside the literal
    // call/apply name (so a Ruby `Proc#call` match is never lost).
    expect(m.calls).toEqual(["apply", "call", "helper", "lockBang", "transaction"]);
  });

  it('records `new Foo(...)` as a "constructor" call (Ruby `Foo.new`)', () => {
    // Ruby `StatementPool.new(...)` records the call `new`, which conventions.ts
    // maps to the TS `constructor`. A direct return and a local-bound-then-
    // returned instantiation must produce the IDENTICAL call-set — the body
    // shape is irrelevant (#4284's buildStatementPool false positive).
    const direct = extractFromSource(
      `class Foo { build() { return new StatementPool(c, typeCast(this._x)); } }`,
    );
    const bound = extractFromSource(
      `class Foo {
        build() {
          const pool = new StatementPool(c, typeCast(this._x));
          pool.y = 1;
          return pool;
        }
      }`,
    );
    // `_x` is the non-callee read inside `typeCast(this._x)`, credited as a call.
    const expected = ["_x", "constructor", "typeCast"];
    expect(direct.instanceMethods.find((m) => m.name === "build")!.calls).toEqual(expected);
    expect(bound.instanceMethods.find((m) => m.name === "build")!.calls).toEqual(expected);
  });

  it("resolves a one-level delegation to a private helper's call-set", () => {
    // `build()` delegates to a single-statement helper that does the `new`;
    // the helper's calls (here `constructor`) are credited back to `build` so
    // extracting an instantiation into a one-liner is parity-equivalent.
    const cls = extractFromSource(
      `class Foo {
        build() { return this.makePool(c); }
        private makePool(c) { return new StatementPool(c, this._x); }
      }`,
    );
    expect(cls.instanceMethods.find((m) => m.name === "build")!.calls).toEqual([
      "_x",
      "constructor",
      "makePool",
    ]);
  });

  it("resolves delegation ONE level only (no transitive chasing)", () => {
    // build → mid → leaf. `build` inherits `mid`'s DIRECT calls (`leaf`), but
    // NOT `leaf`'s body calls (`constructor`) — that would be a second level.
    const cls = extractFromSource(
      `class Foo {
        build() { return this.mid(); }
        private mid() { return this.leaf(); }
        private leaf() { return new Pool(); }
      }`,
    );
    const byName = Object.fromEntries(cls.instanceMethods.map((m) => [m.name, m.calls]));
    expect(byName["build"]).toEqual(["leaf", "mid"]);
    expect(byName["mid"]).toEqual(["constructor", "leaf"]);
  });

  it("does not credit delegation to an unknown / inherited helper", () => {
    // `inheritedHook` is not a method of this class — nothing to union, and the
    // delegating method keeps only the literal call name.
    const cls = extractFromSource(`class Foo { build() { return this.inheritedHook(); } }`);
    expect(cls.instanceMethods.find((m) => m.name === "build")!.calls).toEqual(["inheritedHook"]);
  });

  it("does not merge a same-named static helper into a `this.helper()` delegation", () => {
    // `this.makePool()` dispatches to the INSTANCE helper (which makes no call);
    // the static `makePool` (`new Pool()`) shares the name but has a separate
    // `Class.makePool(...)` call site and must not leak its `constructor` in.
    const cls = extractFromSource(
      `class Foo {
        build() { return this.makePool(); }
        private makePool() { return cached(); }
        private static makePool() { return new Pool(); }
      }`,
    );
    expect(cls.instanceMethods.find((m) => m.name === "build")!.calls).toEqual([
      "cached",
      "makePool",
    ]);
  });

  it("suppresses the call-set of a same-named namespace-delegation wrapper", () => {
    // `buildJoins(arel) { _qm.buildJoins.call(this, arel); }` in relation.ts is a
    // Rails-layout wrapper whose real body lives in relation/query-methods.ts. Its
    // literal call-set (`buildJoins`, `call`) would flag every Ruby call as
    // phantom-missing, so the wrapper contributes no call-set — the canonical
    // module-function candidate is the one compare uses instead.
    const cls = extractFromSource(
      `import * as _qm from "./query-methods.js";
       import * as _fm from "./finder-methods.js";
       class Foo {
        private buildJoins(arel) { _qm.buildJoins.call(this, arel); }
        private buildJoinDependencies() { return _qm.buildJoinDependencies.call(this); }
        applyJoinDependency(eager) { return _fm.applyJoinDependency(this, eager); }
      }`,
    );
    const byName = Object.fromEntries(cls.instanceMethods.map((m) => [m.name, m.calls]));
    expect(byName["buildJoins"]).toBeUndefined();
    expect(byName["buildJoinDependencies"]).toBeUndefined();
    // Direct-call form (no `.call`) is also a self-delegation.
    expect(byName["applyJoinDependency"]).toBeUndefined();
  });

  it("suppresses a same-named static namespace-delegation wrapper", () => {
    // `Base.establishConnection` delegates to `ConnectionHandling.establishConnection`.
    const cls = extractFromSource(
      `import * as ConnectionHandling from "./connection-handling.js";
       class Foo {
        static establishConnection(config) { return ConnectionHandling.establishConnection(this, config); }
      }`,
    );
    expect(cls.classMethods.find((m) => m.name === "establishConnection")!.calls).toBeUndefined();
  });

  it("does NOT suppress a namespace delegation to a DIFFERENTLY-named function", () => {
    // Only a wrapper whose delegate matches its own name is the double-attributed
    // duplicate; a rename-delegation is a genuine (thin) body worth comparing.
    const cls = extractFromSource(
      `import * as _qm from "./query-methods.js";
       class Foo { buildJoins(arel) { _qm.emitJoinPlan.call(this, arel); } }`,
    );
    expect(cls.instanceMethods.find((m) => m.name === "buildJoins")!.calls).toEqual([
      "call",
      "emitJoinPlan",
    ]);
  });

  it("does NOT suppress a same-named delegation whose receiver is unbound", () => {
    // A receiver that resolves to no symbol (only possible for a genuinely unbound
    // identifier — non-compiling code) fails toward tracking: keep the extracted
    // call-set rather than risk a false-positive suppression that drops a real body.
    const cls = extractFromSource(
      `class Foo { buildJoins(arel) { unbound.buildJoins.call(this, arel); } }`,
    );
    expect(cls.instanceMethods.find((m) => m.name === "buildJoins")!.calls).toEqual([
      "buildJoins",
      "call",
    ]);
  });

  it("does NOT suppress a `this`-delegation with a matching name (delegatedHelper path)", () => {
    // A same-class `this.helper()` delegation is handled by delegatedHelper, not
    // suppressed — its helper's call-set is unioned in as usual.
    const cls = extractFromSource(
      `class Foo {
        build() { return this.build_(); }
        private build_() { return new Pool(); }
      }`,
    );
    expect(cls.instanceMethods.find((m) => m.name === "build")!.calls).toEqual([
      "build_",
      "constructor",
    ]);
  });

  it("does NOT suppress an in-class instance→static delegation (class receiver)", () => {
    // `QueryAttribute#withCastValue` delegates to its own static of the same name,
    // but the body has real reads (`this.name`, `this.type`) that must be kept.
    // The receiver is a CLASS, not a namespace/module, so it is not a wrapper.
    const cls = extractFromSource(
      `class QueryAttribute {
        static withCastValue(name, value, type) { return new QueryAttribute(name, value, type); }
        withCastValue(value) { return QueryAttribute.withCastValue(this.name, value, this.type); }
      }`,
      "QueryAttribute",
    );
    const inst = cls.instanceMethods.find((m) => m.name === "withCastValue")!;
    expect(inst.calls).toEqual(["name", "type", "withCastValue"]);
  });

  it("captures calls in object-literal mixin methods (include(Host, Mod) pattern)", () => {
    const methods = objectLiteralMethods(
      `export const QueryMethods = {
        where(opts: object) { this.spawn(); buildWhere(opts); },
        toArrow: () => { records(); },
      };`,
    );
    const byName = Object.fromEntries(methods.map((m) => [m.name, m.calls]));
    expect(byName["where"]).toEqual(["buildWhere", "spawn"]);
    expect(byName["toArrow"]).toEqual(["records"]);
  });

  it("credits a get-accessor value READ as a call (Ruby reader-call semantics)", () => {
    // `this.joinsValues` is the faithful TS mirror of Ruby's `joins_values`
    // method send — a bare read, since Ruby has no attribute reads, only calls.
    // The accessor-backed value read must be credited to the ported call set.
    const cls = extractFromSource(
      `class Foo {
        buildJoins() {
          const j = this.joinsValues;
          return this.leftOuterJoinsValues.concat(j);
        }
      }`,
    );
    const m = cls.instanceMethods.find((m) => m.name === "buildJoins")!;
    expect(m.calls).toEqual(["concat", "joinsValues", "leftOuterJoinsValues"]);
  });

  it("does not double-record a call's callee property as a value read", () => {
    // `this.joinsValues(...)` — the callee `joinsValues` is recorded ONCE by the
    // call branch; the read-crediting branch must skip the callee access so the
    // name is not counted twice (it is de-duped anyway, but the branch must not
    // fire on a callee).
    const cls = extractFromSource(`class Foo { run() { this.joinsValues(); } }`);
    const m = cls.instanceMethods.find((m) => m.name === "run")!;
    expect(m.calls).toEqual(["joinsValues"]);
  });

  it("does not credit an assignment target as a value read (write mirrors the setter)", () => {
    // `this.joinsValues = x` mirrors Ruby's writer send `joins_values=`, not the
    // reader `joins_values`; crediting the reader name would be unfaithful and
    // make the call set depend on body shape. The RHS read `x.dup` still counts.
    const cls = extractFromSource(`class Foo { reset(x) { this.joinsValues = x.dup; } }`);
    const m = cls.instanceMethods.find((m) => m.name === "reset")!;
    expect(m.calls).toEqual(["dup"]);
  });

  it("does not credit a destructuring-assignment target as a value read", () => {
    // A property access nested in a destructuring LHS is still a write, mirroring
    // the `foo=` setter — array-pattern (`[this.foo] = arr`) and object-pattern
    // (`({ a: this.bar } = obj)`) targets must be skipped, while the RHS reads
    // (`arr.pop`, `obj.build`) are still credited.
    const cls = extractFromSource(
      `class Foo {
        reset(arr, obj) {
          [this.foo] = arr.pop();
          ({ a: this.bar } = obj.build());
        }
      }`,
    );
    const m = cls.instanceMethods.find((m) => m.name === "reset")!;
    expect(m.calls).toEqual(["build", "pop"]);
  });
});

describe("body call capture — renamed-import aliases", () => {
  it("credits a renamed-import call back to the original imported name", () => {
    // Mirrors touch-later.ts `touchDeferredAttributes` → `timestampTouch.call(...)`
    // where `import { touch as timestampTouch } from "./timestamp.js"`.
    const info = extractFromFiles("/p", {
      "timestamp.ts": `export function touch(): void {}`,
      "touch-later.ts": `
        import { touch as timestampTouch } from "./timestamp.js";
        export class TouchLater {
          touchDeferredAttributes(): void {
            timestampTouch.call(this, { time: 1 });
            timestampTouch();
          }
        }
      `,
    });
    const cls = info.classes["touch-later.ts:TouchLater"];
    const m = cls.instanceMethods.find((m) => m.name === "touchDeferredAttributes")!;
    // `touch` (resolved from `timestampTouch` via both the aliased direct call
    // and the `.call` dispatch) plus the retained literal `call`.
    expect(m.calls).toEqual(["call", "timestampTouch", "touch"]);
  });

  it("does not leak one file's aliases into another", () => {
    const info = extractFromFiles("/p", {
      "a.ts": `
        import { touch as renamed } from "./b.js";
        export class A { run(): void { renamed(); } }
      `,
      "b.ts": `
        export function touch(): void {}
        export class B { go(): void { renamed(); } }
      `,
    });
    // In b.ts, `renamed` is an undeclared identifier — it must stay "renamed",
    // proving a.ts's alias map was cleared before b.ts was walked.
    expect(info.classes["a.ts:A"].instanceMethods.find((m) => m.name === "run")!.calls).toEqual([
      "renamed",
      "touch",
    ]);
    expect(info.classes["b.ts:B"].instanceMethods.find((m) => m.name === "go")!.calls).toEqual([
      "renamed",
    ]);
  });
});

describe("extractFileConstants", () => {
  it("captures exported const + public static readonly literals, excludes the rest", () => {
    const src = `export const BATCH = 1000; export let MUTABLE = 1; const PRIVATE = 2;
      class C { static readonly PUBLIC = "x"; private static readonly SECRET = 3;
        static readonly DYNAMIC = compute(); }`;
    expect(extractFileConstants(compile(src).sourceFile)).toEqual({
      BATCH: { kind: "int", value: "1000" },
      PUBLIC: { kind: "string", value: "x" },
    });
  });
});

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
    [ASC_PATH]: `export function include(klass: any, mod: any): void {}
export function extend(klass: any, mod: any): void {}`,
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

  it("detects include() calls nested inside a module-level helper function", () => {
    // Mirrors connection-adapters/abstract-adapter.ts after PR #4458, which
    // moved the `include(AbstractAdapter, ...)` calls into a guarded
    // `ensureAbstractAdapterMixinsApplied()` helper to break a module-eval
    // TDZ cycle. The calls are no longer top-level expression statements but
    // still describe the host's mixin surface, so they must be attributed.
    const info = extractFromFiles("/p", {
      "math.ts": `export const Math = { add() {}, mul() {} };`,
      "node.ts": `export class Node {}`,
      "wire.ts": `
        import { include } from "@blazetrails/activesupport";
        import { Node } from "./node.js";
        import { Math } from "./math.js";
        let applied = false;
        function ensureMixinsApplied() {
          if (applied) return;
          applied = true;
          include(Node, Math);
        }
        ensureMixinsApplied();
      `,
    });
    expect(info.classes["node.ts:Node"].extends).toContain("Math");
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

describe("extractFromProgram — extend() detection", () => {
  it("pushes a bare-identifier class mod onto host.extends", () => {
    const info = extractFromFiles("/p", {
      "querying.ts": `export class Querying { all(): void {} }`,
      "base.ts": `export class Base {}`,
      "wire.ts": `
        import { extend } from "@blazetrails/activesupport";
        import { Base } from "./base.js";
        import { Querying } from "./querying.js";
        extend(Base, Querying);
      `,
    });
    expect(info.classes["base.ts:Base"].extends).toContain("Querying");
  });

  it("follows import aliases (`Querying as QueryingMixin`) to the canonical class name", () => {
    const info = extractFromFiles("/p", {
      "querying.ts": `export class Querying { all(): void {} }`,
      "base.ts": `export class Base {}`,
      "wire.ts": `
        import { extend } from "@blazetrails/activesupport";
        import { Base } from "./base.js";
        import { Querying as QueryingMixin } from "./querying.js";
        extend(Base, QueryingMixin);
      `,
    });
    expect(info.classes["base.ts:Base"].extends).toContain("Querying");
  });

  it("detects extend() calls nested inside a module-level helper function", () => {
    // The extend pass shares the whole-file walk with include(), so a call
    // applied from a deferred-mixin helper (rather than a top-level statement)
    // must still be attributed to the host.
    const info = extractFromFiles("/p", {
      "querying.ts": `export class Querying { all(): void {} }`,
      "base.ts": `export class Base {}`,
      "wire.ts": `
        import { extend } from "@blazetrails/activesupport";
        import { Base } from "./base.js";
        import { Querying } from "./querying.js";
        function ensureMixinsApplied() {
          extend(Base, Querying);
        }
        ensureMixinsApplied();
      `,
    });
    expect(info.classes["base.ts:Base"].extends).toContain("Querying");
  });

  it("resolves property-access mod arg by harvesting the declaration's methods directly", () => {
    const info = extractFromFiles("/p", {
      "translation.ts": `
        export function humanAttributeName(): string { return ""; }
        export const ClassMethods = { humanAttributeName };
      `,
      "base.ts": `export class Base {}`,
      "wire.ts": `
        import { extend } from "@blazetrails/activesupport";
        import * as Translation from "./translation.js";
        import { Base } from "./base.js";
        extend(Base, Translation.ClassMethods);
      `,
    });
    const base = info.classes["base.ts:Base"];
    expect(base.instanceMethods.map((m) => m.name)).toContain("humanAttributeName");
    expect(base.extends).not.toContain("ClassMethods");
  });

  it("pushes inline object-literal mod methods directly onto the host", () => {
    const info = extractFromFiles("/p", {
      "base.ts": `export class Base {}`,
      "wire.ts": `
        import { extend } from "@blazetrails/activesupport";
        import { Base } from "./base.js";
        extend(Base, { find() {}, findBy: () => {}, where: function () {} });
      `,
    });
    expect(info.classes["base.ts:Base"].instanceMethods.map((m) => m.name).sort()).toEqual([
      "find",
      "findBy",
      "where",
    ]);
  });

  it("ignores `extend()` calls when the file doesn't import from @blazetrails/activesupport", () => {
    const info = extractFromFiles("/p", {
      "base.ts": `export class Base {}`,
      "querying.ts": `export const Querying = { all() {} };`,
      "wire.ts": `
        import { Base } from "./base.js";
        import { Querying } from "./querying.js";
        function extend(a: any, b: any) {}
        extend(Base, Querying);
      `,
    });
    expect(info.classes["base.ts:Base"].extends).not.toContain("Querying");
  });
});

describe("extractFromProgram — Object.defineProperty wiring", () => {
  it("credits a string-literal defineProperty key to the host class (Pattern A)", () => {
    const info = extractFromFiles("/p", {
      "base.ts": `export class Base {}`,
      "wire.ts": `
        import { Base } from "./base.js";
        import { createRecord } from "./callbacks.js";
        Object.defineProperty(Base.prototype, "createOrUpdate", {
          value: createRecord,
          configurable: true,
          writable: true,
          enumerable: false,
        });
      `,
      "callbacks.ts": `export function createRecord(attribute: string) {}`,
    });
    const methods = info.classes["base.ts:Base"].instanceMethods.map((m) => m.name);
    expect(methods).toContain("createOrUpdate");
    const m = info.classes["base.ts:Base"].instanceMethods.find(
      (x) => x.name === "createOrUpdate",
    )!;
    expect(m.visibility).toBe("private");
    expect(m.internal).toBe(true);
    // The descriptor's `value` alias carries the target's arity — recording it
    // as 0-arg put a bogus [0-0] candidate in the arity pool.
    expect(m.params).toEqual([{ name: "attribute", kind: "required", type: "string" }]);
  });

  it("credits for-of loop over [name, fn][] array to host class (Pattern B)", () => {
    const info = extractFromFiles("/p", {
      "base.ts": `export class Base {}`,
      "callbacks.ts": `
        export function createOrUpdate() {}
        export function _createRecord(attributeNames: string[]) {}
        export function _updateRecord(attributeNames: string[]) {}
      `,
      "wire.ts": `
        import { Base } from "./base.js";
        import { createOrUpdate, _createRecord, _updateRecord } from "./callbacks.js";
        for (const [name, fn] of [
          ["createOrUpdate", createOrUpdate],
          ["_createRecord", _createRecord],
          ["_updateRecord", _updateRecord],
        ] as const) {
          Object.defineProperty(Base.prototype, name, {
            value: fn,
            configurable: true,
            writable: true,
            enumerable: false,
          });
        }
      `,
    });
    const names = info.classes["base.ts:Base"].instanceMethods.map((m) => m.name);
    expect(names).toContain("createOrUpdate");
    expect(names).toContain("_createRecord");
    expect(names).toContain("_updateRecord");
    for (const name of ["createOrUpdate", "_createRecord", "_updateRecord"]) {
      const m = info.classes["base.ts:Base"].instanceMethods.find((x) => x.name === name)!;
      expect(m.visibility).toBe("private");
      expect(m.internal).toBe(true);
    }
    // Each tuple's own fn supplies the params — not one shared empty list.
    const byName = Object.fromEntries(
      info.classes["base.ts:Base"].instanceMethods.map((m) => [m.name, m.params]),
    );
    expect(byName["createOrUpdate"]).toEqual([]);
    expect(byName["_createRecord"]).toEqual([
      { name: "attributeNames", kind: "required", type: "string[]" },
    ]);
  });

  it("skips for-of loop when descriptor has no `value` key (getter/setter descriptors)", () => {
    const info = extractFromFiles("/p", {
      "base.ts": `export class Base {}`,
      "wire.ts": `
        import { Base } from "./base.js";
        for (const [name, fn] of [["myGetter", () => 42]] as const) {
          Object.defineProperty(Base.prototype, name, {
            get: fn,
            configurable: true,
          });
        }
      `,
    });
    const names = info.classes["base.ts:Base"].instanceMethods.map((m) => m.name);
    expect(names).not.toContain("myGetter");
  });

  it("does not double-add if the method is already on the class", () => {
    const info = extractFromFiles("/p", {
      "base.ts": `export class Base { createOrUpdate() {} }`,
      "callbacks.ts": `export function createOrUpdate() {}`,
      "wire.ts": `
        import { Base } from "./base.js";
        import { createOrUpdate } from "./callbacks.js";
        Object.defineProperty(Base.prototype, "createOrUpdate", {
          value: createOrUpdate,
          configurable: true,
          writable: true,
        });
      `,
    });
    const hits = info.classes["base.ts:Base"].instanceMethods.filter(
      (m) => m.name === "createOrUpdate",
    );
    expect(hits).toHaveLength(1);
  });
});

describe("packageFingerprint (per-package cache key)", () => {
  // Track every tmp dir we create so afterEach can clean up; otherwise
  // repeated test runs leave /tmp/fp-*/ entries behind.
  const tmpDirs: string[] = [];
  function makeTmpDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }
  afterEach(() => {
    while (tmpDirs.length > 0) {
      const dir = tmpDirs.pop()!;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function fixture(): { dir: string; files: string[] } {
    const dir = makeTmpDir("fp-");
    fs.writeFileSync(path.join(dir, "a.ts"), "export const a = 1;\n");
    fs.writeFileSync(path.join(dir, "b.ts"), "export const b = 22;\n");
    return { dir, files: [path.join(dir, "a.ts"), path.join(dir, "b.ts")] };
  }

  it("is stable across calls when nothing changed (cache HIT)", () => {
    const { dir, files } = fixture();
    expect(packageFingerprint(files, dir)).toBe(packageFingerprint(files, dir));
  });

  it("changes when file content changes (cache MISS on edit)", () => {
    const { dir, files } = fixture();
    const before = packageFingerprint(files, dir);
    // Bump mtime + write different content. Sleep 5ms because some
    // filesystems quantize mtimeMs at millisecond granularity.
    const later = new Date(Date.now() + 50);
    fs.writeFileSync(files[0], "export const a = 999;\n");
    fs.utimesSync(files[0], later, later);
    expect(packageFingerprint(files, dir)).not.toBe(before);
  });

  it("changes on rename even when count/size/maxMtime are identical", () => {
    // The earlier `count + maxMtime + sumSize` heuristic missed
    // renames. SHA over sorted (relPath, mtime, size) triples
    // catches them.
    const { dir, files } = fixture();
    const before = packageFingerprint(files, dir);
    const renamed = path.join(dir, "renamed.ts");
    fs.renameSync(files[0], renamed);
    const after = packageFingerprint([renamed, files[1]], dir);
    expect(after).not.toBe(before);
  });

  it("is independent of input order (sort makes the digest deterministic)", () => {
    const { dir, files } = fixture();
    const a = packageFingerprint(files, dir);
    const b = packageFingerprint([...files].reverse(), dir);
    expect(a).toBe(b);
  });

  it("is independent of absolute path location (uses relative paths)", () => {
    // Move the same files under a different parent dir → digest
    // unchanged once mtimes are pinned. utimesSync with a fixed Date
    // is the only filesystem-portable way to assert this; copyFile +
    // stat-restore lost sub-ms precision on some filesystems.
    const { dir, files } = fixture();
    const fixedMtime = new Date(1700000000000);
    for (const f of files) fs.utimesSync(f, fixedMtime, fixedMtime);
    const before = packageFingerprint(files, dir);

    const dir2 = makeTmpDir("fp2-");
    const moved = files.map((f) => {
      const dest = path.join(dir2, path.basename(f));
      fs.copyFileSync(f, dest);
      fs.utimesSync(dest, fixedMtime, fixedMtime);
      return dest;
    });
    expect(packageFingerprint(moved, dir2)).toBe(before);
  });
});

describe("tsLiteralValue — negative numbers", () => {
  const parseExpr = (src: string): ts.Expression => {
    const sf = ts.createSourceFile("t.ts", `const x = ${src};`, ts.ScriptTarget.Latest, true);
    const stmt = sf.statements[0] as ts.VariableStatement;
    return stmt.declarationList.declarations[0].initializer!;
  };

  it("folds a negative integer prefix-unary into an int literal", () => {
    expect(tsLiteralValue(parseExpr("-1"))).toEqual({ kind: "int", value: "-1" });
  });

  it("folds a negative float prefix-unary into a float literal", () => {
    expect(tsLiteralValue(parseExpr("-2.5"))).toEqual({ kind: "float", value: "-2.5" });
  });

  it("leaves a unary minus over a non-literal uncomparable", () => {
    expect(tsLiteralValue(parseExpr("-x"))).toBeUndefined();
  });
});

describe("extractFromProgram — @internal JSDoc on top-level functions", () => {
  it("tags an @internal-tagged export function and leaves its untagged sibling public", () => {
    const info = extractFromFiles("/p", {
      "quoting.ts": `
        /**
         * Wiring seam, not Rails surface.
         *
         * @internal
         */
        export function dispatchQuote(value: unknown): string { return ""; }

        /** Rails-facing. */
        export function quote(value: unknown): string { return ""; }
      `,
    });
    const fns = info.fileFunctions["quoting.ts"];
    expect(fns.find((f) => f.name === "dispatchQuote")!.internal).toBe(true);
    expect(fns.find((f) => f.name === "quote")!.internal).toBeUndefined();
  });

  it("skips the fabricated module for a file whose exported functions are all @internal", () => {
    const info = extractFromFiles("/p", {
      "key-normalization.ts": `
        /** @internal */
        export function normalizeKey(k: string): string { return k; }
        /** @internal */
        export function denormalizeKey(k: string): string { return k; }
      `,
    });
    expect(info.modules["key-normalization.ts:KeyNormalization"]).toBeUndefined();
    expect(info.fileFunctions["key-normalization.ts"].every((f) => f.internal)).toBe(true);
  });

  it("tags an @internal-tagged exported function-valued const and leaves its sibling public", () => {
    const info = extractFromFiles("/p", {
      "finder-methods.ts": `
        function bangFinder(f: () => number) { return () => f(); }
        function base(): number { return 1; }

        /** @internal */
        export const performSecondBang = bangFinder(base);

        export const secondBang = bangFinder(base);
      `,
    });
    const fns = info.fileFunctions["finder-methods.ts"];
    expect(fns.find((f) => f.name === "performSecondBang")!.internal).toBe(true);
    expect(fns.find((f) => f.name === "secondBang")!.internal).toBeUndefined();
  });
});

describe("extractFromProgram — re-export attribution", () => {
  it("marks barrel clones with reExportedFrom and leaves local declarations bare", () => {
    const info = extractFromFiles("/p", {
      "adapters/abstract-adapter.ts": `export class AbstractAdapter { quoteTableName(): void {} }`,
      "adapters/pool.ts": `export const ConnectionPool = { checkout() {} };`,
      "adapters.ts": `
        export { AbstractAdapter } from "./adapters/abstract-adapter.js";
        export { ConnectionPool } from "./adapters/pool.js";
        export class LocalHelper { helpMe(): void {} }
      `,
    });

    expect(
      info.classes["adapters/abstract-adapter.ts:AbstractAdapter"].reExportedFrom,
    ).toBeUndefined();
    expect(info.classes["adapters.ts:AbstractAdapter"].reExportedFrom).toBe(
      "adapters/abstract-adapter.ts:AbstractAdapter",
    );
    expect(info.modules["adapters.ts:ConnectionPool"].reExportedFrom).toBe(
      "adapters/pool.ts:ConnectionPool",
    );
    expect(info.classes["adapters.ts:LocalHelper"].reExportedFrom).toBeUndefined();
  });
});

describe("extractFromProgram — @noRailsEquivalent JSDoc", () => {
  it("records the reason on a tagged class member and leaves its sibling bare", () => {
    const info = extractFromSource(`
      class Foo {
        /**
         * Registry hook — public by design; @internal would be a lie.
         *
         * @noRailsEquivalent trails-only model registry seam
         */
        registerModel(): void {}

        save(): void {}
      }
    `);
    const registerModel = info.instanceMethods.find((m) => m.name === "registerModel")!;
    expect(registerModel.noRailsEquivalent).toBe("trails-only model registry seam");
    expect(registerModel.internal).toBeUndefined();
    expect(info.instanceMethods.find((m) => m.name === "save")!.noRailsEquivalent).toBeUndefined();
  });

  it("records the reason on a tagged getter and a tagged static method", () => {
    const info = extractFromSource(`
      class Foo {
        /** @noRailsEquivalent JS thenable protocol */
        get pending(): boolean { return true; }

        /** @noRailsEquivalent TS-only ergonomic finder */
        static findGlobalId(): void {}
      }
    `);
    expect(info.instanceMethods.find((m) => m.name === "pending")!.noRailsEquivalent).toBe(
      "JS thenable protocol",
    );
    expect(info.classMethods.find((m) => m.name === "findGlobalId")!.noRailsEquivalent).toBe(
      "TS-only ergonomic finder",
    );
  });

  it("records the reason on a tagged top-level exported function", () => {
    const info = extractFromFiles("/p", {
      "associations.ts": `
        /** @noRailsEquivalent public registration surface, no Rails counterpart */
        export function registerModel(): void {}

        export function hasMany(): void {}
      `,
    });
    const fns = info.fileFunctions["associations.ts"];
    expect(fns.find((f) => f.name === "registerModel")!.noRailsEquivalent).toBe(
      "public registration surface, no Rails counterpart",
    );
    expect(fns.find((f) => f.name === "hasMany")!.noRailsEquivalent).toBeUndefined();
  });

  it("drops the reason on a renamed export of a tagged declaration", () => {
    const info = extractFromFiles("/p", {
      "routes-helpers.ts": `
        /** @noRailsEquivalent \`with\` is an ES strict-mode reserved word */
        export function withRoutesHelpers(): void {}

        export { withRoutesHelpers as with };
      `,
    });
    const fns = info.fileFunctions["routes-helpers.ts"];
    expect(fns.find((f) => f.name === "withRoutesHelpers")!.noRailsEquivalent).toBe(
      "`with` is an ES strict-mode reserved word",
    );
    expect(fns.find((f) => f.name === "with")!.noRailsEquivalent).toBeUndefined();
  });

  it("reads a renamed export's own reason instead of the declaration's", () => {
    const info = extractFromFiles("/p", {
      "registry.ts": `
        /** @noRailsEquivalent declared spelling, no Rails counterpart */
        export function registerModelClass(): void {}

        /** @noRailsEquivalent alias is trails-only sugar */
        export { registerModelClass as registerModel };
      `,
    });
    const fns = info.fileFunctions["registry.ts"];
    expect(fns.find((f) => f.name === "registerModelClass")!.noRailsEquivalent).toBe(
      "declared spelling, no Rails counterpart",
    );
    expect(fns.find((f) => f.name === "registerModel")!.noRailsEquivalent).toBe(
      "alias is trails-only sugar",
    );
  });

  it("records the reason on a tagged object-literal module member", () => {
    const methods = objectLiteralMethods(`
      export const QueryMethods = {
        /** @noRailsEquivalent async iteration protocol, JS-only */
        eachAsync() {},
        where() {},
      };
    `);
    expect(methods.find((m) => m.name === "eachAsync")!.noRailsEquivalent).toBe(
      "async iteration protocol, JS-only",
    );
    expect(methods.find((m) => m.name === "where")!.noRailsEquivalent).toBeUndefined();
  });

  it("joins continuation lines into one reason", () => {
    const info = extractFromSource(`
      class Foo {
        /**
         * @noRailsEquivalent Rails reaches this through the connection
         *   adapter; trails exposes it directly because the pool is async.
         */
        withConnection(): void {}
      }
    `);
    expect(info.instanceMethods.find((m) => m.name === "withConnection")!.noRailsEquivalent).toBe(
      "Rails reaches this through the connection adapter; trails exposes it " +
        "directly because the pool is async.",
    );
  });

  it("records the reason on a synthesized __mixin member", () => {
    const info = extractFromFiles("/p", {
      "attributes.ts": `
        export function Attributes(Base: new () => object) {
          class M extends Base {
            /** @noRailsEquivalent async attribute hydration, JS-only */
            loadAttributes(): void {}
          }
          return M;
        }
      `,
    });
    const mixin = info.modules["attributes.ts:Attributes__mixin"];
    expect(mixin.instanceMethods.find((m) => m.name === "loadAttributes")!.noRailsEquivalent).toBe(
      "async attribute hydration, JS-only",
    );
  });

  it("leaves an inherited __mixin member's tag on its declaring file only", () => {
    const info = extractFromFiles("/p", {
      "base.ts": `
        export class Base {
          /** @noRailsEquivalent JS-only lifecycle hook */
          dispose(): void {}
        }
      `,
      "attributes.ts": `
        import { Base } from "./base.js";
        export function Attributes(B: typeof Base) {
          class M extends B {
            loadAttributes(): void {}
          }
          return M;
        }
      `,
    });
    const mixin = info.modules["attributes.ts:Attributes__mixin"];
    const dispose = mixin.instanceMethods.find((m) => m.name === "dispose")!;
    expect(dispose.declaredIn).toBe("base.ts");
    expect(dispose.noRailsEquivalent).toBeUndefined();
    expect(
      info.classes["base.ts:Base"].instanceMethods.find((m) => m.name === "dispose")!
        .noRailsEquivalent,
    ).toBe("JS-only lifecycle hook");
  });

  it("records the reason on tagged namespace members", () => {
    const info = extractFromFiles("/p", {
      "locator.ts": `
        export namespace Locator {
          /** @noRailsEquivalent trails-side model-facing finder */
          export function findGlobalId(): void {}

          /** @noRailsEquivalent JS-only signed-id ergonomic */
          export const findSignedGlobalId = (): void => {};

          export function locate(): void {}
        }
      `,
    });
    const ns = info.modules["locator.ts:Locator"];
    const reasonOf = (name: string) =>
      ns.instanceMethods.find((m) => m.name === name)!.noRailsEquivalent;
    expect(reasonOf("findGlobalId")).toBe("trails-side model-facing finder");
    expect(reasonOf("findSignedGlobalId")).toBe("JS-only signed-id ergonomic");
    expect(reasonOf("locate")).toBeUndefined();
  });

  it("records the reason on a tagged interface method signature", () => {
    const info = extractFromFiles("/p", {
      "quoting.ts": `
        export interface Quoting {
          /** @noRailsEquivalent async quoting seam, no Rails counterpart */
          quoteAsync(value: unknown): Promise<string>;

          quote(value: unknown): string;
        }
      `,
    });
    const iface = info.classes["quoting.ts:Quoting"] ?? info.modules["quoting.ts:Quoting"];
    expect(iface.instanceMethods.find((m) => m.name === "quoteAsync")!.noRailsEquivalent).toBe(
      "async quoting seam, no Rails counterpart",
    );
    expect(
      iface.instanceMethods.find((m) => m.name === "quote")!.noRailsEquivalent,
    ).toBeUndefined();
  });

  it("carries a tag through an interface's resolved extends members", () => {
    const info = extractFromFiles("/p", {
      "relation-base.ts": `
        export interface RelationBase {
          /** @noRailsEquivalent JS thenable protocol on Relation */
          then(onFulfilled: () => void): void;

          where(): void;
        }
      `,
      "relation.ts": `
        import type { RelationBase } from "./relation-base.js";
        export interface Relation extends RelationBase {}
      `,
    });
    const rel = info.classes["relation.ts:Relation"] ?? info.modules["relation.ts:Relation"];
    expect(rel.instanceMethods.find((m) => m.name === "then")!.noRailsEquivalent).toBe(
      "JS thenable protocol on Relation",
    );
    expect(rel.instanceMethods.find((m) => m.name === "where")!.noRailsEquivalent).toBeUndefined();
  });

  it("throws when the tag carries no reason", () => {
    expect(() =>
      extractFromSource(`
        class Foo {
          /** @noRailsEquivalent */
          registerModel(): void {}
        }
      `),
    ).toThrow(/@noRailsEquivalent needs a reason/);
  });

  it("throws when a bare tag name in the reason truncates it", () => {
    expect(() =>
      extractFromSource(`
        class Foo {
          /**
           * @noRailsEquivalent wiring seam; @internal is the wrong tool here
           * because the method is real Rails-facing surface.
           */
          initializeAssociations(): void {}
        }
      `),
    ).toThrow(/truncated by a bare `@internal`/);
  });

  it("accepts a following tag that starts its own line", () => {
    const foo = extractFromSource(`
      class Foo {
        /**
         * @noRailsEquivalent wiring seam with no Rails counterpart
         * @param name the model name
         */
        registerModel(name: string): void {}
      }
    `);
    expect(foo.instanceMethods.find((m) => m.name === "registerModel")!.noRailsEquivalent).toBe(
      "wiring seam with no Rails counterpart",
    );
  });
});

describe("sub-package de-overlap", () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    while (tmpDirs.length > 0) {
      fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
    }
  });

  /** src/{parent.ts, support/{helper.ts}} — `support` is the sub-package root. */
  function fixture(): { srcDir: string; subDir: string } {
    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "deoverlap-"));
    tmpDirs.push(srcDir);
    const subDir = path.join(srcDir, "support");
    fs.mkdirSync(subDir);
    fs.writeFileSync(
      path.join(srcDir, "parent.ts"),
      'import { Helper } from "./support/helper.js";\nexport class Parent {\n  use(): typeof Helper {\n    return Helper;\n  }\n}\n',
    );
    fs.writeFileSync(
      path.join(subDir, "helper.ts"),
      "export class Helper {\n  ddl(): void {}\n}\n",
    );
    return { srcDir, subDir };
  }

  it("maps activerecord's src/support to the activerecord-test-support package", () => {
    expect(overlappingSubDirs("activerecord")).toEqual([
      packageSrcDir("activerecord-test-support"),
    ]);
    expect(packageSrcDir("activerecord-test-support")).toBe(
      path.join(packageSrcDir("activerecord"), "support"),
    );
  });

  it("leaves sibling sub-packages (actionpack) with nothing to exclude", () => {
    expect(overlappingSubDirs("actiondispatch")).toEqual([]);
    expect(overlappingSubDirs("actioncontroller")).toEqual([]);
  });

  it("omits an excluded subdir from the walked file list", () => {
    const { srcDir, subDir } = fixture();
    expect(getAllTsFiles(srcDir)).toContain(path.join(subDir, "helper.ts"));
    expect(getAllTsFiles(srcDir, [subDir])).toEqual([path.join(srcDir, "parent.ts")]);
  });

  it("omits an excluded subdir's classes even when the parent imports them", () => {
    const { srcDir, subDir } = fixture();
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    };
    const entry = [path.join(srcDir, "parent.ts")];

    const withOverlap = extractFromProgram(ts.createProgram(entry, options), srcDir);
    expect(Object.keys(withOverlap.classes).sort()).toEqual([
      "parent.ts:Parent",
      "support/helper.ts:Helper",
    ]);

    const deOverlapped = extractFromProgram(ts.createProgram(entry, options), srcDir, [subDir]);
    expect(Object.keys(deOverlapped.classes)).toEqual(["parent.ts:Parent"]);
  });
});
