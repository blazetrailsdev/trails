/**
 * Focused tests for the extractor's re-export path resolution.
 * End-to-end re-export recognition is covered transitively by
 * `parity:api` + the manifest; these pin the path-math so keys
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
  harvestObjectLiteralMethods,
  packageFingerprint,
  tsLiteralValue,
} from "./extract-ts-api.js";
import { collectTsFileNames } from "./extra-surface.js";
import { CALL_ARG_DESCRIPTOR_VOCABULARY } from "./extractor-skew.js";
import { overlappingSubDirs, packageSrcDir } from "./config.js";
import { COMPARED_TS_FILES, walkTsFilesSync } from "./ts-file-walk.js";
import type { CallSite, ClassInfo, MethodInfo, PackageInfo } from "@blazetrails/parity/types";

const VIRTUAL = "virtual.ts";

function fileFunctionsOf(info: PackageInfo, file: string): MethodInfo[] {
  const fns = info.fileFunctions?.[file];
  if (fns === undefined) throw new Error(`extractor emitted no fileFunctions for ${file}`);
  return fns;
}

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
    expect(save.calls).toEqual([".nested", ".touch", "helper", "nested", "runCallbacks", "touch"]);
  });

  it("records the call-set of a get accessor body, as it does for a method", () => {
    // A Rails method trails ports as a getter (`query_cache` →
    // `get queryCache()`) is a ported body like any other; without a `calls`
    // set the call gate sees an empty population and can never flag a
    // dropped call in it.
    const cls = extractFromSource(
      `class Foo {
        get queryCache() {
          return this.computeIfAbsent(this.executionContextId());
        }
        set queryCache(value) {
          this.store(value);
        }
      }`,
    );
    const reader = cls.instanceMethods.find((m) => m.name === "queryCache" && !m.writer)!;
    expect(reader.calls).toEqual(["computeIfAbsent", "executionContextId"]);
    expect(reader.callSeq).toEqual(["executionContextId", "computeIfAbsent"]);
    expect(reader.skeleton).toBeDefined();

    const writer = cls.instanceMethods.find((m) => m.name === "queryCache" && m.writer)!;
    expect(writer.calls).toEqual(["store"]);
    expect(writer.callSeq).toEqual(["store"]);
  });

  it("also records the same calls in source order, for the order-only comparison", () => {
    const cls = extractFromSource(
      `class Foo {
        create() {
          this.build();
          this.save();
        }
      }`,
    );
    const create = cls.instanceMethods.find((m) => m.name === "create")!;
    // `calls` is sorted, so `["build", "save"]` there says nothing about order;
    // `callSeq` is what a reordered port shows up in (RFC 0084).
    expect(create.calls).toEqual(["build", "save"]);
    expect(create.callSeq).toEqual(["build", "save"]);

    const reordered = extractFromSource(
      `class Foo {
        create() {
          this.save();
          this.build();
        }
      }`,
    );
    const swapped = reordered.instanceMethods.find((m) => m.name === "create")!;
    expect(swapped.calls).toEqual(["build", "save"]);
    expect(swapped.callSeq).toEqual(["save", "build"]);
  });

  it("records a nested argument before the call it is passed to", () => {
    // Ruby's EVALUATION order (collection_association.rb:121 records
    // build_record before add_to_target), which extract-ruby-api.rb now
    // mirrors: recording it makes the sequence invariant to the hoist an
    // `await` forces, so both spellings below read the same.
    const nested = extractFromSource(
      `class Foo {
        build(attributes) {
          this.addToTarget(this.buildRecord(attributes), true);
        }
      }`,
    );
    expect(nested.instanceMethods.find((m) => m.name === "build")!.callSeq).toEqual([
      "buildRecord",
      "addToTarget",
    ]);

    const hoisted = extractFromSource(
      `class Foo {
        async build(attributes) {
          const record = await this.buildRecord(attributes);
          this.addToTarget(record, true);
        }
      }`,
    );
    expect(hoisted.instanceMethods.find((m) => m.name === "build")!.callSeq).toEqual([
      "buildRecord",
      "addToTarget",
    ]);
  });

  it("records `constructor` for an instantiation but not for a class reference", () => {
    // Shape from persistence.rb:949-955: `self.class.primary_key` first,
    // `RecordNotDestroyed.new` last. The instantiation is the operand of a
    // `throw`, which Rails spells either `raise Foo, msg` (no `new` at all) or
    // `raise Foo.new(msg)` — an ambiguous position both extractors drop from
    // the ORDER stream, keeping it in the call SET.
    const cls = extractFromSource(
      `class Foo {
        raiseNotDestroyed() {
          const key = this.constructor.primaryKey;
          throw new RecordNotDestroyed(\`\${this.constructor.name} \${key}\`, this);
        }
      }`,
    );
    const m = cls.instanceMethods.find((x) => x.name === "raiseNotDestroyed")!;
    expect(m.callSeq).toEqual(["primaryKey", "name"]);
    expect(m.calls).toContain("constructor");
    expect(m.calls).not.toContain("class");
  });

  it("keeps a non-thrown instantiation's position in the sequence", () => {
    // Only the `throw` operand is ambiguous: a plain `new` has one spelling in
    // Ruby (`Foo.new`) and one position.
    const cls = extractFromSource(
      `class Foo {
        build() {
          const scope = this.scope();
          return new Preloader(scope);
        }
      }`,
    );
    const m = cls.instanceMethods.find((x) => x.name === "build")!;
    expect(m.callSeq).toEqual(["scope", "constructor"]);
  });

  it("does not give a respond_to?-guard read the guarded call's position (logger.rb:23-24)", () => {
    const cls = extractFromSource(
      `class Foo {
        call(env) {
          const request = new Request(env);
          return this.logger.pushTags
            ? this.logger.pushTags(...this.computeTags(request)).length
            : 0;
        }
      }`,
    );
    const m = cls.instanceMethods.find((x) => x.name === "call")!;
    expect(m.callSeq).toEqual(["constructor", "logger", "computeTags", "pushTags", "length"]);
    expect(m.calls).toContain("pushTags");
  });

  it("keeps a guard read's position when the body never calls that name", () => {
    const cls = extractFromSource(
      `class Foo {
        call() {
          if (this.logger.pushTags) return this.fallback();
          return 0;
        }
      }`,
    );
    const m = cls.instanceMethods.find((x) => x.name === "call")!;
    expect(m.callSeq).toEqual(["logger", "pushTags", "fallback"]);
  });

  it("keeps a guard read's position when the guarded call has another receiver (schema_definitions.rb:238-240)", () => {
    const cls = extractFromSource(
      `class Foo {
        addTo(table) {
          if (this.index) {
            table.index(this.columnNames(), this.indexOptions(table.name));
          }
        }
      }`,
    );
    const m = cls.instanceMethods.find((x) => x.name === "addTo")!;
    expect(m.callSeq).toEqual(["index", "columnNames", "name", "indexOptions"]);
  });

  it("records a callback argument after the call it is passed to, as Ruby records a block", () => {
    const cls = extractFromSource(
      `class Foo {
        blockBody(xs) {
          xs.forEach((x) => this.save(x));
        }
      }`,
    );
    expect(cls.instanceMethods.find((m) => m.name === "blockBody")!.callSeq).toEqual([
      "forEach",
      "save",
    ]);
  });

  it("also records callSeq for an object-literal member and an arrow-function export", () => {
    // The two populations RFC 0084's order-only check was silently skipping:
    // `export const X = { method() {...} }` (arel's visitor tables, the
    // module-function namespaces) and `export const f = (...) => {...}`.
    const [member] = objectLiteralMethods(
      `export const ClassMethods = {
        create() {
          this.save();
          this.build();
        },
      };`,
    );
    expect(member.calls).toEqual(["build", "save"]);
    expect(member.callSeq).toEqual(["save", "build"]);

    const info = extractFromFiles("/p", {
      "quoting.ts": `
        export const quote = (value: unknown): string => {
          typeCast(value);
          quoteString(value);
          return "";
        };
      `,
    });
    const quote = fileFunctionsOf(info, "quoting.ts").find((f) => f.name === "quote")!;
    expect(quote.calls).toEqual(["quoteString", "typeCast"]);
    expect(quote.callSeq).toEqual(["typeCast", "quoteString"]);
  });

  it("credits an expression-bodied arrow's outermost call", () => {
    // The body IS the CallExpression, so a walk that starts at the body's
    // CHILDREN never sees `where` — Ruby's walk_for_calls is handed the whole
    // body node and credits the equivalent one-expression body (RFC 0084).
    const info = extractFromFiles("/p", {
      "quoting.ts": `export const f = (x: unknown) => where(x);`,
    });
    const f = fileFunctionsOf(info, "quoting.ts").find((fn) => fn.name === "f")!;
    expect(f.calls).toEqual(["where"]);
    expect(f.callSeq).toEqual(["where"]);
    expect(f.skeleton).toEqual(["ref:where"]);
  });

  it("emits an ordered control + call skeleton, with duplicates, alongside calls", () => {
    const cls = extractFromSource(
      `class Foo {
        create(xs: string[]) {
          if (this.dirty) throw new Boom();
          for (const x of xs) this.save(x);
          try {
            this.save(xs[0]);
          } catch {
            this.rollback();
          }
        }
      }`,
    );
    const create = cls.instanceMethods.find((m) => m.name === "create")!;
    expect(create.callSeq).toEqual(["dirty", "save", "rollback"]);
    expect(create.skeleton).toEqual([
      "if",
      "ref:dirty",
      "throw",
      "new:Boom",
      "loop",
      "ref:save",
      "try",
      "ref:save",
      "ref:get",
      "ref:rollback",
    ]);
  });

  it("emits a chained call's refs in evaluation order, receiver first", () => {
    const cls = extractFromSource(
      `class Foo {
        throughScope() {
          const scope = this.throughReflection.klass.unscoped();
          return new Preloader({ scope }).loaders;
        }
      }`,
    );
    const throughScope = cls.instanceMethods.find((m) => m.name === "throughScope")!;
    expect(throughScope.callSeq).toEqual([
      "throughReflection",
      "klass",
      "unscoped",
      "constructor",
      "loaders",
    ]);
    expect(throughScope.skeleton).toEqual([
      "ref:throughReflection",
      "ref:klass",
      "ref:unscoped",
      "new:Preloader",
      "ref:loaders",
    ]);
  });

  it("tokens a logical operator as if, between its operands", () => {
    const cls = extractFromSource(
      `class Foo {
        create() {
          return this.cached() ?? this.build();
        }
      }`,
    );
    const create = cls.instanceMethods.find((m) => m.name === "create")!;
    expect(create.skeleton).toEqual(["ref:cached", "if", "ref:build"]);
  });

  it("marks a call made in a negated position with the ! prefix", () => {
    // The faithful port of ActiveSupport's `exclude?` (`!include?`); the
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
    expect(check.calls).toEqual([
      "!has",
      "!includes",
      "!loaded",
      ".has",
      ".includes",
      "has",
      "includes",
      "loaded",
    ]);
  });

  it("marks a read off another object with the foreign-read prefix", () => {
    // `details.locale` names a member of `details`, not the same-file method
    // `locale` — the closure must not walk into that one (RFC 0108).
    const cls = extractFromSource(
      `class Foo {
        detailArgsForAny(details: { locale: string; formats: string[] }) {
          return [details.locale, details.formats, this.formats, Registry.defaults];
        }
      }`,
    );
    const m = cls.instanceMethods.find((m) => m.name === "detailArgsForAny")!;
    // `formats` is read off `this` too, so it is the body's own; `defaults` is
    // read off a class reference, which the same file may well declare.
    expect(m.calls).toEqual([".locale", "defaults", "formats", "locale"]);
  });

  it("marks a call INVOKED on another object with the foreign-read prefix", () => {
    // `details.digest(x)` runs a member of `details`, not the same-file method
    // `digest` — the closure must not union that one's call-set (RFC 0108).
    const cls = extractFromSource(
      `class Foo {
        cacheKey(details: { digest(x: string): string }) {
          return details.digest(this.name) + Registry.defaults();
        }
      }`,
    );
    const m = cls.instanceMethods.find((m) => m.name === "cacheKey")!;
    // `defaults` is called on a class reference, whose static of that name may
    // genuinely be a same-file member, so it stays resolvable.
    expect(m.calls).toEqual([".digest", "defaults", "digest", "name"]);
  });

  it("keeps a name resolvable when the same body also calls it on this", () => {
    const cls = extractFromSource(
      `class Foo {
        cacheKey(details: { digest(x: string): string }) {
          return details.digest("a") + this.digest("b");
        }
      }`,
    );
    const m = cls.instanceMethods.find((m) => m.name === "cacheKey")!;
    expect(m.calls).toEqual(["digest"]);
  });

  it("does not mark the identifier an X.call(...) dispatch credits", () => {
    // The `this`-typed mixin convention (CLAUDE.md): `emitJoinPlan` really is a
    // same-file body, so it must stay resolvable by the closure.
    const cls = extractFromSource(
      `class Foo {
        build() { return emitJoinPlan.call(this, 1); }
      }`,
    );
    const m = cls.instanceMethods.find((m) => m.name === "build")!;
    expect(m.calls).toEqual([".call", "call", "emitJoinPlan"]);
  });

  it("does not mark a call the ! does not actually negate", () => {
    // `!a &&` binds the negation to `a`; `!!` is a truthiness cast, not a
    // negation — crediting either would be the same false positive the marker
    // exists to prevent.
    const cls = extractFromSource(
      `class Foo {
        check(a: boolean, xs: string[]) {
          if (!!xs.includes("a")) return true;
          return !a && xs.includes("b");
        }
      }`,
    );
    const check = cls.instanceMethods.find((m) => m.name === "check")!;
    expect(check.calls).toEqual([".includes", "includes"]);
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
    expect(m.calls).toEqual([
      ".apply",
      ".call",
      "apply",
      "call",
      "helper",
      "lockBang",
      "transaction",
    ]);
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
      ".call",
      ".emitJoinPlan",
      "call",
      "emitJoinPlan",
    ]);
  });

  it("records the delegation edge of an accessor-forwarding method", () => {
    // The `PostgreSQLAdapter` → `PostgreSQLSchemaStatements` shape: trails puts
    // the Rails `PostgreSQL::SchemaStatements` port in its own class and reaches
    // it through an accessor, so the port is invisible to includes/extends.
    const cls = extractFromSource(
      `class PostgreSQLSchemaStatements {
         indexes(tableName) { return []; }
         databaseExists(name) { return true; }
       }
       class PostgreSQLAdapter {
         private pgSchemaStatements(): PostgreSQLSchemaStatements { return this.stmts; }
         indexes(tableName) { return this.pgSchemaStatements().indexes(tableName); }
         async databaseExists(name) { return await this.pgSchemaStatements().databaseExists(name); }
       }`,
      "PostgreSQLAdapter",
    );
    const byName = Object.fromEntries(cls.instanceMethods.map((m) => [m.name, m.delegatesTo]));
    expect(byName["indexes"]).toBe("PostgreSQLSchemaStatements");
    expect(byName["databaseExists"]).toBe("PostgreSQLSchemaStatements");
    expect(byName["pgSchemaStatements"]).toBeUndefined();
    expect(cls.delegatesTo).toEqual(["PostgreSQLSchemaStatements"]);
  });

  it("records no delegation edge for a differently-named or in-class forward", () => {
    // Only a SAME-NAMED forward off another object models a moved Rails module;
    // a rename-forward and plain `this.helper()` dispatch are ordinary bodies.
    const cls = extractFromSource(
      `class Helper { indexes(t) { return []; } indexNames(t) { return []; } }
       class Foo {
         private helper(): Helper { return this.h; }
         indexes(t) { return this.helper().indexNames(t); }
         columns(t) { return this.loadColumns(t); }
       }`,
    );
    expect(cls.instanceMethods.every((m) => m.delegatesTo === undefined)).toBe(true);
    expect(cls.delegatesTo).toBeUndefined();
  });

  it("records the delegation edge of a property-accessor forward and a static forward", () => {
    const cls = extractFromSource(
      `class Stmts { indexes(t) { return []; } static reset() {} }
       class Foo {
         private readonly stmts: Stmts;
         indexes(t) { return this.stmts.indexes(t); }
         static reset() { return this.stmts.reset(); }
       }`,
    );
    expect(cls.instanceMethods.find((m) => m.name === "indexes")!.delegatesTo).toBe("Stmts");
    expect(cls.delegatesTo).toEqual(["Stmts"]);
  });

  it("records no delegation edge when the target type lacks the forwarded member", () => {
    // The forward must land on a declaration of the same name; a receiver typed
    // as something that does not declare it names no port to credit.
    const cls = extractFromSource(
      `class Stmts { columns(t) { return []; } }
       class Foo {
         private stmts(): Stmts { return this.s; }
         indexes(t) { return this.stmts().indexes(t); }
       }`,
    );
    expect(cls.instanceMethods.find((m) => m.name === "indexes")!.delegatesTo).toBeUndefined();
  });

  it("records no delegation edge when the accessor's type is unresolved", () => {
    // Resolution is checker-only: an accessor with no resolvable declaring type
    // records nothing rather than falling back to a name- or path-based guess,
    // which would cross-credit sibling adapter implementations.
    const cls = extractFromSource(
      `class Foo {
         indexes(t) { return this.untyped().indexes(t); }
       }`,
    );
    expect(cls.instanceMethods.find((m) => m.name === "indexes")!.delegatesTo).toBeUndefined();
  });

  it("does NOT suppress a same-named delegation whose receiver is unbound", () => {
    // A receiver that resolves to no symbol (only possible for a genuinely unbound
    // identifier — non-compiling code) fails toward tracking: keep the extracted
    // call-set rather than risk a false-positive suppression that drops a real body.
    const cls = extractFromSource(
      `class Foo { buildJoins(arel) { unbound.buildJoins.call(this, arel); } }`,
    );
    expect(cls.instanceMethods.find((m) => m.name === "buildJoins")!.calls).toEqual([
      ".buildJoins",
      ".call",
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

  it("keeps a hoisted closure's calls OUT of the order stream, but in the call set", () => {
    // `ConnectionPool#unpin_connection!` writes the critical section as a Ruby
    // block on `lock.synchronize`, so `checkin` follows `lock`. Ours hoists the
    // same body into a local (the non-locking branch runs it bare), which must
    // not pull `checkin` ahead of the `lock` read — and Ruby itself records a
    // `caller = lambda do … end` at its definition, so the order stream cannot
    // pick either side: it skips the body.
    const cls = extractFromSource(
      `class Foo {
        unpin() {
          const block = () => { this.checkin(); };
          this.connection.lock.synchronize(block);
        }
      }`,
    );
    const unpin = cls.instanceMethods.find((m) => m.name === "unpin")!;
    expect(unpin.callSeq).toEqual(["connection", "lock", "synchronize"]);
    expect(unpin.calls).toEqual([
      ".lock",
      ".synchronize",
      "checkin",
      "connection",
      "lock",
      "synchronize",
    ]);
  });

  it("drops a hoisted closure's name even when the enclosing body calls it too", () => {
    // Deliberate over-drop: the enclosing occurrence is no less ambiguous than
    // the closure's. Ruby's counterpart may be either the lambda-at-definition
    // position or the block-at-call one, so neither TS occurrence can be
    // matched against it. The call SET still records the name.
    const cls = extractFromSource(
      `class Foo {
        touchCallbacks() {
          const cb = () => { this.touchRecord(); };
          this.afterCreate(cb);
          this.afterUpdate(() => { this.touchRecord(); });
        }
      }`,
    );
    const m = cls.instanceMethods.find((x) => x.name === "touchCallbacks")!;
    expect(m.callSeq).toEqual(["afterCreate", "afterUpdate"]);
    expect(m.calls).toEqual(["afterCreate", "afterUpdate", "touchRecord"]);
  });

  it("keeps an INLINE function argument in the order stream", () => {
    // Only a local binding is ambiguous; a function passed as an argument is
    // the port's spelling of a Ruby block and stays deferred-but-recorded.
    const cls = extractFromSource(
      `class Foo {
        unpin() {
          this.connection.lock.synchronize(() => { this.checkin(); });
        }
      }`,
    );
    expect(cls.instanceMethods.find((m) => m.name === "unpin")!.callSeq).toEqual([
      "connection",
      "lock",
      "synchronize",
      "checkin",
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
    expect(m.calls).toEqual([".concat", "concat", "joinsValues", "leftOuterJoinsValues"]);
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
    expect(m.calls).toEqual([".dup", "dup"]);
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
    expect(m.calls).toEqual([".build", ".pop", "build", "pop"]);
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
    expect(m.calls).toEqual([".call", "call", "timestampTouch", "touch"]);
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

describe("extractClass — constructor parameter properties", () => {
  it("records a parameter property as a member of the class", () => {
    const info = extractFromSource(`
      export class Foo {
        constructor(
          readonly tableName: string,
          public expression: string,
          options: object,
        ) {}
      }
    `);
    const names = info.instanceMethods.map((m) => m.name);
    expect(names).toContain("tableName");
    expect(names).toContain("expression");
    expect(names).not.toContain("options");
    const tableName = info.instanceMethods.find((m) => m.name === "tableName")!;
    expect(tableName.visibility).toBe("public");
    expect(tableName.params).toEqual([]);
    expect(tableName.internal).toBeUndefined();
  });

  it("tags a `private` / `protected` parameter property with its visibility", () => {
    const info = extractFromSource(`
      export class Foo {
        constructor(
          private conn: object,
          protected owner: object,
        ) {}
      }
    `);
    const conn = info.instanceMethods.find((m) => m.name === "conn")!;
    expect(conn.visibility).toBe("private");
    expect(conn.internal).toBe(true);
    const owner = info.instanceMethods.find((m) => m.name === "owner")!;
    expect(owner.visibility).toBe("protected");
    expect(owner.internal).toBe(true);
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

  it("does not record a SCREAMING_SNAKE method-table constant as a module", () => {
    // `ActiveSupport::Deprecation::DEFAULT_BEHAVIORS`
    // (deprecation/behaviors.rb:13-63) is a Ruby Hash, not a module. Counting
    // its `raise:` key as a ported member makes `isPortedWithArgs("raise")`
    // true package-wide and reds every Rails `raise` in the package.
    const info = extractFromFiles("/p", {
      "deprecation.ts": `
        export const DEFAULT_BEHAVIORS = {
          raise: (message: string, callstack: unknown[]) => {},
          silence: () => {},
        };
      `,
    });
    expect(info.modules["deprecation.ts:DEFAULT_BEHAVIORS"]).toBeUndefined();
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

  it("records the mod's declaration file on host.extendsFiles", () => {
    // Two modules share the short name `SchemaStatements` (abstract/ and
    // postgresql/); only the declaration file separates them, so the edge
    // carries it for the consumer that resolves the parent.
    const info = extractFromFiles("/p", {
      "abstract/schema-statements.ts": `export const SchemaStatements = { addColumn() {} };`,
      "postgresql/schema-statements-class.ts": `export const SchemaStatements = { quoteSchemaName() {} };`,
      "postgresql-adapter.ts": `export class PostgreSQLAdapter {}`,
      "wire.ts": `
        import { include } from "@blazetrails/activesupport";
        import { PostgreSQLAdapter } from "./postgresql-adapter.js";
        import { SchemaStatements } from "./postgresql/schema-statements-class.js";
        include(PostgreSQLAdapter, SchemaStatements);
      `,
    });
    const host = info.classes["postgresql-adapter.ts:PostgreSQLAdapter"];
    expect(host.extends).toContain("SchemaStatements");
    expect(host.extendsFiles?.["SchemaStatements"]).toBe("postgresql/schema-statements-class.ts");
  });

  it("records the superclass's declaration file on superclassFile", () => {
    // Same collision as extendsFiles, on the `extends` heritage clause: two
    // classes named `SchemaStatements`, and the subclass's own path is no help
    // in telling them apart.
    const info = extractFromFiles("/p", {
      "abstract/schema-statements.ts": `export class SchemaStatements { addColumn(): void {} }`,
      "sqlite3/schema-statements.ts": `export class SchemaStatements { renameColumn(): void {} }`,
      "sqlite3/adapter.ts": `
        import { SchemaStatements } from "./schema-statements.js";
        export class SQLite3Adapter extends SchemaStatements {}
      `,
    });
    const cls = info.classes["sqlite3/adapter.ts:SQLite3Adapter"];
    expect(cls.superclass).toBe("SchemaStatements");
    expect(cls.superclassFile).toBe("sqlite3/schema-statements.ts");
  });

  it("records extendsFiles for an interface's extends clause", () => {
    const info = extractFromFiles("/p", {
      "abstract/quoting.ts": `export interface Quoting { quoteColumnName(n: string): string }`,
      "sqlite3/quoting.ts": `export interface Quoting { quotedBinary(v: string): string }`,
      "sqlite3/adapter.ts": `
        import type { Quoting } from "./quoting.js";
        export interface SQLite3Adapter extends Quoting {}
      `,
    });
    const iface = info.modules["sqlite3/adapter.ts:SQLite3Adapter"];
    expect(iface.extends).toContain("Quoting");
    expect(iface.extendsFiles?.["Quoting"]).toBe("sqlite3/quoting.ts");
  });

  it("omits superclassFile when the extends clause has no resolvable declaration", () => {
    // A mixin-factory call (`extends Mixin(Base)`) has no symbol to locate, and
    // a superclass imported from another package declares outside `srcDir`.
    // Both fall back to the proximity heuristic rather than recording a file.
    const info = extractFromFiles("/p", {
      "mixin.ts": `export function Mixin(b: any): any { return b; }`,
      "base.ts": `export class Base {}`,
      "derived.ts": `
        import { Mixin } from "./mixin.js";
        import { Base } from "./base.js";
        export class Derived extends Mixin(Base) {}
      `,
      "external.ts": `
        import { Model } from "@blazetrails/activemodel";
        export class Record extends Model {}
      `,
    });
    expect(info.classes["derived.ts:Derived"].superclassFile).toBeUndefined();
    expect(info.classes["external.ts:Record"].superclassFile).toBeUndefined();
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
    const fns = fileFunctionsOf(info, "quoting.ts");
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
    expect(fileFunctionsOf(info, "key-normalization.ts").every((f) => f.internal)).toBe(true);
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
    const fns = fileFunctionsOf(info, "finder-methods.ts");
    expect(fns.find((f) => f.name === "performSecondBang")!.internal).toBe(true);
    expect(fns.find((f) => f.name === "secondBang")!.internal).toBeUndefined();
  });
});

describe("extractFromProgram — @internal JSDoc on class members", () => {
  it("tags an @internal-tagged public method and leaves its untagged sibling public", () => {
    const info = extractFromFiles("/p", {
      "abstract-adapter.ts": `
        export class AbstractAdapter {
          /** @internal */
          columnMethodNames(): string[] { return []; }

          /** @internal */
          static seamHook(): void {}

          quoteTableName(name: string): string { return name; }
        }
      `,
    });
    const cls = info.classes["abstract-adapter.ts:AbstractAdapter"];
    expect(cls.instanceMethods.find((m) => m.name === "columnMethodNames")!.internal).toBe(true);
    expect(cls.classMethods.find((m) => m.name === "seamHook")!.internal).toBe(true);
    expect(cls.instanceMethods.find((m) => m.name === "quoteTableName")!.internal).toBeUndefined();
  });

  it("tags an @internal-tagged member of a synthesized __mixin class", () => {
    const info = extractFromFiles("/p", {
      "attributes.ts": `
        export function Attributes(Base: new () => object) {
          class M extends Base {
            /** @internal */
            loadAttributes(): void {}
            readAttribute(): void {}
          }
          return M;
        }
      `,
    });
    const mixin = info.modules["attributes.ts:Attributes__mixin"];
    expect(mixin.instanceMethods.find((m) => m.name === "loadAttributes")!.internal).toBe(true);
    expect(mixin.instanceMethods.find((m) => m.name === "readAttribute")!.internal).toBeUndefined();
  });

  it("tags an @internal-tagged constructor of a synthesized __mixin class", () => {
    const info = extractFromFiles("/p", {
      "attributes.ts": `
        export function Attributes(Base: new (...a: any[]) => object) {
          class M extends Base {
            /** @internal */
            constructor(...a: any[]) { super(...a); }
          }
          return M;
        }
      `,
    });
    const ctor = info.modules["attributes.ts:Attributes__mixin"].instanceMethods.find(
      (m) => m.name === "constructor",
    )!;
    expect(ctor.internal).toBe(true);
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

function classOf(info: PackageInfo, name: string): ClassInfo {
  return Object.values(info.classes).find((c) => c.name === name)!;
}

describe("extractFromProgram — file-level @noRailsEquivalent JSDoc", () => {
  it("records a reason written above the imports against the file", () => {
    const info = extractFromFiles("/p", {
      "libsql-adapter.ts": `
        /**
         * SQLite adapter backed by the \`libsql\` client.
         *
         * @noRailsEquivalent PERMANENT — Ruby binds exactly one SQLite driver,
         * so Rails has no class to map a per-driver subclass onto.
         */
        import { SQLite3Adapter } from "./sqlite3-adapter.js";

        export class LibSQLAdapter extends SQLite3Adapter {}
      `,
      "sqlite3-adapter.ts": `export class SQLite3Adapter {}`,
    });
    expect(info.fileNoRailsEquivalent).toEqual({
      "libsql-adapter.ts":
        "PERMANENT — Ruby binds exactly one SQLite driver, so Rails has no class to " +
        "map a per-driver subclass onto.",
    });
  });

  it("leaves the leading block of an import-less file as its declaration's tag", () => {
    const info = extractFromFiles("/p", {
      "connection-pool.ts": `
        /** @noRailsEquivalent PERMANENT — Rails nests this class inside NullPool */
        export class NullConfig {}
      `,
    });
    expect(info.fileNoRailsEquivalent).toEqual({});
    expect(classOf(info, "NullConfig").noRailsEquivalent).toBe(
      "PERMANENT — Rails nests this class inside NullPool",
    );
  });

  it("rejects a file-level reason truncated by a bare @word in its prose", () => {
    expect(() =>
      extractFromFiles("/p", {
        "libsql-adapter.ts": `
          /**
           * @noRailsEquivalent PERMANENT — trails binds each client in its own
           * subclass, the way @deprecated APIs are kept apart.
           */
          import { SQLite3Adapter } from "./sqlite3-adapter.js";

          export class LibSQLAdapter extends SQLite3Adapter {}
        `,
        "sqlite3-adapter.ts": `export class SQLite3Adapter {}`,
      }),
    ).toThrow(/truncated by a bare `@deprecated`/);
  });

  it("ignores a tag written below the imports", () => {
    const info = extractFromFiles("/p", {
      "libsql-adapter.ts": `
        import { SQLite3Adapter } from "./sqlite3-adapter.js";

        /** @noRailsEquivalent PERMANENT — bound to the class, not to the file */
        export class LibSQLAdapter extends SQLite3Adapter {}
      `,
      "sqlite3-adapter.ts": `export class SQLite3Adapter {}`,
    });
    expect(info.fileNoRailsEquivalent).toEqual({});
    expect(classOf(info, "LibSQLAdapter").noRailsEquivalent).toBe(
      "PERMANENT — bound to the class, not to the file",
    );
  });
});

describe("mid-line tag mentions in reason prose", () => {
  it("mints no @noRailsEquivalent from a mention inside a @missingRailsCall reason", () => {
    const info = extractFromSource(`
      class Foo {
        /**
         * @missingRailsCall has_attribute? — PERMANENT: trails generates the readers at the
         *   end of every schema load (tagged @noRailsEquivalent against CLAUDE.md's
         *   "Generated attribute readers are properties").
         */
        aliasAttributeMethodDefinition(): void {}
      }
    `);
    const method = info.instanceMethods.find((m) => m.name === "aliasAttributeMethodDefinition")!;
    expect(method.noRailsEquivalent).toBeUndefined();
  });

  it("mints no @internal from a mention inside a @missingRailsCall reason", () => {
    const info = extractFromSource(`
      class Foo {
        /**
         * @missingRailsCall attribute_types — PERMANENT: the seam this replaces is
         *   the wiring one, which is why it carries @internal rather than a name.
         */
        registerModel(): void {}
      }
    `);
    const method = info.instanceMethods.find((m) => m.name === "registerModel")!;
    expect(method.internal).toBeUndefined();
  });

  it("mints no @missingRailsArgs from a mention inside a @missingRailsCall reason", () => {
    const info = extractFromSource(`
      class Foo {
        /**
         * @missingRailsCall type_for_attribute — PERMANENT: the shape differs, but a
         *   tag of the @missingRailsArgs family would be the wrong one here.
         */
        typeForAttribute(): void {}
      }
    `);
    const method = info.instanceMethods.find((m) => m.name === "typeForAttribute")!;
    expect(method.missingRailsArgs).toBeUndefined();
  });
});

describe("extractFromProgram — @noRailsEquivalent JSDoc", () => {
  it("records the reason on a tagged class member and leaves its sibling bare", () => {
    const info = extractFromSource(`
      class Foo {
        /**
         * Registry hook — public by design; an internal tag would be a lie.
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
    const fns = fileFunctionsOf(info, "associations.ts");
    expect(fns.find((f) => f.name === "registerModel")!.noRailsEquivalent).toBe(
      "public registration surface, no Rails counterpart",
    );
    expect(fns.find((f) => f.name === "hasMany")!.noRailsEquivalent).toBeUndefined();
  });

  it("records the reason on a tagged object-literal module", () => {
    const info = extractFromFiles("/p", {
      "quoting.ts": `
        /** @noRailsEquivalent PERMANENT adapter-free quoting crutch */
        export const AbstractSchemaQuoter = {
          quoteColumnName(name: string): string { return name; },
        };

        export const OtherQuoter = {
          quoteColumnName(name: string): string { return name; },
        };
      `,
    });
    expect(info.modules["quoting.ts:AbstractSchemaQuoter"].noRailsEquivalent).toBe(
      "PERMANENT adapter-free quoting crutch",
    );
    expect(info.modules["quoting.ts:OtherQuoter"].noRailsEquivalent).toBeUndefined();
  });

  it("drops the reason on a renamed export of a tagged declaration", () => {
    const info = extractFromFiles("/p", {
      "routes-helpers.ts": `
        /** @noRailsEquivalent \`with\` is an ES strict-mode reserved word */
        export function withRoutesHelpers(): void {}

        export { withRoutesHelpers as with };
      `,
    });
    const fns = fileFunctionsOf(info, "routes-helpers.ts");
    expect(fns.find((f) => f.name === "withRoutesHelpers")!.noRailsEquivalent).toBe(
      "`with` is an ES strict-mode reserved word",
    );
    expect(fns.find((f) => f.name === "with")!.noRailsEquivalent).toBeUndefined();
  });

  it("counts a named re-export as the re-exporting file's own surface", () => {
    const info = extractFromFiles("/p", {
      "transliterate.ts": `
        export function parameterize(string: string): string { return string; }
      `,
      "inflector.ts": `
        export { parameterize } from "./transliterate.js";
      `,
    });
    expect(fileFunctionsOf(info, "transliterate.ts").map((f) => f.name)).toContain("parameterize");
    expect(fileFunctionsOf(info, "inflector.ts").map((f) => f.name)).toContain("parameterize");
  });

  it("does not count an `export *` barrel's members as the barrel's surface", () => {
    const info = extractFromFiles("/p", {
      "transliterate.ts": `
        export function parameterize(string: string): string { return string; }
      `,
      "index.ts": `
        export * from "./transliterate.js";
      `,
    });
    expect((info.fileFunctions?.["index.ts"] ?? []).map((f) => f.name)).not.toContain(
      "parameterize",
    );
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
    const fns = fileFunctionsOf(info, "registry.ts");
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

  it("records the reason on a synthesized __mixin constructor", () => {
    const info = extractFromFiles("/p", {
      "attributes.ts": `
        export function Attributes(Base: new () => object) {
          class M extends Base {
            /** @noRailsEquivalent JS constructors take no Ruby-style block */
            constructor() { super(); }
          }
          return M;
        }
      `,
    });
    const ctor = info.modules["attributes.ts:Attributes__mixin"].instanceMethods.find(
      (m) => m.name === "constructor",
    )!;
    expect(ctor.noRailsEquivalent).toBe("JS constructors take no Ruby-style block");
    expect(ctor.line).toBe(5);
    expect(ctor.declaredIn).toBeUndefined();
  });

  it("leaves a synthesized __mixin constructor bare when the inner class declares none", () => {
    const info = extractFromFiles("/p", {
      "base.ts": `
        export class Base {
          /** @noRailsEquivalent JS-only wiring */
          constructor() {}
        }
      `,
      "attributes.ts": `
        import { Base } from "./base.js";
        export function Attributes(B: typeof Base) {
          class M extends B {}
          return M;
        }
      `,
    });
    const ctor = info.modules["attributes.ts:Attributes__mixin"].instanceMethods.find(
      (m) => m.name === "constructor",
    )!;
    expect(ctor.noRailsEquivalent).toBeUndefined();
    expect(ctor.internal).toBeUndefined();
    expect(ctor.declaredIn).toBe("base.ts");
    expect(ctor.line).toBe(4);
  });

  it("inherits a foreign base constructor's visibility onto the synthesized __mixin entry", () => {
    const info = extractFromFiles("/p", {
      "base.ts": `
        export class Base {
          readonly tag = "base";

          protected constructor() {}
        }
      `,
      "attributes.ts": `
        import { Base } from "./base.js";
        export function Attributes(B: typeof Base) {
          class M extends B {}
          return M;
        }
      `,
    });
    const ctor = info.modules["attributes.ts:Attributes__mixin"].instanceMethods.find(
      (m) => m.name === "constructor",
    )!;
    expect(ctor.visibility).toBe("protected");
    expect(ctor.internal).toBe(true);
    expect(ctor.declaredIn).toBe("base.ts");
    // Line 5 of base.ts, not line 3 — the factory's line in attributes.ts.
    expect(ctor.line).toBe(5);
  });

  it("extracts parameters onto a synthesized __mixin member", () => {
    const info = extractFromFiles("/p", {
      "attributes.ts": `
        export function Attributes(Base: new () => object) {
          class M extends Base {
            writeAttribute(name: string, value?: unknown): void {}
            get attributes(): object { return {}; }
          }
          return M;
        }
      `,
    });
    const mixin = info.modules["attributes.ts:Attributes__mixin"];
    expect(mixin.instanceMethods.find((m) => m.name === "writeAttribute")!.params).toEqual([
      { name: "name", kind: "required", type: "string" },
      { name: "value", kind: "optional", type: "unknown" },
    ]);
    expect(mixin.instanceMethods.find((m) => m.name === "attributes")!.params).toEqual([]);
  });

  it("records a protected member the factory's return type hides", () => {
    const info = extractFromFiles("/p", {
      "fallbacks.ts": `
        interface Methods { translate(locale: string): unknown; }
        export function Fallbacks(Base: new () => object): (new () => Methods) {
          class F extends Base {
            translate(locale: string): unknown { return locale; }
            protected onFallback(locale: string): void {}
          }
          return F as never;
        }
      `,
    });
    const mixin = info.modules["fallbacks.ts:Fallbacks__mixin"];
    const onFallback = mixin.instanceMethods.find((m) => m.name === "onFallback")!;
    expect(onFallback.visibility).toBe("protected");
    expect(onFallback.file).toBe("fallbacks.ts");
    expect(mixin.instanceMethods.find((m) => m.name === "translate")!.declaredIn).toBeUndefined();
  });

  it("extracts parameters onto a foreign synthesized __mixin member", () => {
    const info = extractFromFiles("/p", {
      "base.ts": `
        export class Base {
          dispose(reason: string): void {}
        }
      `,
      "attributes.ts": `
        import { Base } from "./base.js";
        export function Attributes(B: typeof Base) {
          class M extends B {}
          return M;
        }
      `,
    });
    const dispose = info.modules["attributes.ts:Attributes__mixin"].instanceMethods.find(
      (m) => m.name === "dispose",
    )!;
    expect(dispose.declaredIn).toBe("base.ts");
    expect(dispose.params).toEqual([{ name: "reason", kind: "required", type: "string" }]);
  });

  it("extracts option keys onto a synthesized __mixin member", () => {
    const info = extractFromFiles("/p", {
      "attributes.ts": `
        export function Attributes(Base: new () => object) {
          class M extends Base {
            reload(options: { lock?: boolean; readonly?: boolean }): void {}
          }
          return M;
        }
      `,
    });
    expect(
      info.modules["attributes.ts:Attributes__mixin"].instanceMethods.find(
        (m) => m.name === "reload",
      )!.optionKeys,
    ).toEqual(["lock", "readonly"]);
  });

  it("extracts parameters onto a synthesized __mixin constructor", () => {
    const info = extractFromFiles("/p", {
      "attributes.ts": `
        export function Attributes(Base: new () => object) {
          class M extends Base {
            constructor(attrs: object, options: { strict?: boolean } = {}) { super(); }
          }
          return M;
        }
      `,
    });
    const ctor = info.modules["attributes.ts:Attributes__mixin"].instanceMethods.find(
      (m) => m.name === "constructor",
    )!;
    expect(ctor.params.map((p) => [p.name, p.kind])).toEqual([
      ["attrs", "required"],
      ["options", "optional"],
    ]);
    expect(ctor.optionKeys).toEqual(["strict"]);
  });

  it("leaves a synthesized __mixin constructor's params empty when the inner class declares none", () => {
    const info = extractFromFiles("/p", {
      "attributes.ts": `
        export function Attributes(Base: new () => object) {
          class M extends Base {}
          return M;
        }
      `,
    });
    const ctor = info.modules["attributes.ts:Attributes__mixin"].instanceMethods.find(
      (m) => m.name === "constructor",
    )!;
    expect(ctor.params).toEqual([]);
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

  it("records interface property signatures alongside method signatures", () => {
    const info = extractFromFiles("/p", {
      "locator.ts": `
        type Resolver = (id: unknown, scope: string) => unknown;

        export interface LocatorModel {
          name: string;
          primaryKey?: string | string[];
          locate: (id: unknown) => Promise<unknown>;
          resolve: Resolver;
          /** @noRailsEquivalent trails-only finder seam */
          findGlobalId: (id: string) => Promise<unknown>;
          find(id: unknown): Promise<unknown>;
        }
      `,
    });
    const iface = info.modules["locator.ts:LocatorModel"];
    expect(iface.instanceMethods.map((m) => m.name).sort()).toEqual([
      "find",
      "findGlobalId",
      "locate",
      "name",
      "primaryKey",
      "resolve",
    ]);
    expect(iface.instanceMethods.find((m) => m.name === "locate")!.params).toHaveLength(1);
    expect(iface.instanceMethods.find((m) => m.name === "resolve")!.params).toHaveLength(2);
    expect(iface.instanceMethods.find((m) => m.name === "name")!.params).toEqual([]);
    expect(iface.instanceMethods.find((m) => m.name === "findGlobalId")!.noRailsEquivalent).toBe(
      "trails-only finder seam",
    );
    expect(iface.interfaceMembers).toContain("name");
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

  it("records the reason on a tagged class declaration", () => {
    const info = extractFromFiles("/p", {
      "connection-pool.ts": `
        /** @noRailsEquivalent Rails nests this class inside NullPool; TS cannot */
        export class NullConfig {}

        export class NullPool {}
      `,
    });
    expect(info.classes["connection-pool.ts:NullConfig"].noRailsEquivalent).toBe(
      "Rails nests this class inside NullPool; TS cannot",
    );
    expect(info.classes["connection-pool.ts:NullPool"].noRailsEquivalent).toBeUndefined();
  });

  it("records the reason on a tagged interface and namespace declaration", () => {
    const info = extractFromFiles("/p", {
      "seams.ts": `
        /** @noRailsEquivalent structural seam, no Rails counterpart */
        export interface Quoting {}

        /** @noRailsEquivalent trails-only locator namespace */
        export namespace Locator {}

        export interface Plain {}
      `,
    });
    expect(info.modules["seams.ts:Quoting"].noRailsEquivalent).toBe(
      "structural seam, no Rails counterpart",
    );
    expect(info.modules["seams.ts:Locator"].noRailsEquivalent).toBe(
      "trails-only locator namespace",
    );
    expect(info.modules["seams.ts:Plain"].noRailsEquivalent).toBeUndefined();
    // extra-surface.ts spreads a declaration tag onto members for interfaces
    // only, so the kind has to survive into the manifest.
    expect(info.modules["seams.ts:Quoting"].isInterface).toBe(true);
    expect(info.modules["seams.ts:Locator"].isInterface).toBeUndefined();
  });

  it("keeps a declaration-merged interface's tag when the untagged half is walked first", () => {
    const info = extractFromFiles("/p", {
      "seams.ts": `
        export interface Quoting {
          quote(value: unknown): string;
        }

        /** @noRailsEquivalent structural seam, no Rails counterpart */
        export interface Quoting {
          quoteAsync(value: unknown): Promise<string>;
        }
      `,
    });
    expect(info.modules["seams.ts:Quoting"].noRailsEquivalent).toBe(
      "structural seam, no Rails counterpart",
    );
  });

  it("throws when a class declaration's tag carries no reason", () => {
    expect(() =>
      extractFromFiles("/p", {
        "connection-pool.ts": `
          /** @noRailsEquivalent */
          export class NullConfig {}
        `,
      }),
    ).toThrow(/@noRailsEquivalent needs a reason/);
  });

  it("throws when an interface declaration's tag carries no reason", () => {
    expect(() =>
      extractFromFiles("/p", {
        "seams.ts": `
          /** @noRailsEquivalent */
          export interface Quoting {}
        `,
      }),
    ).toThrow(/@noRailsEquivalent needs a reason/);
  });

  it("throws when a namespace declaration's tag carries no reason", () => {
    expect(() =>
      extractFromFiles("/p", {
        "seams.ts": `
          /** @noRailsEquivalent */
          export namespace Locator {}
        `,
      }),
    ).toThrow(/@noRailsEquivalent needs a reason/);
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

  it("throws when a prose tag name wraps onto the start of a continuation line", () => {
    expect(() =>
      extractFromSource(`
        class Foo {
          /**
           * @noRailsEquivalent wiring seam; the method is real Rails-facing
           * @internal is the wrong tool here because callers depend on it.
           */
          initializeAssociations(): void {}
        }
      `),
    ).toThrow(/truncated by a bare `@internal`.*move it above `@noRailsEquivalent`/s);
  });

  it("reports the offending interface member instead of crashing on the tag order", () => {
    expect(() =>
      extractFromFiles("/p", {
        "seams.ts": `
          export interface Quoting {
            /**
             * @noRailsEquivalent wiring seam; the member is real Rails-facing
             * @internal is the wrong tool here because callers depend on it.
             */
            quoteBound(): string;
          }
        `,
      }),
    ).toThrow(/truncated by a bare `@internal`.*seams\.ts/s);
  });

  it("initializes TAGS_ALLOWED_AFTER_NO_RAILS_EQUIVALENT before the worker dispatch", () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, "extract-ts-api.ts"), "utf8");
    const constAt = src.indexOf("const TAGS_ALLOWED_AFTER_NO_RAILS_EQUIVALENT");
    const dispatchAt = src.indexOf("if (!isMainThread && parentPort)");
    expect(constAt).toBeGreaterThan(-1);
    expect(dispatchAt).toBeGreaterThan(-1);
    expect(constAt).toBeLessThan(dispatchAt);
  });

  it("accepts a deliberate @internal placed above @noRailsEquivalent", () => {
    const foo = extractFromSource(`
      class Foo {
        /**
         * @internal
         *
         * @noRailsEquivalent test-harness ledger with no Rails counterpart
         */
        recordTouchedTables(): void {}
      }
    `);
    expect(
      foo.instanceMethods.find((m) => m.name === "recordTouchedTables")!.noRailsEquivalent,
    ).toBe("test-harness ledger with no Rails counterpart");
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
    expect(walkTsFilesSync(srcDir, COMPARED_TS_FILES)).toContain(path.join(subDir, "helper.ts"));
    expect(walkTsFilesSync(srcDir, COMPARED_TS_FILES, [subDir])).toEqual([
      path.join(srcDir, "parent.ts"),
    ]);
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

/**
 * Every `MethodInfo` emit site in the extractor, pinned in one fixture.
 *
 * Adding a per-method declaration-derived field means visiting every site that
 * must copy it, and there is no mechanical way to enumerate those sites from
 * the source — PR #5358 found them one review round at a time and guessed
 * wrong twice. This fixture tags EVERY declaration the extractor can reach, so
 * a new field with a missed site fails here instead of in review. The rule it
 * encodes lives in the extract-ts-api.ts module comment.
 */
const EMIT_SITE_FIXTURE: Record<string, string> = {
  "mixin-base.ts": `
    export class MixinBase {
      /** @noRailsEquivalent mixin foreign member */
      foreign(): void {}
    }
  `,
  "iface-base.ts": `
    export interface IfaceBase {
      /** @noRailsEquivalent interface extends-resolved member */
      inherited(): void;
    }
  `,
  "emit-sites.ts": `
    import { MixinBase } from "./mixin-base.js";
    import type { IfaceBase } from "./iface-base.js";

    export class Widget {
      /** @noRailsEquivalent class constructor */
      constructor() {}

      /** @noRailsEquivalent class method */
      render(): void {}

      /** @noRailsEquivalent class getter */
      get sizeRead(): number { return 1; }

      /** @noRailsEquivalent class setter */
      set sizeWrite(value: number) {}

      /** @noRailsEquivalent class property */
      label: string = "";

      /** @noRailsEquivalent class static method */
      static build(): void {}
    }

    /** @noRailsEquivalent top-level exported function */
    export function topLevel(): void {}

    /** @noRailsEquivalent export-list alias target */
    export function renameSource(): void {}
    export { renameSource as renamedExport };

    /** @noRailsEquivalent export-list alias own reason */
    export { renameSource as taggedAlias };

    /** @noRailsEquivalent object-literal shorthand target */
    function shorthandRef(): void {}

    function aliasTarget(): void {}

    const NS = {
      /** @noRailsEquivalent object-literal alias target */
      target: aliasTarget,
    };

    export const Registry = {
      /** @noRailsEquivalent object-literal inline method */
      inline(): void {},
      shorthandRef,
      aliasRef: NS.target,
    };

    export namespace Locator {
      /** @noRailsEquivalent namespace function */
      export function findIt(): void {}

      /** @noRailsEquivalent namespace const */
      export const findConst = (): void => {};
    }

    export interface Quoting extends IfaceBase {
      /** @noRailsEquivalent interface method signature */
      quoteAsync(value: unknown): Promise<string>;
    }

    export function Attributes(Base: typeof MixinBase) {
      class M extends Base {
        /** @noRailsEquivalent mixin constructor */
        constructor(...args: any[]) { super(...args); }

        /** @noRailsEquivalent mixin own member */
        ownMember(): void {}
      }
      return M;
    }
  `,
};

interface EmitEntry {
  /** Container key, or `<fileFunctions>` for the per-file function list. */
  container: string;
  name: string;
  /** Does `collectTsFileNames` count this entry as the file's own surface? */
  counted: boolean;
  /** Did the declaration's `@noRailsEquivalent` tag reach this entry? */
  hasReason: boolean;
}

/**
 * Flatten every entry the extractor emitted for `file`, tagging each with the
 * counted-ness that decides whether it must carry declaration-derived
 * metadata. `collectTsFileNames` only exposes a per-file name Set, so the
 * filter is restated here for per-entry granularity; the drift that invites is
 * caught by the cross-check test below.
 */
function emitInventory(info: PackageInfo, file: string): EmitEntry[] {
  const out: EmitEntry[] = [];
  const push = (container: string, m: MethodInfo, skipForeign: boolean): void => {
    const counted =
      m.internal !== true &&
      !m.name.startsWith("_") &&
      !(skipForeign && m.declaredIn !== undefined);
    out.push({ container, name: m.name, counted, hasReason: m.noRailsEquivalent !== undefined });
  };
  for (const [key, c] of Object.entries({ ...info.classes, ...info.modules })) {
    if (c.file !== file) continue;
    const skipForeign = c.synthesizedMixin === true;
    for (const m of c.instanceMethods) push(key, m, skipForeign);
    for (const m of c.classMethods) push(key, m, skipForeign);
  }
  for (const m of info.fileFunctions?.[file] ?? []) push("<fileFunctions>", m, false);
  // Code-unit ordering, not localeCompare: the hand-written table below must
  // not shift with the host's collation.
  return out.sort((a, b) => {
    const ka = `${a.container}#${a.name}`;
    const kb = `${b.container}#${b.name}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/**
 * The pinned inventory. Every entry has a tagged declaration behind it and so
 * expects `hasReason: true`, except three:
 *
 * - `<fileFunctions>#Attributes` — the mixin factory, left untagged so an
 *   untagged counted site is represented too.
 * - `<fileFunctions>#aliasTarget` / `#shorthandRef` — `extractFileLocalHelpers`
 *   output, always `internal: true`, so uncounted and never metadata-bearing.
 * - `<fileFunctions>#renamedExport` — an untagged `export { x as y }` alias
 *   drops the declaration's reason: the reason justifies the declared
 *   spelling, not the alias. `#taggedAlias` is the tagged form.
 */
const EMIT_SITE_INVENTORY: EmitEntry[] = [
  { container: "<fileFunctions>", name: "Attributes", counted: true, hasReason: false },
  { container: "<fileFunctions>", name: "aliasTarget", counted: false, hasReason: false },
  { container: "<fileFunctions>", name: "renameSource", counted: true, hasReason: true },
  { container: "<fileFunctions>", name: "renamedExport", counted: true, hasReason: false },
  { container: "<fileFunctions>", name: "shorthandRef", counted: false, hasReason: false },
  { container: "<fileFunctions>", name: "taggedAlias", counted: true, hasReason: true },
  { container: "<fileFunctions>", name: "topLevel", counted: true, hasReason: true },
  {
    container: "emit-sites.ts:Attributes__mixin",
    name: "constructor",
    counted: true,
    hasReason: true,
  },
  {
    container: "emit-sites.ts:Attributes__mixin",
    name: "foreign",
    counted: false,
    hasReason: false,
  },
  {
    container: "emit-sites.ts:Attributes__mixin",
    name: "ownMember",
    counted: true,
    hasReason: true,
  },
  { container: "emit-sites.ts:Locator", name: "findConst", counted: true, hasReason: true },
  { container: "emit-sites.ts:Locator", name: "findIt", counted: true, hasReason: true },
  { container: "emit-sites.ts:Quoting", name: "inherited", counted: true, hasReason: true },
  { container: "emit-sites.ts:Quoting", name: "quoteAsync", counted: true, hasReason: true },
  { container: "emit-sites.ts:Registry", name: "aliasRef", counted: true, hasReason: true },
  { container: "emit-sites.ts:Registry", name: "inline", counted: true, hasReason: true },
  { container: "emit-sites.ts:Registry", name: "shorthandRef", counted: true, hasReason: true },
  { container: "emit-sites.ts:Widget", name: "build", counted: true, hasReason: true },
  { container: "emit-sites.ts:Widget", name: "constructor", counted: true, hasReason: true },
  { container: "emit-sites.ts:Widget", name: "label", counted: true, hasReason: true },
  { container: "emit-sites.ts:Widget", name: "render", counted: true, hasReason: true },
  { container: "emit-sites.ts:Widget", name: "sizeRead", counted: true, hasReason: true },
  { container: "emit-sites.ts:Widget", name: "sizeWrite", counted: true, hasReason: true },
];

describe("extract-ts-api — MethodInfo emit-site inventory", () => {
  it("pins every emit site and whether declaration-derived metadata reaches it", () => {
    const info = extractFromFiles("/p", EMIT_SITE_FIXTURE);
    // Exact match, not a superset: a NEW emit site shows up as an unexpected
    // entry, and a field that misses an existing site flips `hasReason`.
    expect(emitInventory(info, "emit-sites.ts")).toEqual(EMIT_SITE_INVENTORY);
  });

  it("agrees with collectTsFileNames about which entries the file owns", () => {
    const info = extractFromFiles("/p", EMIT_SITE_FIXTURE);
    const file = "emit-sites.ts";
    const counted = new Set(
      emitInventory(info, file)
        .filter((e) => e.counted)
        .map((e) => e.name),
    );
    // The inventory covers MethodInfo emit sites only, so the extra-surface
    // set is exactly it plus the file's declaration names (the `__mixin`
    // pseudo-module's synthesized name is not one).
    const names = collectTsFileNames(
      file,
      Object.values(info.classes),
      Object.values(info.modules),
      info.fileFunctions?.[file],
    );
    expect(new Set([...names].filter((n) => !counted.has(n)))).toEqual(
      new Set(["Locator", "Quoting", "Registry", "Widget"]),
    );
    expect([...counted].filter((n) => !names.has(n))).toEqual([]);
  });
});

describe("extractFromProgram — interface merged with a namespace of the same name", () => {
  const IFACE = `
    /** @noRailsEquivalent duck-typed collaborator shape */
    export interface Locator {
      locate(gid: unknown): unknown;
    }
  `;
  const NAMESPACE = `
    export namespace Locator {
      export function use(name: string): void {}
    }
  `;

  const entry = (source: string): ClassInfo => {
    const info = extractFromFiles("/p", { "locator.ts": source });
    return info.modules["locator.ts:Locator"];
  };

  it("keeps the interface's metadata when the namespace is declared last", () => {
    const merged = entry(`${IFACE}\n${NAMESPACE}`);

    expect(merged.isInterface).toBe(true);
    expect(merged.noRailsEquivalent).toBe("duck-typed collaborator shape");
    expect(merged.instanceMethods.map((m) => m.name).sort()).toEqual(["locate", "use"]);
    expect(merged.interfaceMembers).toEqual(["locate"]);
  });

  it("keeps the interface's metadata when the namespace is declared first", () => {
    const merged = entry(`${NAMESPACE}\n${IFACE}`);

    expect(merged.isInterface).toBe(true);
    expect(merged.noRailsEquivalent).toBe("duck-typed collaborator shape");
    expect(merged.instanceMethods.map((m) => m.name).sort()).toEqual(["locate", "use"]);
    expect(merged.interfaceMembers).toEqual(["locate"]);
  });

  it("records the namespace half, which the interface-only kind exemption must not absolve", () => {
    expect(entry(`${IFACE}\n${NAMESPACE}`).declaredAsNamespace).toBe(true);
    expect(entry(`${NAMESPACE}\n${IFACE}`).declaredAsNamespace).toBe(true);
    expect(entry(IFACE).declaredAsNamespace).toBeUndefined();
  });

  it("records an `export * as` binding of the name over an existing entry", () => {
    const info = extractFromFiles("/p", {
      "other.ts": `export function use(name: string): void {}`,
      "locator.ts": `${IFACE}\nexport * as Locator from "./other.js";`,
    });
    const merged = info.modules["locator.ts:Locator"];
    expect(merged.declaredAsNamespace).toBe(true);
    // The existing entry's members survive — the re-export only adds the
    // namespace binding, it does not replace the interface.
    expect(merged.instanceMethods.map((m) => m.name)).toEqual(["locate"]);
    expect(merged.isInterface).toBe(true);
  });
});

describe("@missingRailsCall extraction", () => {
  it("records the tagged calls on a class method", () => {
    const cls = extractFromSource(`
      export class Foo {
        /**
         * Prose.
         * @missingRailsCall synchronize — PERMANENT: Ruby guards with Mutex#synchronize; trails is single-threaded.
         */
        bar(): void {}
      }
    `);
    expect(cls.instanceMethods[0].missingRailsCalls).toEqual(["synchronize"]);
  });

  it("records a tag written as a one-line comment", () => {
    const cls = extractFromSource(`
      export class Foo {
        /** @missingRailsCall synchronize — PERMANENT: trails is single-threaded. */
        bar(): void {}
      }
    `);
    expect(cls.instanceMethods[0].missingRailsCalls).toEqual(["synchronize"]);
  });

  it("leaves an untagged method's missingRailsCalls undefined", () => {
    const cls = extractFromSource(`
      export class Foo {
        /** Prose. */
        bar(): void {}
      }
    `);
    expect(cls.instanceMethods[0].missingRailsCalls).toBeUndefined();
  });

  it("does not leak a tag from the preceding method", () => {
    const cls = extractFromSource(`
      export class Foo {
        /**
         * @missingRailsCall synchronize — PERMANENT: single-threaded.
         */
        bar(): void {}
        baz(): void {}
      }
    `);
    expect(cls.instanceMethods[1].missingRailsCalls).toBeUndefined();
  });

  it("throws on a bare tag (the empty-reason contract)", () => {
    expect(() =>
      extractFromSource(`
      export class Foo {
        /**
         * @missingRailsCall synchronize
         */
        bar(): void {}
      }
    `),
    ).toThrow(/needs a reason/);
  });

  it("reads a renamed export's own tags instead of the declaration's", () => {
    const info = extractFromFiles("/p", {
      "registry.ts": `
        /**
         * @missingRailsCall each — PERMANENT: declared spelling iterates with for-of.
         */
        function registerModelClass(): void {}

        /**
         * @missingRailsCall first — PERMANENT: the alias indexes instead.
         */
        export { registerModelClass as registerModel };
      `,
    });
    const fns = fileFunctionsOf(info, "registry.ts");
    expect(fns.find((f) => f.name === "registerModel")!.missingRailsCalls).toEqual(["first"]);
  });
});

describe("callArgs", () => {
  const site = (source: string, method = "create"): CallSite[] =>
    extractFromSource(source).instanceMethods.find((m) => m.name === method)!.callArgs!;

  it("drops a thrown construction so the real construction pairs", () => {
    expect(
      site(
        `class Foo {
          create() {
            if (!key) throw new ActiveRecordEncryptionError("key missing");
            return new Cipher(CIPHER_TYPE);
          }
        }`,
      ),
    ).toEqual([{ name: "constructor", args: ["const:CIPHER_TYPE"], flags: [] }]);
  });

  it("keeps a construction nested inside a thrown expression", () => {
    expect(
      site(
        `class Foo {
          create() {
            throw wrap(new Cipher(CIPHER_TYPE));
          }
        }`,
      ),
    ).toEqual([
      { name: "wrap", args: ["call:constructor"], flags: [] },
      { name: "constructor", args: ["const:CIPHER_TYPE"], flags: [] },
    ]);
  });

  it("escapes a descriptor delimiter inside a string value", () => {
    expect(
      site(
        `class Foo {
          create() {
            this.injectJoin(list, collector, ", ");
            this.toSentence({ lastWordConnector: ", or ", sep: "a=b{c}d" });
          }
        }`,
      ),
    ).toEqual([
      { name: "injectJoin", args: ["id:list", "id:collector", "str:%2C "], flags: [] },
      {
        name: "toSentence",
        args: ["kwargs{lastWordConnector=str:%2C or ,sep=str:a%3Db%7Bc%7Dd}"],
        flags: [],
      },
    ]);
  });

  it("records one entry per syntactic call site, in source order", () => {
    const sites = site(
      `class Foo {
        create() {
          this.build(1);
          this.save();
        }
      }`,
    );
    expect(sites).toEqual([
      { name: "build", args: ["num:1"], flags: [] },
      { name: "save", args: [], flags: [] },
    ]);
  });

  it("records a nested call as its own site, by name in the outer argument list", () => {
    // Two sites, not three: the recorder is terminal, so the outer site is
    // emitted once and the inner one is reached through the arguments.
    expect(
      site(
        `class Foo {
          create() {
            foo(bar(1));
          }
        }`,
      ),
    ).toEqual([
      { name: "foo", args: ["call:bar"], flags: [] },
      { name: "bar", args: ["num:1"], flags: [] },
    ]);
  });

  it("emits no entry for a property read, so a read and a call differ", () => {
    const read = site(
      `class Foo {
        create() {
          this.foo;
        }
      }`,
    );
    const called = site(
      `class Foo {
        create() {
          this.foo();
        }
      }`,
    );
    expect(read).toBeUndefined();
    expect(called).toEqual([{ name: "foo", args: [], flags: [] }]);
  });

  it("describes each literal argument form of the shared grammar", () => {
    expect(
      site(
        `class Foo {
          create(value: unknown) {
            this.visit(value, 1, "s", true, false, null, undefined, Klass, this.name, o.left);
          }
        }`,
      ),
    ).toEqual([
      {
        name: "visit",
        args: [
          "id:value",
          "num:1",
          "str:s",
          "bool:true",
          "bool:false",
          "nil",
          "nil",
          "const:Klass",
          "id:name",
          "call:left",
        ],
        flags: [],
      },
    ]);
  });

  it("describes an object literal as kwargs, including shorthand and nesting", () => {
    expect(
      site(
        `class Foo {
          create(scope: unknown) {
            this.visit({ scope, action: "dump", nested: { deep: 1 } });
          }
        }`,
      ),
    ).toEqual([
      {
        name: "visit",
        args: ["kwargs{scope=id:scope,action=str:dump,nested=kwargs{deep=num:1}}"],
        flags: [],
      },
    ]);
  });

  it("describes an object spread as the double-splat, flagging the site", () => {
    // extract-ruby-api.rb#describe_kwargs (:2495-2508) reads `:assoc_splat`
    // (`**opts`) as `**splat` and flags the site; `{ ...opts }` is the same
    // thing on this side, alone or beside ordinary keys.
    expect(
      site(
        `class Foo {
          create(opts: object) {
            this.visit({ ...opts });
            this.visit({ a: 1, ...opts });
          }
        }`,
      ),
    ).toEqual([
      { name: "visit", args: ["kwargs{**splat}"], flags: ["splat"] },
      { name: "visit", args: ["kwargs{a=num:1,**splat}"], flags: ["splat"] },
    ]);
  });

  it("describes a non-keyword or empty object literal as the opaque hash", () => {
    const sites = site(
      `class Foo {
        create(key: string) {
          this.visit({});
          this.visit({ [key]: 1 });
          this.visit({ "a-b": 1 });
        }
      }`,
    );
    expect(sites.map((s) => s.args)).toEqual([["hash"], ["hash"], ["hash"]]);
  });

  it("emits the opaque descriptors for the forms the two languages cannot agree on", () => {
    const sites = site(
      `class Foo {
        create(a: number, b: number) {
          this.visit([1, 2]);
          this.visit(\`x\${a}\`);
          this.visit(a + b);
          this.visit(!a);
          this.visit(a ? b : a);
        }
      }`,
    );
    expect(sites.map((s) => s.args)).toEqual([
      ["array"],
      ["str-interp"],
      ["binop:+"],
      ["unaryid:a"],
      ["ternary"],
    ]);
  });

  it("flags a spread argument and a callback, and drops the callback from the list", () => {
    expect(
      site(
        `class Foo {
          create(args: unknown[]) {
            this.visit(1, ...args);
            this.each((x) => this.save(x));
          }
        }`,
      ),
    ).toEqual([
      { name: "visit", args: ["num:1", "*splat"], flags: ["splat"] },
      { name: "each", args: [], flags: ["block"] },
      { name: "save", args: ["id:x"], flags: [] },
    ]);
  });

  it("records `new Foo(...)` as constructor, matching the Ruby `new` mapping", () => {
    expect(
      site(
        `class Foo {
          create() {
            this.visit(new Node(1));
          }
        }`,
      ),
    ).toEqual([
      { name: "visit", args: ["call:constructor"], flags: [] },
      { name: "constructor", args: ["num:1"], flags: [] },
    ]);
  });

  it("describes X.call(this, ...) in argument position as the dispatched identifier", () => {
    // activemodel/attribute-methods.ts spells Rails'
    // `generated_attribute_methods` (attribute_methods.rb:212) as
    // `generatedAttributeMethods.call(this)` — the `this`-typed mixin idiom.
    // Naming it `call:call` here could never pair with the Ruby descriptor.
    expect(
      site(
        `class Foo {
          create() {
            this.batch(generatedAttributeMethods.call(this), 1);
            this.batch(helper.apply(this, [1]));
            this.batch(fn.call(other));
          }
        }`,
      ),
    ).toEqual([
      { name: "batch", args: ["call:generatedAttributeMethods", "num:1"], flags: [] },
      { name: "call", args: ["id:this"], flags: [] },
      { name: "batch", args: ["call:helper"], flags: [] },
      { name: "apply", args: ["id:this", "array"], flags: [] },
      { name: "batch", args: ["call:call"], flags: [] },
      { name: "call", args: ["id:other"], flags: [] },
    ]);
  });

  it("unwraps await / as / non-null / parenthesized wrappers to the inner expression", () => {
    expect(
      site(
        `class Foo {
          async create(value: unknown) {
            this.visit(await this.load(), (value as string), value!);
          }
        }`,
      ),
    ).toEqual([
      { name: "visit", args: ["call:load", "id:value", "id:value"], flags: [] },
      { name: "load", args: [], flags: [] },
    ]);
  });

  it("walks the receiver before the site it receives, matching the Ruby order", () => {
    expect(
      site(
        `class Foo {
          create() {
            this.klass().unscoped(1);
          }
        }`,
      ),
    ).toEqual([
      { name: "klass", args: [], flags: [] },
      { name: "unscoped", args: ["num:1"], flags: [] },
    ]);
  });

  it("records sites for a bare super call and a file-level function", () => {
    const cls = extractFromSource(
      `class Foo extends Bar {
        constructor(a: number) {
          super(a);
        }
      }`,
    );
    const ctor = cls.instanceMethods.find((m) => m.name === "constructor")!;
    expect(ctor.callArgs).toEqual([{ name: "super", args: ["id:a"], flags: [] }]);

    const info = extractFromFiles("/p", {
      "quoting.ts": `
        export function quote(value: unknown): string {
          return quoteString(typeCast(value));
        }
      `,
    });
    expect(fileFunctionsOf(info, "quoting.ts").find((f) => f.name === "quote")!.callArgs).toEqual([
      { name: "quoteString", args: ["call:typeCast"], flags: [] },
      { name: "typeCast", args: ["id:value"], flags: [] },
    ]);
  });

  it("records sites for an object-literal member and a get accessor", () => {
    const [member] = objectLiteralMethods(
      `export const ClassMethods = {
        create() {
          this.save(1);
        },
      };`,
    );
    expect(member.callArgs).toEqual([{ name: "save", args: ["num:1"], flags: [] }]);

    const cls = extractFromSource(
      `class Foo {
        get scope() {
          return this.build("x");
        }
      }`,
    );
    expect(cls.instanceMethods.find((m) => m.name === "scope")!.callArgs).toEqual([
      { name: "build", args: ["str:x"], flags: [] },
    ]);
  });

  it("drops a site whose name the Ruby extractor's own filter would drop", () => {
    // extract-ruby-api.rb#call_site_name (:2385-2396) never emits a site named
    // `_foo` or one that does not start with a lowercase letter, so recording
    // one here would be a TS-only site that can never pair.
    expect(
      site(
        `class Foo {
          create() {
            this._private(1);
            Klass(2);
            this.save(3);
          }
        }`,
      ),
    ).toEqual([{ name: "save", args: ["num:3"], flags: [] }]);
  });

  it("records sites for a file-local private helper, both declaration forms", () => {
    const info = extractFromFiles("/p", {
      "quoting.ts": `
        export function quote(value: unknown): string {
          return helper(value) + arrowHelper(value);
        }
        function helper(value: unknown): string {
          return where(value);
        }
        const arrowHelper = (value: unknown): string => where(value, 1);
      `,
    });
    const fns = fileFunctionsOf(info, "quoting.ts");
    expect(fns.find((f) => f.name === "helper")!.callArgs).toEqual([
      { name: "where", args: ["id:value"], flags: [] },
    ]);
    expect(fns.find((f) => f.name === "arrowHelper")!.callArgs).toEqual([
      { name: "where", args: ["id:value", "num:1"], flags: [] },
    ]);
  });

  it("emits no descriptor outside the vocabulary the Ruby extractor shares", () => {
    // The other half of the extractor-skew vocabulary pin
    // (extractor-skew.test.ts): a descriptor spelling invented on one side only
    // stops matching silently, so every descriptor the TS extractor can produce
    // has to be one extract-ruby-api.rb#describe_arg also produces.
    const shared = new Set<string>(CALL_ARG_DESCRIPTOR_VOCABULARY);
    const kindOf = (desc: string): string => {
      if (desc.startsWith("kwargs{")) return "kwargs{";
      if (desc.startsWith("unary")) return "unary";
      const colon = desc.indexOf(":");
      return colon === -1 ? desc : desc.slice(0, colon + 1);
    };
    const sites = site(
      `class Foo {
        create(a: number, b: number, xs: unknown[], scope: unknown) {
          this.visit(a, 1, "s", true, false, null, undefined, Klass, this.name, o.left);
          this.visit({ scope, nested: { deep: 1 } }, {}, [1], \`x\${a}\`);
          this.visit(a + b, !a, a ? b : a, ...xs, new Node(), this.load(), /re/);
          this.each((x) => x);
        }
      }`,
    );
    const kinds = [...new Set(sites.flatMap((s) => s.args).map(kindOf))];
    expect(kinds.filter((k) => k !== "?" && !shared.has(k))).toEqual([]);
    const flags = [...new Set(sites.flatMap((s) => s.flags))];
    expect(flags.filter((f) => !shared.has(f))).toEqual([]);
  });

  it("spells a site the same way the calls stream does", () => {
    // The site name is RAW on both sides (Ruby leaves `new` / snake_case; §2
    // normalization is the comparator's job), so what "raw" means here is
    // whatever `calls` already records — the two TS streams must not diverge.
    const cls = extractFromSource(
      `class Foo {
        create() {
          this.buildRecord(1);
          new Node(2);
          super.save();
        }
      }`,
    );
    const create = cls.instanceMethods.find((m) => m.name === "create")!;
    expect(create.callArgs!.map((s) => s.name)).toEqual(create.callSeq);
  });

  it("leaves the existing calls stream unchanged", () => {
    const cls = extractFromSource(
      `class Foo {
        create() {
          this.build(1);
          this.save();
        }
      }`,
    );
    const create = cls.instanceMethods.find((m) => m.name === "create")!;
    expect(create.calls).toEqual(["build", "save"]);
    expect(create.callSeq).toEqual(["build", "save"]);
  });
});
