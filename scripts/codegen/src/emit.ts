/* eslint-disable @typescript-eslint/no-explicit-any -- the IR is untyped JSON from the Ruby front-end */
/**
 * Pass 4 + 7 for structure: turns one Ruby file's classes and modules into a
 * TypeScript module.
 *
 *   class Foo < Bar      → `export class Foo extends Bar { … }`
 *   def x / def self.x   → instance / static method (names via conventions.ts)
 *   attr_reader :x       → `get x()` over the `_x` ivar slot
 *   include/extend M     → `include(Foo, M)` / `extend(Foo, M)` after the class
 *   module M; def x      → `export const M = { x(this: any) { … } }` (the
 *                          object-literal mixin shape parity:api reads)
 *   module M; def self.x → `export function x()`
 *   CONST = v            → `static CONST = v` / `export const CONST = v`
 *   other class-body call→ `static { this.macro(...) }`
 */
import { rubyMethodToTsIgnoringSkip } from "../../parity/conventions.js";
import { TS_CONSTANT_RENAMES } from "./constant-renames.js";
import type { IrFile, N, Param } from "./ir.js";
import { walk } from "./ir.js";
import { GemIndex, lexicalChain, qualify, type ScopeInfo } from "./gem-index.js";
import {
  indent,
  jsIdent,
  Lowerer,
  propKey,
  propName,
  RESERVED,
  tsMethodName,
  type Ctx,
  type FileCtx,
  type InlineHook,
  type Scope,
} from "./lower.js";
import { Resolver, rubyFileToTsAr } from "./resolve.js";
import { CITE_PREFIX, GEM, PKG_DIR, handNamespaceFqns } from "./gem.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { candidates } from "./types.js";

interface Unit {
  /**
   * Statements of this module's body that follow a nested module or class in
   * source and send to a constant (`ActiveSupport.on_load(:active_job) {
   * Base.include(TestQueueAdapter) }`): Ruby runs them after the nested
   * definition, so they are emitted after every unit of the file.
   */
  late?: N[];
  kind: "class" | "module";
  fqn: string;
  nesting: string[];
  superclass: N | null;
  body: N[];
  /** statements from `class << self` */
  sbody: N[];
  struct?: { members: string[]; keyword_init: boolean } | null;
}

export interface FileResult {
  rubyFile: string;
  tsFile: string;
  text: string;
  ctx: FileCtx;
  defs: number;
  units: number;
}

/** A statement naming (by its bare constant) a class nested earlier in the same body. */
function namesNested(s: N, names: Set<string> | undefined): boolean {
  if (!names?.size) return false;
  let hit = false;
  walk(s, (n) => {
    if (n.k === "const" && n.path?.length === 1 && names.has(n.path[0])) hit = true;
  });
  return hit;
}

export function collectUnits(file: IrFile): Unit[] {
  const units: Unit[] = [];
  const byFqn = new Map<string, Unit>();
  const visit = (stmts: N[], nesting: string[], into?: Unit) => {
    for (const s of stmts) {
      if (s.k === "module" || s.k === "class") {
        if (!s.path) continue;
        const fqn = qualify(s.path, nesting[nesting.length - 1]);
        let u = byFqn.get(fqn);
        if (!u) {
          u = {
            kind: s.k,
            fqn,
            nesting: [...nesting, fqn],
            superclass: s.k === "class" ? s.superclass : null,
            body: [],
            sbody: [],
            struct: s.struct,
          };
          byFqn.set(fqn, u);
          units.push(u);
        }
        visit(s.body.body ?? [], [...nesting, fqn], u);
        if (into) {
          (into as any).sawNested = true;
          ((into as any).nestedNames ??= new Set<string>()).add(s.path[s.path.length - 1]);
        }
      } else if (s.k === "seq") {
        visit(s.body, nesting, into);
      } else if (s.k === "sclass" && into) {
        into.sbody.push(...(s.body.body ?? []));
      } else if (
        into &&
        s.k === "call" &&
        s.recv === null &&
        (s.name === "included" || s.name === "prepended") &&
        s.block?.k === "block"
      ) {
        const keep: N[] = [];
        for (const b of s.block.body.body ?? []) {
          if (b.k === "def")
            (b.singleton ? into.sbody : into.body).push({ ...b, singleton: false });
          else if (b.k === "sclass") into.sbody.push(...(b.body.body ?? []));
          else keep.push(b);
        }
        into.body.push({ ...s, block: { ...s.block, body: { k: "seq", body: keep } } });
      } else if (
        s.k === "call" &&
        s.recv === null &&
        s.name === "class_methods" &&
        s.block?.k === "block" &&
        into
      ) {
        const fqn = `${into.fqn}::ClassMethods`;
        let u = byFqn.get(fqn);
        if (!u) {
          u = {
            kind: "module",
            fqn,
            nesting: [...nesting, fqn],
            superclass: null,
            body: [],
            sbody: [],
          };
          byFqn.set(fqn, u);
          units.push(u);
        }
        u.body.push(...(s.block.body.body ?? []));
      } else if (
        into &&
        s.k === "call" &&
        s.recv?.k === "call" &&
        s.recv.name === "singleton_class" &&
        s.recv.recv === null &&
        /^(attr_|alias_method)/.test(s.name)
      ) {
        into.sbody.push({ ...s, recv: null });
      } else if (
        into &&
        (into as any).sawNested &&
        s.k === "call" &&
        // A test case's body is emitted in order by `emitTestCase`.
        !/(^|::)TestCase$/.test((into.superclass?.path ?? []).join("::")) &&
        (s.recv?.k === "const" || namesNested(s, (into as any).nestedNames))
      ) {
        (into.late ??= []).push(s);
      } else if (into) {
        into.body.push(s);
      }
    }
  };
  visit(file.body.body, []);
  return units;
}

export class Emitter {
  lw: Lowerer;
  constructor(
    readonly index: GemIndex,
    readonly resolver: Resolver,
  ) {
    this.lw = new Lowerer(index, resolver);
  }

  /** Pre-pass: assign each unit its export name so cross-file refs resolve. */
  register(file: IrFile): void {
    const tsFile = rubyFileToTsAr(file.file);
    const taken = new Set<string>();
    for (const u of collectUnits(file)) {
      if (
        this.resolver.exportNames.has(u.fqn) &&
        this.index.scopes.get(u.fqn)?.primaryFile !== file.file
      )
        continue;
      if (!this.emits(u, file.file)) continue;
      const short = u.fqn.split("::").pop()!;
      let name = TS_CONSTANT_RENAMES[u.fqn] ?? short;
      if (taken.has(name)) name = u.fqn.split("::").slice(-2).join("");
      taken.add(name);
      this.resolver.exportNames.set(u.fqn, { tsFile, name });
    }
  }

  /**
   * The parameter list and forwarded arguments of an `alias` / `alias_method`
   * forwarder: the aliased gem method's own parameters, since a Ruby alias is
   * that method under a second name. A method the gem index cannot find
   * (defined in a dependency) keeps a rest parameter.
   */
  aliasSignature(fqn: string, old: string, isStatic: boolean): [string, string] {
    for (const s of this.index.ancestors(fqn)) {
      const d = (isStatic ? s.sdefs : s.defs).get(old);
      if (!d) continue;
      const ps: string[] = [];
      const as: string[] = [];
      let kw = false;
      const add = (param: string, arg: string) => {
        ps.push(param);
        as.push(arg);
      };
      d.params.forEach((p: any, i: number) => {
        const nm = jsIdent(p.name ?? `a${i}`);
        // TS forbids a required parameter after an optional one; Ruby allows it.
        const anyOpt = ps.some((x) => x.includes("?:"));
        if (p.kind === "req") add(anyOpt ? `${nm}?: any` : `${nm}: any`, nm);
        else if (p.kind === "opt" || p.kind === "block") add(`${nm}?: any`, nm);
        else if (p.kind === "rest") add(`...${nm}: any[]`, `...${nm}`);
        else if (["key", "keyreq", "keyrest"].includes(p.kind) && !kw) {
          kw = true;
          add("options?: any", "options");
        } else if (p.kind === "fwd") add("...args: any[]", "...args");
      });
      // A rest parameter must be last: move a trailing options/block after it.
      const ri = ps.findIndex((x) => x.startsWith("..."));
      if (ri >= 0 && ri < ps.length - 1) return ["...args: any[]", "...args"];
      return [ps.join(", "), as.join(", ")];
    }
    return ["...args: any[]", "...args"];
  }

  /**
   * The module `initialize` bodies between a class and its superclass, in the
   * order Ruby's `super` reaches them: the most recently included module first,
   * each followed by the modules it includes (`Module#include` puts a later
   * module nearer the class). Prepends are not recorded by the gem index.
   */
  initializeChain(fqn: string): InlineHook[] {
    const cls = this.index.scopes.get(fqn);
    if (!cls || cls.kind !== "class") return [];
    const out: InlineHook[] = [];
    const seen = new Set<string>();
    const visit = (scope: ScopeInfo) => {
      const chain = lexicalChain(this.index, scope.lexicalParent);
      for (const inc of [...scope.includes].reverse()) {
        const m = this.index.resolveConst(inc, [...chain, scope.fqn]);
        const ms = m ? this.index.scopes.get(m.fqn) : undefined;
        if (!ms) {
          // A dependency module (`ActiveModel::API`): its body comes from the
          // Rails manifest's citation and that file's IR.
          const dep = this.index.depInits.get(inc.filter((x) => x).join("::"));
          const fq = inc.filter((x) => x).join("::");
          if (dep && !seen.has(fq)) {
            seen.add(fq);
            out.push({ module: fq, def: dep.node, file: null, cite: dep.cite });
          }
          continue;
        }
        if (ms.kind !== "module" || seen.has(ms.fqn)) continue;
        seen.add(ms.fqn);
        const d = ms.defs.get("initialize");
        if (d?.node && d.lineEnd)
          out.push({
            module: ms.fqn,
            def: d.node,
            file: d.file,
            cite: `${CITE_PREFIX}/${d.file}:${d.line}-${d.lineEnd}`,
          });
        visit(ms);
      }
    };
    visit(cls);
    return out;
  }

  /**
   * `Mod::ClassMethods#new` hooks for the modules a class includes directly
   * (`Deduplicable`): Ruby's `Klass.new` enters them before `initialize`.
   */
  classMethodsNewHooks(fqn: string): InlineHook[] {
    const cls = this.index.scopes.get(fqn);
    if (!cls || cls.kind !== "class") return [];
    const chain = lexicalChain(this.index, cls.lexicalParent);
    const out: InlineHook[] = [];
    for (const inc of cls.includes) {
      const m = this.index.resolveConst(inc, [...chain, fqn]);
      const cm = m ? this.index.scopes.get(`${m.fqn}::ClassMethods`) : undefined;
      const d = cm?.defs.get("new");
      if (cm && d?.node && d.lineEnd)
        out.push({
          module: cm.fqn,
          def: d.node,
          file: d.file,
          cite: `${CITE_PREFIX}/${d.file}:${d.line}-${d.lineEnd}`,
        });
    }
    return out;
  }

  private inlinedModulesMemo?: Set<string>;
  /** Modules whose `initialize` some gem class inlines; their `initialize` is not emitted. */
  inlinedModules(): Set<string> {
    if (this.inlinedModulesMemo) return this.inlinedModulesMemo;
    const set = new Set<string>();
    for (const sc of this.index.scopes.values())
      if (sc.kind === "class") for (const h of this.initializeChain(sc.fqn)) set.add(h.module);
    return (this.inlinedModulesMemo = set);
  }

  /** `@inlinedFrom` tags for the hooks a constructor inlined from other Ruby files. */
  inlinedFromTags(hooks: InlineHook[], rubyFile: string): string[] {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const h of hooks) {
      if (h.file === rubyFile || seen.has(h.module)) continue;
      seen.add(h.module);
      const hook = h.def?.name === "new" ? "new" : "initialize";
      tags.push(`@inlinedFrom ${h.module}#${hook} ${h.cite}`);
    }
    return tags;
  }

  /**
   * A Rails test class (`< ActiveSupport::TestCase`) as a vitest `describe`
   * named after it, each `test "name" do` / `def test_name` an async `it` with
   * the name test-compare matches (`def test_a_b` is "a b",
   * extract-ruby-tests.rb), `setup` / `teardown` as `beforeEach` / `afterEach`.
   * Bodies lower in test mode: assertions as `expect`, other calls awaited.
   */
  emitTestCase(u: Unit, f: FileCtx): string {
    const vitest = (x: string) => this.lw.imp(this.baseCtx(u, f, {}), "vitest", x);
    const desc = vitest("describe");
    const out: string[] = [];
    const classLines: string[] = [];
    const hostMembers: string[] = [];
    const short = u.fqn.split("::").pop()!;
    // Block parameters of an enclosing per-element loop (`each do |arg|`).
    const loopLocals: string[] = [];
    const body = (b: N, params: Param[] = []) => {
      const ctx = this.baseCtx(u, f, {
        selfKind: "instance",
        selfExpr: "testCase",
        testMode: true,
        asyncBox: { awaits: false },
      });
      for (const l of loopLocals) ctx.scope.locals.add(l);
      const lines = this.lw.block(this.lw.seqBody(b), ctx, false);
      const hz: Set<string> | undefined = ctx.scope.hoisted;
      if (hz?.size) lines.unshift(`let ${[...hz].map((h) => `${jsIdent(h)}: any`).join(", ")};`);
      void params;
      return lines;
    };
    const nameCtx = () => {
      // At class level `self` is the test class (`unless adapter_skips_scheduling?(...)`).
      const c = this.baseCtx(u, f, {
        selfKind: "static",
        selfExpr: short,
        asyncBox: undefined,
      });
      for (const l of loopLocals) c.scope.locals.add(l);
      return c;
    };
    const emitBody = (stmts: N[], out: string[]): void => {
      for (const s of stmts) {
        if (
          s.k === "call" &&
          s.recv === null &&
          s.name === "test" &&
          (s.args[0]?.k === "str" || s.args[0]?.k === "dstr") &&
          s.block?.k === "block"
        ) {
          // An interpolated name (`"should load #{ENV['AJ_ADAPTER']} adapter"`) is
          // computed when the file is collected, as Ruby computes it at `test`.
          const nm =
            s.args[0].k === "str"
              ? JSON.stringify(s.args[0].value)
              : this.lw.expr(s.args[0], nameCtx());
          out.push(
            `${vitest("it")}(${nm}, async ({ testCase }: any) => {`,
            ...indent(body(s.block.body)),
            "});",
          );
        } else if (s.k === "if") {
          // A test defined under a condition (`if adapter_is?(:sucker_punch)`).
          const ctx = nameCtx();
          const thenOut: string[] = [];
          const elseOut: string[] = [];
          emitBody(this.lw.seqBody(s.then), thenOut);
          emitBody(this.lw.seqBody(s.else), elseOut);
          out.push(`if (${this.lw.cond(s.cond, ctx)}) {`, ...indent(thenOut));
          if (elseOut.length) out.push("} else {", ...indent(elseOut));
          out.push("}");
        } else if (s.k === "def" && /^test_/.test(s.name)) {
          const nm = s.name.replace(/^test_/, "").replace(/_/g, " ");
          out.push(
            `${vitest("it")}(${JSON.stringify(nm)}, async ({ testCase }: any) => {`,
            ...indent(body(s.body)),
            "});",
          );
        } else if (
          s.k === "call" &&
          s.recv === null &&
          (s.name === "setup" || s.name === "teardown") &&
          s.block?.k === "block"
        ) {
          const hook = vitest(s.name === "setup" ? "beforeEach" : "afterEach");
          out.push(`${hook}(async ({ testCase }: any) => {`, ...indent(body(s.block.body)), "});");
        } else if (s.k === "call" && s.recv === null && s.name === "include" && s.args.length) {
          // `include ActiveJob::TestHelper`: the module joins the test class's
          // ancestors, so its methods and `before_setup` / `after_teardown` reach
          // each test's instance.
          const ctx = this.baseCtx(u, f, { selfKind: "static", selfExpr: short });
          for (const a of s.args) {
            // Ruby stdlib `Logger::Severity` is constants only: its bare names
            // resolve to trails' `Logger` statics (resolve.ts).
            if (
              a.k === "const" &&
              a.path
                .filter((x: string) => x)
                .join("::")
                .endsWith("Logger::Severity")
            )
              continue;
            classLines.push(
              `${this.lw.imp(ctx, "@blazetrails/ruby-compat", "include")}(${short}, ${this.lw.expr(a, ctx)});`,
            );
          }
        } else if (
          s.k === "call" &&
          s.recv === null &&
          ["private", "protected", "public"].includes(s.name) &&
          s.args.length === 0
        ) {
          // CLAUDE.md "Method visibility is compile-time only".
          continue;
        } else if (
          s.k === "call" &&
          s.name === "each" &&
          s.recv?.k === "array" &&
          s.block?.k === "block" &&
          s.block.params.length === 1
        ) {
          // Tests generated per element (`[nil, 1, ...].each do |arg| test "..." end`):
          // the loop runs as vitest collects, as Ruby's runs at class definition.
          const p = s.block.params[0].name;
          const inner: string[] = [];
          const list = this.lw.expr(s.recv, nameCtx());
          loopLocals.push(p);
          emitBody(this.lw.seqBody(s.block.body), inner);
          loopLocals.pop();
          out.push(`for (const ${jsIdent(p)} of ${list}) {`, ...indent(inner), "}");
        } else if (s.k === "class" || s.k === "module") {
          // A nested class is its own unit, emitted beside the test case.
          continue;
        } else if (s.k === "sclass") {
          // `class << self; def x` in a test class: a static method on it.
          for (const d of this.lw.seqBody(s.body)) {
            if (d.k !== "def") continue;
            const fn = this.emitMethod(d, u, f, {
              static: true,
              module: false,
              vis: "public",
              asFunction: true,
              selfExpr: "this",
            }).replace(/^export /, "");
            const nm = /function (\w+)/.exec(fn)![1];
            classLines.push(fn, `${short}.${nm} = ${nm};`);
          }
        } else if (
          s.k === "call" &&
          s.recv === null &&
          ["require", "require_relative"].includes(s.name)
        ) {
          continue;
        } else if (s.k === "def") {
          // A helper `def` in the test class is an instance method every test calls bare.
          // A class member, so a `def setup; super` reaches the host's `setup`.
          hostMembers.push(
            this.emitMethod(s, u, f, {
              static: false,
              module: false,
              vis: "public",
              selfExpr: "this",
            }),
          );
        } else {
          const ctx = this.baseCtx(u, f, { selfKind: "static", selfExpr: "testCase" });
          out.push(
            `${this.lw.decline(ctx, "unhandled-node", s, `test class body: ${s.k} ${s.name ?? ""}`)};`,
          );
        }
      }
    };
    // A gem test case superclass (`< ActiveJob::TestCase`, itself an
    // `ActiveSupport::TestCase` that includes `ActiveJob::TestHelper`): the test
    // host stands in for ActiveSupport's, so the gem class's modules join here.
    {
      const ictx = this.baseCtx(u, f, { selfKind: "static", selfExpr: short });
      const chain: string[][] = [];
      let sup =
        u.superclass?.k === "const"
          ? this.index.resolveConst(u.superclass.path, u.nesting)
          : undefined;
      const seen = new Set<string>();
      while (sup?.kind === "scope" && !seen.has(sup.fqn)) {
        seen.add(sup.fqn);
        const sc = this.index.scopes.get(sup.fqn);
        if (!sc) break;
        chain.unshift(...sc.includes);
        sup = sc.superclassFqn ? ({ kind: "scope", fqn: sc.superclassFqn } as any) : undefined;
      }
      for (const p of chain)
        classLines.push(
          `${this.lw.imp(ictx, "@blazetrails/ruby-compat", "include")}(${short}, ${this.lw.expr({ k: "const", path: p } as N, ictx)});`,
        );
    }
    // `class << self; def x` (collected into `sbody`): static methods on the test class.
    for (const d of u.sbody) {
      if (d.k !== "def") continue;
      const fn = this.emitMethod(d, u, f, {
        static: true,
        module: false,
        vis: "public",
        asFunction: true,
        selfExpr: "this",
      }).replace(/^export /, "");
      const nm = /function (\w+)/.exec(fn)![1];
      classLines.push(fn, `${short}.${nm} = ${nm};`);
    }
    emitBody(u.body, out);
    // activesupport's testing/autorun runs each test on a fresh instance of the
    // class its describe names, between Minitest's `before_setup` and
    // `after_teardown`, and counts its assertions (minitest/test.rb `run`);
    // `setup` / `teardown` run inside them.
    const hctx = this.baseCtx(u, f, {});
    this.lw.resolver.wanted.set("TestHost", (this.lw.resolver.wanted.get("TestHost") ?? 0) + 1);
    const host = this.lw.imp(hctx, "@root/codegen-runtime.js", "TestHost");
    this.lw.imp(hctx, "@blazetrails/activesupport/testing/autorun", "", "");
    const register = this.lw.rc(hctx, "registerConstant");
    return [
      `${desc}(${JSON.stringify(short)}, () => {`,
      ...indent([
        hostMembers.length
          ? [
              `class ${short} extends ${host} {`,
              ...indent(hostMembers.join("\n\n").split("\n")),
              "}",
            ].join("\n")
          : `class ${short} extends ${host} {}`,
        `${register}(${JSON.stringify(short)}, ${short});`,
        ...classLines,
        `${vitest("beforeEach")}(async ({ testCase }: any) => {`,
        "  await testCase.setup();",
        "});",
        `${vitest("afterEach")}(async ({ testCase }: any) => {`,
        "  await testCase.teardown();",
        "});",
        ...out,
      ]),
      "});",
    ].join("\n");
  }

  /** `setup` / `teardown` blocks of a reopened `ActiveSupport::TestCase` as top-level hooks. */
  emitTestHooks(u: Unit, f: FileCtx): string {
    const out: string[] = [];
    for (const s of u.body) {
      if (
        s.k === "call" &&
        s.recv === null &&
        (s.name === "setup" || s.name === "teardown") &&
        s.block?.k === "block"
      ) {
        const ctx = this.baseCtx(u, f, {
          selfKind: "instance",
          selfExpr: "testCase",
          testMode: true,
          asyncBox: { awaits: false },
        });
        const lines = this.lw.block(this.lw.seqBody(s.block.body), ctx, false);
        const hook = this.lw.imp(ctx, "vitest", s.name === "setup" ? "beforeEach" : "afterEach");
        out.push(`${hook}(async ({ testCase }: any) => {`, ...indent(lines), "});");
      } else {
        const ctx = this.baseCtx(u, f, { selfKind: "static", selfExpr: "testCase" });
        out.push(
          `${this.lw.decline(ctx, "unhandled-node", s, `reopened TestCase body: ${s.k} ${s.name ?? ""}`)};`,
        );
      }
    }
    return out.join("\n");
  }

  /** Required positional arity of the nearest `initialize` above `fqn` in the gem, else 0. */
  inheritedInitializeArity(fqn: string): number {
    let cur = this.index.scopes.get(fqn)?.superclassFqn;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const s = this.index.scopes.get(cur);
      if (!s) break;
      const init = s.defs.get("initialize");
      if (init) return init.params.filter((p: any) => p.kind === "req").length;
      cur = s.superclassFqn;
    }
    return 0;
  }

  /** A namespace-only module (only nested classes/modules) emits nothing. */
  emits(u: Unit, rubyFile?: string): boolean {
    if (u.body.length > 0 || u.sbody.length > 0 || u.superclass || u.struct) return true;
    // A test's namespace module holding only a nested class (`module ModuleArgument;
    // class ClassArgument; end; end`) is itself a value the test passes around.
    if (u.kind === "module" && rubyFile?.startsWith("test/")) return true;
    if (u.kind === "class") return this.index.scopes.get(u.fqn)?.primaryFile === rubyFile;
    return false;
  }

  emitFile(file: IrFile): FileResult {
    const tsFile = rubyFileToTsAr(file.file);
    const f: FileCtx = {
      rubyFile: file.file,
      tsFile,
      imports: new Map(),
      usedLocalNames: new Set(),
      declines: [],
      stats: {},
    };
    for (const e of this.resolver.exportNames.values())
      if (e.tsFile === tsFile) f.usedLocalNames.add(e.name);
    // Module singleton functions claim their exported names first, so an
    // instance method of the same name goes inline rather than colliding, and
    // imports avoid every name this file will declare.
    const sfnNames = new Set<string>();
    for (const u of collectUnits(file)) {
      if (u.kind !== "module") continue;
      for (const s of [...u.body, ...u.sbody]) {
        if (s.k !== "def") continue;
        const isS = s.singleton || u.sbody.includes(s);
        const nm = tsMethodName(s.name, u.fqn, isS);
        if (isS)
          sfnNames.add(
            /^[a-z_]\w*=$/.test(s.name) && !nm.startsWith("set")
              ? "set" + nm[0].toUpperCase() + nm.slice(1)
              : nm,
          );
        f.usedLocalNames.add(nm);
      }
    }
    f.fileFns = new Set(sfnNames);
    f.sfnNames = sfnNames;
    const chunks: string[] = [];
    let defs = 0;
    {
      const twin = path.join(PKG_DIR, "src", tsFile);
      f.symbolColon = existsSync(twin) && /\bisSymbol\b/.test(readFileSync(twin, "utf8"));
      // A ported test exercising `ActiveJob::Arguments` (whose port tells a
      // Symbol by its colon) writes its Symbols that way too.
      if (file.file.startsWith("test/") && /"Arguments"/.test(JSON.stringify(file.body)))
        f.symbolColon = true;
      // activejob's serializers sit behind Arguments and read the same Symbols.
      if (GEM.gem === "activejob" && /^active_job\/serializers/.test(file.file))
        f.symbolColon = true;
    }
    const units = orderBySuperclass(
      collectUnits(file).filter((u) => this.emits(u, file.file)),
      this.index,
    );
    for (const u of units) {
      const exp = this.resolver.exportNames.get(u.fqn);
      if (!exp || exp.tsFile !== tsFile) {
        // reopened elsewhere: emit as an augmenting module under a file-local name
      }
      const name = exp && exp.tsFile === tsFile ? exp.name : u.fqn.split("::").join("");
      // A test support file reopening `ActiveSupport::TestCase` to add a
      // `setup` / `teardown` (`support/job_buffer.rb`): top-level vitest hooks,
      // which apply to every test file importing it, the scope Ruby's reopen has.
      if (file.file.startsWith("test/") && u.fqn === "ActiveSupport::TestCase") {
        chunks.push(this.emitTestHooks(u, f));
        continue;
      }
      if (
        file.file.startsWith("test/") &&
        u.kind === "class" &&
        /(^|::)TestCase$/.test((u.superclass?.path ?? []).join("::"))
      ) {
        chunks.push(this.emitTestCase(u, f));
        continue;
      }
      const r = u.kind === "class" ? this.emitClass(u, name, f) : this.emitModule(u, name, f);
      defs += r.defs;
      chunks.push(r.text);
      // A test's module is named for `Module#name` the way its classes are.
      if (u.kind === "module" && file.file.startsWith("test/"))
        chunks.push(
          `${this.lw.rc(this.baseCtx(u, f, {}), "registerConstant")}(${JSON.stringify(u.fqn)}, ${name});`,
        );
    }
    // A test fixture's top-level statements (`adapters/inline.rb`'s
    // `ActiveJob::Base.queue_adapter = :inline`) run when it is loaded.
    // A test's `require "helper"` loads `adapters/#{ENV["AJ_ADAPTER"] ||= "inline"}`
    // (activejob/test/helper.rb:9-17): the default adapter's file, for its effect.
    if (
      (file.file.startsWith("test/cases/") || /^test\/.*_test\.rb$/.test(file.file)) &&
      (file.body?.k === "seq" ? file.body.body : [file.body]).some(
        (s: N) => s?.k === "call" && s.name === "require" && s.args[0]?.value === "helper",
      )
    ) {
      const hctx = this.baseCtx({ nesting: [] } as unknown as Unit, f, {});
      this.lw.imp(hctx, "@root/test-helpers/helper.js", "", "");
    }
    if (file.file.startsWith("test/")) {
      const top = (file.body?.k === "seq" ? file.body.body : file.body ? [file.body] : []).filter(
        (s: N) =>
          s.k === "call" &&
          !["require", "require_relative"].includes(s.name) &&
          rootConst(s.recv)?.path.filter((x: string) => x)[0] !== undefined &&
          rootConst(s.recv)!.path.filter((x: string) => x)[0] !== "ENV",
      );
      const stmts = file.body?.k === "seq" ? file.body.body : file.body ? [file.body] : [];
      const fake = { nesting: [], fqn: undefined, body: [], sbody: [] } as unknown as Unit;
      const tctx = this.baseCtx(fake, f, {});
      if (
        stmts.some(
          (s: N) =>
            s.k === "call" &&
            s.recv === null &&
            s.name === "require" &&
            s.args[0]?.value === GEM.rubyRoot,
        )
      )
        this.lw.imp(
          tctx,
          `@root/${this.lw.resolver.tsFileOf(`${GEM.rubyRoot}.rb`).replace(/\.ts$/, ".js")}`,
          "",
          "",
        );
      // `@adapter = ENV["AJ_ADAPTER"] ||= "inline"` (helper.rb:9): the `ENV`
      // default is what later reads see; the top-level ivar has no reader.
      for (const s of stmts)
        if (s.k === "iasgn" && s.value?.k === "opasgn" && s.value.target?.recv?.path?.[0] === "ENV")
          chunks.push(...this.lw.stmt(s.value, tctx, false));
      // helper.rb:16 `require "adapters/#{@adapter}"`: the adapter AJ_ADAPTER names,
      // loaded for its effect once the default is in place (ESM has no sync require).
      if (GEM.gem === "activejob" && file.file === "test/helper.rb")
        chunks.push(
          "await ({",
          '  inline: () => import("./adapters/inline.js"),',
          '  async: () => import("./adapters/async.js"),',
          '  test: () => import("./adapters/test.js"),',
          '} as Record<string, () => Promise<unknown>>)[process.env["AJ_ADAPTER"]!]();',
        );
      for (const s of top) chunks.push(...this.lw.stmt(s, tctx, false));
      // A top-level `def` (helper.rb's `adapter_is?`) is a method on Ruby's main
      // object, which every test can call bare: an exported function here.
      for (const s of stmts) {
        if (s.k !== "def") continue;
        const fn = this.emitMethod(s, fake, f, {
          static: true,
          module: false,
          vis: "public",
          asFunction: true,
          selfExpr: "undefined",
        });
        chunks.push(fn);
        this.index.topDefs.set(s.name, tsFile);
      }
    }
    // A Concern's nested `ClassMethods` is what `append_features` extends the
    // includer with, read as its own `ClassMethods` property: seat it, the hand
    // port's `Callbacks.ClassMethods = ClassMethods` (actionpack
    // abstract-controller/callbacks.ts). At the end, so both constants exist.
    const names = new Map(
      units.map((u) => {
        const exp = this.resolver.exportNames.get(u.fqn);
        return [u.fqn, exp && exp.tsFile === tsFile ? exp.name : u.fqn.split("::").join("")];
      }),
    );
    // Each constant is seated on its parent module, `rbModConstSet(ActiveJob,
    // "Base", Base)` (activejob base.ts), which is what `const_get` and an
    // `autoload` read, and what names it (`rbModName`). A parent the hand port
    // seats in `namespaces.ts` is read from there.
    if (handNamespaceFqns().size) {
      const bctx = this.baseCtx(units[0] ?? ({} as Unit), f, {});
      for (const u of units) {
        const i = u.fqn.lastIndexOf("::");
        if (i < 0) continue;
        const parent = u.fqn.slice(0, i);
        // Only a parent seated in the zero-import `namespaces.ts`: seating on a
        // parent read from its own file closes a cycle whenever that file
        // imports its children (`serializers.rb` names every serializer).
        const seat = handNamespaceFqns().get(parent);
        if (!seat) continue;
        const ref = this.lw.imp(bctx, "@root/namespaces.js", seat, `${seat}Seat`);
        chunks.push(
          `${this.lw.rc(bctx, "rbModConstSet")}(${ref}, ${JSON.stringify(u.fqn.slice(i + 2))}, ${names.get(u.fqn)});`,
        );
      }
    }
    for (const u of units) {
      if (u.kind !== "module" || !this.index.scopes.get(u.fqn)?.concern) continue;
      const cm = names.get(`${u.fqn}::ClassMethods`);
      if (cm) chunks.push(`${names.get(u.fqn)}.ClassMethods = ${cm};`);
    }
    for (const u of units) {
      if (!u.late?.length) continue;
      const exp = this.resolver.exportNames.get(u.fqn);
      const name = exp && exp.tsFile === tsFile ? exp.name : u.fqn.split("::").join("");
      const ctx = this.baseCtx(u, f, { selfKind: "static", selfExpr: name });
      for (const s of u.late) chunks.push(...this.lw.stmt(s, ctx, false));
    }
    const header = this.imports(f);
    const text = [...header, "", ...chunks].join("\n") + "\n";
    return { rubyFile: file.file, tsFile, text, ctx: f, defs, units: units.length };
  }

  imports(f: FileCtx): string[] {
    const lines: string[] = [];
    const depth = f.tsFile.split("/").length - 1;
    const rel = (target: string) => {
      const up = depth === 0 ? "./" : "../".repeat(depth);
      return up + target;
    };
    // A test's `require "helper"` is its first line, and loads the gem from its
    // root: imported first, a test entering at a leaf (`serializers/…`) does not
    // meet the gem's cycles half-evaluated.
    const first = (x: string) => (x === "@root/test-helpers/helper.js" ? 0 : 1);
    const specs = [...f.imports.keys()].sort(
      (a, b) => first(a) - first(b) || (a < b ? -1 : a > b ? 1 : 0),
    );
    for (const spec of specs) {
      const m = f.imports.get(spec)!;
      const s = spec.startsWith("@root/") ? rel(spec.slice(6)) : spec;
      if (spec.startsWith("@root/") && spec.slice(6).replace(/\.js$/, ".ts") === f.tsFile) continue;
      const ns = m.get("*");
      if (ns) lines.push(`import * as ${ns} from "${s}";`);
      // `""` marks a side-effect import (an `autoload`ed file seats itself);
      // a bare form, since a TS transform drops an unused named import.
      if (m.has("") && !ns && m.size === 1) lines.push(`import "${s}";`);
      const names = [...m.entries()]
        .filter(([k]) => k !== "*" && k !== "")
        .map(([k, v]) => (k === v ? k : `${k} as ${v}`));
      if (names.length) lines.push(`import { ${names.join(", ")} } from "${s}";`);
    }
    return lines;
  }

  baseCtx(u: Unit, f: FileCtx, over: Partial<Ctx>): Ctx {
    const scope: Scope = { locals: new Set<string>() };
    return {
      fnScope: scope,
      asyncBox: { awaits: false },
      f,
      nesting: u.nesting,
      owner: u.fqn,
      selfKind: "instance",
      selfExpr: "this",
      scope,
      inBlock: false,
      inLoop: false,
      ...over,
    };
  }

  /** Visibility tracker for a class/module body. */
  private visibilityOf(body: N[]): Map<N, "public" | "private" | "protected"> {
    const out = new Map<N, "public" | "private" | "protected">();
    let cur: "public" | "private" | "protected" = "public";
    const named = new Map<string, "private" | "protected" | "public">();
    for (const s of body) {
      if (
        s.k === "call" &&
        s.recv === null &&
        ["private", "protected", "public"].includes(s.name)
      ) {
        if (s.args.length === 0) cur = s.name;
        else
          for (const a of s.args) {
            if (a.k === "sym") named.set(a.value, s.name);
            if (a.k === "def") out.set(a, s.name);
          }
        continue;
      }
      if (s.k === "def") out.set(s, cur);
    }
    for (const [d] of out) if (named.has(d.name)) out.set(d, named.get(d.name)!);
    return out;
  }

  private flattenDefs(body: N[]): N[] {
    const out: N[] = [];
    for (const s of body) {
      if (
        s.k === "call" &&
        s.recv === null &&
        [
          "private",
          "protected",
          "public",
          "module_function",
          "private_class_method",
          "public_class_method",
        ].includes(s.name) &&
        s.args.some((a: N) => a.k === "def")
      ) {
        for (const a of s.args) if (a.k === "def") out.push(a);
        if (s.args.some((a: N) => a.k !== "def")) out.push(s);
      } else out.push(s);
    }
    return out;
  }

  emitMethod(
    d: N,
    u: Unit,
    f: FileCtx,
    opts: {
      static: boolean;
      module: boolean;
      vis: string;
      asFunction?: boolean;
      selfExpr?: string;
      objectMember?: boolean;
      /** A synthesized constructor: the chain after the module body `d` is. */
      inlineChain?: InlineHook[];
      /** `d` is a module's `initialize` written as this class's constructor. */
      inlinedHead?: InlineHook;
    },
  ): string {
    const isCtor = !opts.static && !opts.module && d.name === "initialize";
    const usesYield = (() => {
      let y = false;
      walk(d.body, (n) => {
        if (n.k === "yield" || (n.k === "call" && n.recv === null && n.name === "block_given?"))
          y = true;
        if (n.k === "def") return false;
      });
      return y;
    })();
    const params: Param[] = [...d.params];
    // CLAUDE.md "`$!` is passed explicitly": a constructor that reads the
    // exception being rescued takes it as a trailing `errinfo` parameter.
    const readsErrinfo =
      isCtor &&
      (() => {
        let y = false;
        walk(d.body, (n) => {
          if (n.k === "gvar" && n.name === "$!") y = true;
          if (n.k === "def") return false;
        });
        return y;
      })();
    if (readsErrinfo) {
      params.push({ kind: "opt", name: "errinfo", default: { k: "nil" } } as Param);
      this.index.errinfoCtors.add(u.fqn);
    }
    const blkParam = params.find((p) => p.kind === "block");
    if (usesYield && !blkParam) params.push({ kind: "block", name: "block" });
    const ctx = this.baseCtx(u, f, {
      selfKind: opts.static ? "static" : opts.module ? "module" : "instance",
      defName: d.name,
      defParams: params,
      singleton: opts.static,
      isModule: opts.module,
      isCtor,
      ...(readsErrinfo ? { errinfoParam: "errinfo" } : {}),
      ...(isCtor
        ? { inlineChain: opts.inlineChain ?? this.initializeChain(u.fqn), inlined: [] }
        : {}),
      blockVar: params.some((p) => p.kind === "block")
        ? jsIdent((params.find((p) => p.kind === "block")?.name as string) ?? "block")
        : undefined,
      ...(opts.selfExpr ? { selfExpr: opts.selfExpr } : {}),
    });
    const twin = isCtor ? undefined : this.handTwin(u, d.name, opts);
    if (twin?.info.async) ctx.defAsync = true;
    const ps = this.lw.paramList(params, ctx, false);
    // Seed parameter types from the hand twin's declared parameter types.
    if (twin?.info.params) {
      const positional = params.filter((p) => p.kind === "req" || p.kind === "opt");
      positional.forEach((p, i) => {
        const t = twin.info.params![i];
        if (p.name && t) (ctx.scope.types ??= new Map()).set(p.name, t);
      });
    }
    // An ActiveJob serializer's `serialize(arg)` is reached only for an
    // `arg.is_a?(klass)` (ObjectSerializer#serialize?): its parameter has the type
    // of the dependency class `klass` answers (`ActiveSupport::Duration`).
    if (d.name === "serialize" && !opts.static && params[0]?.name) {
      const kd = this.index.scopes.get(u.fqn)?.defs.get("klass")?.node;
      const body = kd ? this.lw.seqBody(kd.body) : [];
      if (body.length === 1 && body[0].k === "const") {
        const path = body[0].path.filter((x: string) => x);
        // A Ruby core class is ruby-compat's (`Range`, `Module`).
        const core: Record<string, string> = {
          Range: "@ruby-compat/range.ts#Range",
          Module: "@ruby-compat/include.ts#Module",
        };
        const key = (path.length === 1 && core[path[0]]) || this.lw.resolver.types.depClass(path);
        if (key) (ctx.scope.types ??= new Map()).set(params[0].name, { k: "class", key } as any);
      }
    }
    // A writer (`name=`, `[]=`) answers its argument, not its body; an operator
    // spelled with `=` (`==`, `<=`) answers its body.
    const writer = /^(\w+|\[\])=$/.test(d.name);
    let body = this.lw.block(this.lw.seqBody(d.body), ctx, !isCtor && !writer);
    if (ctx.prologue) body = [...ctx.prologue, ...body];
    const hoisted: Set<string> | undefined = ctx.scope.hoisted;
    if (hoisted?.size)
      body = [`let ${[...hoisted].map((h) => `${jsIdent(h)}: any`).join(", ")};`, ...body];
    if (isCtor && u.superclass && !body.some((l) => /\bsuper\(/.test(l))) {
      // Ruby's `initialize` never calls `super`, so the parent's never runs;
      // JS must call it. Pass `undefined` (Ruby's unset ivars read `nil`) for
      // each argument the nearest gem `initialize` up the chain requires.
      const req = this.inheritedInitializeArity(u.fqn);
      body = [
        `super(${Array.from({ length: req }, () => "undefined as never").join(", ")});`,
        ...body,
      ];
    }
    if (isCtor) {
      // JS forbids `this` before `super()`; Ruby often sets ivars first. Hoist the
      // super call when its arguments do not read `this` (CLAUDE.md, the
      // sanctioned reorder).
      // `@file = StringIO.new; super(@file)`: an ivar set only to be passed up
      // is computed into a local ahead of `super`, and set right after it.
      {
        const si0 = body.findIndex((l) => /^super\(.*\);$/.test(l));
        if (si0 > 0)
          for (let k = si0 - 1; k >= 0; k--) {
            const m = /^\(this\.(_\w+) = (.*)\);$/.exec(body[k]);
            if (!m || !body[si0].includes(`this.${m[1]}`) || /\bthis\b/.test(m[2])) continue;
            const local = m[1].slice(1);
            body[si0] = body[si0].split(`this.${m[1]}`).join(local);
            body.splice(si0 + 1, 0, `this.${m[1]} = ${local};`);
            body[k] = `const ${local} = ${m[2]};`;
          }
      }
      const si = body.findIndex((l) => /^super\(/.test(l));
      if (si >= 0 && /\bthis\b/.test(body[si]))
        f.declines.push({
          reason: "this-before-super",
          line: d.l,
          ruby: "super(...) arguments read self",
        });
      // An inlined module `initialize` (a top-level `{ … }` segment) whose first
      // statement is the JS `super(...)` moves as a whole, ahead of the first
      // `this`: the hand port's order for `SerializeCastValue#initialize`
      // (normalization.ts), and the same sanctioned reorder.
      {
        const b = body.findIndex(
          (l, k) =>
            l === "{" &&
            /^\s*super\(.*\);$/.test(body[k + 1] ?? "") &&
            !/\bthis\b/.test(body[k + 1]),
        );
        const ft = body.findIndex((l) => /\bthis\b/.test(l));
        if (b > 0 && ft >= 0 && ft < b) {
          const e = body.indexOf("}", b);
          if (e > b)
            body = [
              ...body.slice(0, ft),
              ...body.slice(b, e + 1),
              ...body.slice(ft, b),
              ...body.slice(e + 1),
            ];
        }
      }
      const i = body.findIndex((l) => /^super\(.*\);$/.test(l));
      const firstThis = body.findIndex((l) => /\bthis\b/.test(l));
      if (i > 0 && firstThis >= 0 && firstThis < i && !/\bthis\b/.test(body[i]))
        body = [
          ...body.slice(0, firstThis),
          body[i],
          ...body.slice(firstThis, i),
          ...body.slice(i + 1),
        ];
    }
    // The hand port's twin of this def decides what Ruby cannot: async or not,
    // getter or method, and the exact spelling.
    const awaits = ctx.asyncBox!.awaits;
    // Record an async gem method, so the next emission pass awaits its callers
    // (cli.ts runs passes until no new method turns async).
    if (!isCtor && (awaits || twin?.info.async))
      this.resolver.asyncDefs.add(`${u.fqn}${opts.static ? "." : "#"}${d.name}`);
    const asy = !isCtor && (awaits || twin?.info.async) ? "async " : "";
    if (twin) f.stats["hand-twin"] = (f.stats["hand-twin"] ?? 0) + 1;
    if (twin?.info.async) f.stats["async-def"] = (f.stats["async-def"] ?? 0) + 1;
    // `Mod::ClassMethods#new` hooks. Their `self` is the class being built
    // (`new.target`), and their bare `super` is `Class#new`.
    // - Tail (`super.deduplicate`, deduplicable.rb:13-15): `Klass.new` answers
    //   what the hook makes of the built object, so the constructor returns it,
    //   for this class only (a subclass's constructor still runs after `super()`).
    // - Head (`Inheritance::ClassMethods#new`): the hook decides before anything
    //   is built, answering `super` (carry on constructing) or another object;
    //   CLAUDE.md, "A record is built with `new Klass` only".
    const newHooks = isCtor ? this.classMethodsNewHooks(u.fqn) : [];
    const exportName = this.resolver.exportNames.get(u.fqn)?.name;
    const head: string[] = [];
    if (newHooks.length && exportName) {
      for (const h of newHooks) {
        let supers = 0;
        let recvSupers = 0;
        walk(h.def.body, (n) => {
          if (n.k === "call" && n.recv?.k === "super") recvSupers++;
          if (n.k === "super") supers++;
        });
        const recvSuper = recvSupers > 0;
        const bareSuper = supers > recvSupers;
        const scope: Scope = { locals: new Set<string>(), parent: ctx.scope };
        const nctx = this.lw.child(ctx, {
          scope,
          fnScope: scope,
          superIsSelf: true,
          inlineChain: undefined,
          nested: false,
          selfKind: "static",
          selfExpr: "(new.target as any)",
          defParams: h.def.params,
        });
        let hb = this.lw.block(this.lw.seqBody(h.def.body), nctx, true);
        const hz: Set<string> | undefined = scope.hoisted;
        if (hz?.size) hb = [`let ${[...hz].map((x) => `${jsIdent(x)}: any`).join(", ")};`, ...hb];
        if (recvSuper && !bareSuper)
          body = [...body, `if (new.target === ${exportName}) {`, ...indent(hb), "}"];
        else {
          // The `super` arm carries on constructing: its `return this;` goes, and
          // an `else` left empty by that goes with it.
          const kept = hb.filter((l) => !/^\s*return this;$/.test(l));
          for (let i = 0; i < kept.length; i++) {
            if (/\} else \{$/.test(kept[i]) && /^\s*\}$/.test(kept[i + 1] ?? "")) {
              kept[i] = kept[i].replace(/ else \{$/, "");
              kept.splice(i + 1, 1);
            }
          }
          head.push(...kept);
        }
      }
    }
    if (head.length) body = [...head, ...body];
    let doc = opts.vis !== "public" ? "/** @internal */\n" : "";
    if (isCtor) {
      const hooks = [
        ...(exportName ? newHooks : []),
        ...(opts.inlinedHead ? [opts.inlinedHead] : []),
        ...(ctx.inlined ?? []),
      ];
      const tags = this.inlinedFromTags(hooks, f.rubyFile);
      if (tags.length)
        doc =
          tags.length === 1
            ? `/** ${tags[0]} */\n`
            : `/**\n${tags.map((t) => ` * ${t}`).join("\n")}\n */\n`;
    }
    const isWriter = /^[a-z_]\w*=$/.test(d.name);
    let tsName = isCtor
      ? "constructor"
      : d.name === "new"
        ? "new"
        : (twin?.tsName ?? tsMethodName(d.name, u.fqn, opts.static));
    // A module/object writer beside its reader is `setX` (conventions doc,
    // "Setter-form details"); a class writer becomes a `set x` accessor below.
    if (isWriter && (opts.module || opts.objectMember) && !tsName.startsWith("set"))
      tsName = "set" + tsName[0].toUpperCase() + tsName.slice(1);
    if (
      twin?.info.kind === "get" &&
      !awaits &&
      d.params.length === 0 &&
      !opts.asFunction &&
      !/=$/.test(d.name)
    ) {
      f.stats["getter-from-twin"] = (f.stats["getter-from-twin"] ?? 0) + 1;
      const mod = opts.objectMember ? "" : opts.static ? "static " : "";
      return `${doc}${mod}get ${propKey(tsName)}(): any {\n${indent(body).join("\n")}\n}`;
    }
    const thisParam = opts.module ? (ps ? "this: any, " : "this: any") : "";
    const ret = isCtor ? "" : asy ? ": Promise<any>" : ": any";
    if (/^[a-z_]\w*=$/.test(d.name) && opts.asFunction) {
      const fnName = tsName.startsWith("set")
        ? tsName
        : "set" + tsName[0].toUpperCase() + tsName.slice(1);
      const tp = opts.module ? (ps ? "this: any, " : "this: any") : "";
      return `${doc}export ${asy}function ${fnName}(${tp}${ps})${ret} {\n${indent(body).join("\n")}\n}`;
    }
    if (
      /^[a-z_]\w*=$/.test(d.name) &&
      !opts.module &&
      !opts.objectMember &&
      !isCtor &&
      d.params.length === 1 &&
      (d.params[0].kind === "req" || d.params[0].kind === "opt") &&
      !tsName.startsWith("set") &&
      !awaits &&
      !twin?.info.async
    ) {
      // Ruby writer `x=` → TS setter `set x(v)`.
      return `${doc}${opts.static ? "static " : ""}set ${tsName}(${ps}) {\n${indent(body.filter((l) => !l.startsWith("return ")).concat()).join("\n")}\n}`;
    }
    if (
      /^[a-z_]\w*=$/.test(d.name) &&
      !awaits &&
      !twin?.info.async &&
      !tsName.startsWith("set") &&
      d.params.some((p: Param) => p.kind === "rest")
    ) {
      // A writer taking `*` (`def self.queue_adapter=(*)`) cannot be a TS setter,
      // which takes exactly one parameter: the `setX()` spelling the gem's own
      // writers use, which it then overrides.
      const setName = "set" + tsName[0].toUpperCase() + tsName.slice(1);
      const mod = opts.objectMember ? "" : opts.static ? "static " : "";
      return `${doc}${mod}${setName}(${thisParam}${ps}): any {\n${indent(body).join("\n")}\n}`;
    }
    if (/^[a-z_]\w*=$/.test(d.name) && (awaits || twin?.info.async) && !tsName.startsWith("set")) {
      // CLAUDE.md: a Ruby `x=` that must be async keeps its name as `setX()`.
      const setName = "set" + tsName[0].toUpperCase() + tsName.slice(1);
      const mod = opts.objectMember ? "" : opts.static ? "static " : "";
      return `${doc}${mod}async ${setName}(${thisParam}${ps}): Promise<any> {\n${indent(body).join("\n")}\n}`;
    }
    if (opts.asFunction)
      return `${doc}export ${asy}function ${tsName}(${thisParam}${ps})${ret} {\n${indent(body).join("\n")}\n}`;
    const mod = opts.objectMember
      ? ""
      : `${opts.static ? "static " : ""}${opts.vis === "protected" || opts.vis === "private" ? "protected " : ""}`;
    return `${doc}${mod}${asy}${propKey(tsName)}(${thisParam}${ps})${ret} {\n${indent(body).join("\n")}\n}`;
  }

  handTwin(u: Unit, rubyName: string, opts: { static: boolean; asFunction?: boolean }) {
    const exp = this.resolver.exportNames.get(u.fqn);
    if (opts.asFunction && exp) {
      const fns = this.resolver.types.o.functions[exp.tsFile] ?? {};
      for (const c of candidates(rubyName))
        if (fns[c]) return { tsName: c, info: fns[c], owner: exp.tsFile };
      return undefined;
    }
    const key = this.resolver.oracleKey(u.fqn);
    if (!key) return undefined;
    const m = this.resolver.types.member(key, rubyName, opts.static);
    return m && (m.owner === key || m.owner.endsWith("#*")) ? m : undefined;
  }

  emitClass(u: Unit, name: string, f: FileCtx): { text: string; defs: number } {
    const members: string[] = [];
    const after: string[] = [];
    const staticStmts: N[] = [];
    let defs = 0;
    const body = this.flattenDefs(u.body);
    const vis = this.visibilityOf(body);
    const ctxStatic = this.baseCtx(u, f, { selfKind: "static", selfExpr: "this" });
    let ext = "";
    if (u.superclass) {
      const sc = this.lw.expr(
        u.superclass,
        this.baseCtx(u, f, { nesting: u.nesting.slice(0, -1) }),
      );
      ext = ` extends ${sc}`;
    }
    const attrNames = new Set<string>();
    if (u.struct) {
      const ms = u.struct.members.map((m) => propName(m.replace(/[?!]$/, "")));
      const hasInit = body.some((s) => s.k === "def" && s.name === "initialize");
      if (!hasInit) {
        const ids = u.struct.members.map((m) => jsIdent(m.replace(/[?!]$/, "")));
        const ps = u.struct.keyword_init
          ? `{ ${ids.join(", ")} }: any = {}`
          : ids.map((m) => `${m}: any = null`).join(", ");
        members.push(
          `constructor(${ps}) {\n${indent(ms.map((m, i) => `this._${m.replace(/^_/, "")} = ${ids[i]};`)).join("\n")}\n}`,
        );
      }
      for (const [i, m] of ms.entries()) {
        attrNames.add(u.struct.members[i]);
        members.push(`get ${m}(): any {\n  return this._${m.replace(/^_/, "")};\n}`);
        members.push(`set ${m}(value: any) {\n  this._${m.replace(/^_/, "")} = value;\n}`);
        defs++;
      }
      members.push(
        `toA(): any[] {\n  return [${ms.map((m) => `this._${m.replace(/^_/, "")}`).join(", ")}];\n}`,
      );
    }
    // No `initialize` of its own, but an included module has one: Ruby's
    // `Class#new` runs that body, so it is this class's constructor.
    if (!u.struct && !body.some((s) => s.k === "def" && s.name === "initialize" && !s.singleton)) {
      const [head, ...restChain] = this.initializeChain(u.fqn);
      if (head) {
        defs++;
        members.push(
          this.emitMethod(head.def, u, f, {
            static: false,
            module: false,
            vis: "public",
            inlineChain: restChain,
            inlinedHead: head,
          }),
        );
      }
    }
    // A zero-argument reader `def x` beside `attr_writer :x` (TestAdapter's
    // memoized `enqueued_jobs`) is one accessor: CLAUDE.md "Generated attribute
    // readers are properties", so the reader is a `get` the writer pairs with.
    const writerNames = new Set<string>(
      body
        .filter((s: N) => s.k === "call" && s.recv === null && s.name === "attr_writer")
        .flatMap((s: N) => s.args.filter((a: N) => a.k === "sym").map((a: N) => a.value)),
    );
    for (const s of body) {
      if (s.k === "def") {
        defs++;
        let text = this.emitMethod(s, u, f, {
          static: s.singleton,
          module: false,
          vis: vis.get(s) ?? "public",
        });
        if (!s.singleton && s.params.length === 0 && writerNames.has(s.name))
          text = text.replace(
            /^((?:\/\*\*[^]*?\*\/\n)?(?:protected )?)(?!async )([\w$]+)\(\)/,
            "$1get $2()",
          );
        members.push(text);
      } else if (s.k === "casgn" && s.path?.length === 1) {
        members.push(`static ${s.path[0]}: any = ${this.lw.expr(s.value, ctxStatic)};`);
      } else if (
        s.k === "call" &&
        s.recv === null &&
        /^attr_(reader|accessor|writer)$|^attr$/.test(s.name)
      ) {
        for (const a of s.args) {
          if (a.k !== "sym" || attrNames.has(a.value)) continue;
          attrNames.add(a.value);
          const js = propName(a.value);
          if (s.name !== "attr_writer")
            members.push(`get ${js}(): any {\n  return this._${js.replace(/^_/, "")};\n}`);
          if (s.name !== "attr_reader" && s.name !== "attr")
            members.push(`set ${js}(value: any) {\n  this._${js.replace(/^_/, "")} = value;\n}`);
          defs++;
        }
      } else if (
        s.k === "call" &&
        s.recv === null &&
        ["include", "extend", "prepend"].includes(s.name)
      ) {
        for (const a of s.args) {
          if (a.k === "const" && a.path.join("::").endsWith("ActiveSupport::Concern")) continue;
          // Ruby's stdlib `Singleton` (`singleton.rb`) is the hand port's static
          // `instance()` memoized on the class's own property
          // (activejob serializers/object-serializer.ts).
          if (
            s.name === "include" &&
            a.k === "const" &&
            a.path.filter((x: string) => x).join("::") === "Singleton"
          ) {
            members.push(
              `static instance(this: any): any {\n  if (!Object.hasOwn(this, "_instance")) {\n    Object.defineProperty(this, "_instance", { value: new this() });\n  }\n  return this._instance;\n}`,
            );
            continue;
          }
          const fn = this.lw.rc(ctxStatic, s.name === "prepend" ? "prepend" : s.name);
          after.push(`${fn}(${name}, ${this.lw.expr(a, ctxStatic)});`);
        }
      } else if (
        s.k === "call" &&
        s.recv === null &&
        [
          "private",
          "protected",
          "public",
          "private_constant",
          "module_function",
          "private_class_method",
          "public_class_method",
          "require",
          "require_relative",
          "autoload",
          "eager_autoload",
        ].includes(s.name)
      ) {
        continue;
      } else if (
        s.k === "alias" ||
        (s.k === "call" && s.recv === null && s.name === "alias_method" && s.args.length === 2)
      ) {
        const [nw, old] = s.k === "alias" ? [s.new, s.old] : [s.args[0].value, s.args[1].value];
        if (typeof nw !== "string" || typeof old !== "string" || ["initialize", "new"].includes(nw))
          continue;
        members.push(
          (() => {
            const [ps, as] = this.aliasSignature(u.fqn, old, false);
            return `${propKey(tsMethodName(nw, u.fqn))}(${ps}): any {\n  return this.${tsMethodName(old, u.fqn)}(${as});\n}`;
          })(),
        );
        defs++;
      } else if (s.k === "call" && s.recv === null && s.name === "delegate") {
        members.push(...this.delegate(s, u, f, false));
      } else {
        staticStmts.push(s);
      }
    }
    for (const s of this.flattenDefs(u.sbody)) {
      if (
        s.k === "call" &&
        s.recv === null &&
        ["include", "prepend"].includes(s.name) &&
        s.args.length
      ) {
        // `class << self; include M; end` on a class mixes M into its
        // metaclass, which a JS class does not have (CLAUDE.md, "`singleton_class`
        // is a per-object subclass"), and `extend` would fire M's `extended`
        // hook instead of `append_features` / `included`. No Rails site reaches
        // this (audit module-singleton-callbacks); decline rather than guess.
        after.push(
          `${this.lw.decline(ctxStatic, "sclass-include-on-class", s, `class << self; ${s.name}`)};`,
        );
        continue;
      }
      if (s.k === "def") {
        defs++;
        members.push(this.emitMethod(s, u, f, { static: true, module: false, vis: "public" }));
      } else if (
        s.k === "call" &&
        s.recv === null &&
        /^attr_(reader|accessor|writer)$/.test(s.name)
      ) {
        for (const a of s.args) {
          if (a.k !== "sym") continue;
          const js = propName(a.value);
          if (s.name !== "attr_writer")
            members.push(`static get ${js}(): any {\n  return this._${js.replace(/^_/, "")};\n}`);
          if (s.name !== "attr_reader")
            members.push(
              `static set ${js}(value: any) {\n  this._${js.replace(/^_/, "")} = value;\n}`,
            );
          defs++;
        }
      } else if (s.k === "alias" || (s.k === "call" && s.name === "alias_method")) {
        const [nw, old] = s.k === "alias" ? [s.new, s.old] : [s.args[0]?.value, s.args[1]?.value];
        if (typeof nw === "string" && typeof old === "string")
          members.push(
            (() => {
              const [ps, as] = this.aliasSignature(u.fqn, old, true);
              return `static ${propKey(tsMethodName(nw, u.fqn, true))}(${ps}): any {\n  return this.${tsMethodName(old, u.fqn, true)}(${as});\n}`;
            })(),
          );
      } else if (s.k === "call" && s.recv === null && s.name === "delegate") {
        members.push(...this.delegate(s, u, f, false).map((m) => "static " + m));
      } else if (
        s.k === "call" &&
        s.recv === null &&
        ["private", "protected", "public"].includes(s.name)
      ) {
        continue;
      } else {
        staticStmts.push(s);
      }
    }
    // The hand port seats each class for `constantize` (registerConstant).
    after.unshift(
      `${this.lw.rc(ctxStatic, "registerConstant")}(${JSON.stringify(u.fqn)}, ${name});`,
    );
    // Executable class-body statements (macros, run_load_hooks) run after the
    // declaration and its include/extend lines, with `self` the class.
    if (staticStmts.length) {
      const sc = this.baseCtx(u, f, { selfKind: "static", selfExpr: name });
      const lines = this.lw.block(staticStmts, sc, false);
      const hoisted: Set<string> | undefined = sc.scope.hoisted;
      if (hoisted?.size)
        lines.unshift(`let ${[...hoisted].map((h) => `${jsIdent(h)}: any`).join(", ")};`);
      if (lines.length) after.push(`{\n${indent(lines).join("\n")}\n}`);
    }
    const head = `export class ${name}${ext} {`;
    const sig = ["[key: string]: any;", "static [key: string]: any;"];
    const text = [
      head,
      ...indent([...sig, ...dedupeMembers(members).flatMap((m) => ["", m])]),
      "}",
      ...after,
    ].join("\n");
    return { text, defs };
  }

  delegate(s: N, u: Unit, f: FileCtx, module: boolean): string[] {
    const opts = s.args.find((a: N) => a.k === "kwargs");
    const to = opts?.pairs.find((p: any) => p.key?.value === "to")?.value;
    const prefix = opts?.pairs.find((p: any) => p.key?.value === "prefix")?.value;
    const allowNil =
      opts?.pairs.find((p: any) => p.key?.value === "allow_nil")?.value?.k === "true";
    if (!to || (to.k !== "sym" && to.k !== "str")) return [];
    const target = to.value as string;
    // The delegated call is lowered as IR (`target.m(*args)`), so the target's
    // read and the delegated member go through typed dispatch like any call.
    const targetIr: N = target.startsWith("@")
      ? { k: "ivar", name: target }
      : { k: "call", recv: null, name: target, args: [], block: null, safe: false };
    const out: string[] = [];
    for (const a of s.args) {
      if (a.k !== "sym") continue;
      const m = a.value as string;
      const pre =
        prefix?.k === "true" ? `${target}_` : prefix?.k === "sym" ? `${prefix.value}_` : "";
      const nm = tsMethodName(pre + m, u.fqn);
      const thisP = module ? "this: any, " : "";
      // `delegate :x, :x=, to: :t` delegates an attribute: the reader reads the
      // target's property and the writer (`setX`) assigns it.
      const names = new Set(s.args.filter((x: N) => x.k === "sym").map((x: N) => x.value));
      const attrPair = m.endsWith("=") ? names.has(m.slice(0, -1)) : names.has(m + "=");
      if (attrPair) {
        const rctx = this.baseCtx(u, f, {
          selfKind: module ? "module" : "instance",
          isModule: module,
        });
        const t = this.lw.expr(targetIr, rctx);
        const prop = propName(pre + m.replace(/=$/, ""));
        if (m.endsWith("="))
          out.push(
            `set${prop[0].toUpperCase()}${prop.slice(1)}(${thisP}value: any): any {\n  return (${t}.${prop} = value);\n}`,
          );
        else out.push(`${nm}(${thisP.replace(/, $/, "")}): any {\n  return ${t}.${prop};\n}`);
        continue;
      }
      if (m.endsWith("=")) continue;
      const ctx = this.baseCtx(u, f, {
        selfKind: module ? "module" : "instance",
        isModule: module,
        asyncBox: { awaits: false },
      });
      ctx.scope.locals.add("args");
      (ctx.scope.types ??= new Map()).set("args", { k: "array", el: null });
      const call: N = {
        k: "call",
        recv: targetIr,
        name: m,
        args: [{ k: "splat", value: { k: "lvar", name: "args" } }],
        block: null,
        safe: allowNil,
      };
      const e = this.lw.expr(call, ctx);
      const asy = ctx.asyncBox!.awaits ? "async " : "";
      out.push(
        `${asy}${nm}(${thisP}...args: any[]): ${asy ? "Promise<any>" : "any"} {\n  return ${e};\n}`,
      );
    }
    return out;
  }

  emitModule(u: Unit, name: string, f: FileCtx): { text: string; defs: number } {
    const fileFns: Set<string> = (f.fileFns ??= new Set<string>());
    const members: string[] = [];
    const fns: string[] = [];
    const after: string[] = [];
    const tops: N[] = [];
    let defs = 0;
    const body = this.flattenDefs(u.body);
    const vis = this.visibilityOf(body);
    const isModuleFunction = body.some(
      (s) =>
        s.k === "call" && s.recv === null && s.name === "module_function" && s.args.length === 0,
    );
    const extendSelf = body.some(
      (s) => s.k === "call" && s.recv === null && s.name === "extend" && s.args[0]?.k === "self",
    );
    const ctxTop = this.baseCtx(u, f, { selfKind: "static", selfExpr: name });
    let includedBlock: N | null = null;
    // A mixin module's `attr_*` are instance accessors on every includer:
    // ruby-compat `Module#attrReader` / `#attrWriter` (`rb_mod_attr_reader`).
    const modAttrs: string[] = [];
    for (const s of body) {
      if (
        !isModuleFunction &&
        !extendSelf &&
        s.k === "call" &&
        s.recv === null &&
        /^attr_(reader|accessor|writer)$/.test(s.name)
      ) {
        const names = s.args
          .filter((a: N) => a.k === "sym")
          .map((a: N) => JSON.stringify(propName(a.value)));
        if (names.length) {
          if (s.name !== "attr_writer") modAttrs.push(`mod.attrReader(${names.join(", ")});`);
          if (s.name !== "attr_reader") modAttrs.push(`mod.attrWriter(${names.join(", ")});`);
          defs += names.length;
          continue;
        }
      }
      // A module `initialize` some class inlines has no function of its own
      // (CLAUDE.md: trails has no `initialize` methods).
      if (
        s.k === "def" &&
        s.name === "initialize" &&
        !s.singleton &&
        this.inlinedModules().has(u.fqn)
      )
        continue;
      if (s.k === "def") {
        defs++;
        if (s.singleton || isModuleFunction || extendSelf)
          fns.push(
            this.emitMethod(s, u, f, {
              static: true,
              module: false,
              vis: "public",
              asFunction: true,
              selfExpr: name,
            }),
          );
        else {
          // CLAUDE.md "Module mixins": a module method is an exported
          // `this`-typed function; the module object references it.
          const fnText = this.emitMethod(s, u, f, {
            static: false,
            module: true,
            vis: vis.get(s) ?? "public",
            asFunction: true,
          });
          const fnName = fnText.match(/export (?:async )?function ([\w$]+)\(/)?.[1];
          if (fnName && !RESERVED.has(fnName) && !fileFns.has(fnName)) {
            fileFns.add(fnName);
            fns.push(fnText);
            members.push(fnName);
          } else {
            members.push(
              this.emitMethod(s, u, f, {
                static: false,
                module: true,
                vis: vis.get(s) ?? "public",
                objectMember: true,
              }),
            );
          }
        }
      } else if (s.k === "casgn" && s.path?.length === 1) {
        fns.push(`export const ${s.path[0]}: any = ${this.lw.expr(s.value, ctxTop)};`);
      } else if (
        s.k === "call" &&
        s.recv === null &&
        s.name === "included" &&
        s.block?.k === "block"
      ) {
        includedBlock = s.block;
      } else if (
        s.k === "call" &&
        s.recv === null &&
        s.name === "extend" &&
        s.args.some(
          (a: N) => a.k === "const" && a.path.join("::").endsWith("ActiveSupport::Concern"),
        )
      ) {
        continue;
      } else if (
        s.k === "call" &&
        s.recv === null &&
        [
          "private",
          "protected",
          "public",
          "private_constant",
          "module_function",
          "private_class_method",
          "require",
          "require_relative",
        ].includes(s.name)
      ) {
        continue;
      } else if (s.k === "call" && s.recv === null && s.name === "delegate") {
        members.push(...this.delegate(s, u, f, true));
      } else if (
        s.k === "alias" ||
        (s.k === "call" && s.recv === null && s.name === "alias_method" && s.args.length === 2)
      ) {
        const [nw, old] = s.k === "alias" ? [s.new, s.old] : [s.args[0].value, s.args[1].value];
        if (typeof nw === "string" && typeof old === "string")
          members.push(
            (() => {
              const [ps, as] = this.aliasSignature(u.fqn, old, false);
              return `${propKey(tsMethodName(nw, u.fqn))}(${["this: any", ps].filter(Boolean).join(", ")}): any {\n  return this.${tsMethodName(old, u.fqn)}(${as});\n}`;
            })(),
          );
      } else {
        tops.push(s);
      }
    }
    const sclassStmts: N[] = [];
    for (const s of this.flattenDefs(u.sbody)) {
      if (s.k === "def") {
        defs++;
        fns.push(
          this.emitMethod(s, u, f, {
            static: true,
            module: false,
            vis: "public",
            asFunction: true,
            selfExpr: name,
          }),
        );
      } else if (
        s.k === "call" &&
        s.recv === null &&
        /^attr_(reader|accessor|writer)$/.test(s.name)
      ) {
        for (const a of s.args) {
          if (a.k !== "sym") continue;
          const js = propName(a.value);
          if (s.name !== "attr_writer")
            fns.push(`export function ${js}(): any {\n  return ${name}._${js};\n}`);
          if (s.name !== "attr_reader")
            fns.push(
              `export function set${js[0].toUpperCase()}${js.slice(1)}(value: any): any {\n  return (${name}._${js} = value);\n}`,
            );
          defs++;
        }
      } else if (
        s.k === "call" &&
        s.recv === null &&
        ["private", "protected", "public"].includes(s.name)
      )
        continue;
      // `delegate :m, to: :t` in `class << self` defines singleton methods:
      // each is `def m(*args, &block) = t.m(*args, &block)`, a module function.
      else if (s.k === "call" && s.recv === null && s.name === "delegate") {
        for (const d of delegateDefs(s)) {
          defs++;
          fns.push(
            this.emitMethod(d, u, f, {
              static: true,
              module: false,
              vis: "public",
              asFunction: true,
              selfExpr: name,
            }),
          );
        }
      }
      // Any other statement in `class << self` (`include M`, `define_callbacks`)
      // runs with `self` the module's singleton class: `rbObjSingletonClass(X)`,
      // bound once (audit module-singleton-callbacks, shape A). `include M` there
      // is `include(singleton, M)`, never `extend(X, M)`: the two differ for any
      // M with `included` / `append_features` hooks, which is every Concern.
      else sclassStmts.push(s);
    }
    if (sclassStmts.length) {
      const scVar = `${name}Singleton`;
      const tc = this.baseCtx(u, f, { selfKind: "static", selfExpr: scVar });
      const lines = this.lw.block(sclassStmts, tc, false);
      const hoisted: Set<string> | undefined = tc.scope.hoisted;
      if (hoisted?.size)
        lines.unshift(`let ${[...hoisted].map((h) => `${jsIdent(h)}: any`).join(", ")};`);
      if (lines.some((l) => l.includes(scVar))) {
        const soc = this.lw.rc(tc, "rbObjSingletonClass");
        after.push(`const ${scVar}: any = ${soc}(${name});`);
      }
      after.push(...lines);
    }
    const isConcern = body.some(
      (s) =>
        s.k === "call" &&
        s.recv === null &&
        s.name === "extend" &&
        s.args.some(
          (a: N) => a.k === "const" && a.path.join("::").endsWith("ActiveSupport::Concern"),
        ),
    );
    let incl = "";
    if (includedBlock) {
      const ic = this.baseCtx(u, f, { selfKind: "static", selfExpr: "base" });
      const lines = this.lw.block(this.lw.seqBody(includedBlock.body), ic, false);
      const hoisted: Set<string> | undefined = ic.scope.hoisted;
      if (hoisted?.size)
        lines.unshift(`let ${[...hoisted].map((h) => `${jsIdent(h)}: any`).join(", ")};`);
      if (isConcern) {
        // `ActiveSupport::Concern#included` registers the block, and its
        // `append_features` runs it on the includer (the hand port's shape,
        // actionpack abstract-controller/caching.ts).
        incl = `${name}.included(null, function (this: any): void {\n${indent(["const base = this;", ...lines]).join("\n")}\n});`;
      } else {
        const sym = this.lw.rc(ic, "included");
        incl = `${name}[${sym}] = function (base: any): void {\n${indent(lines).join("\n")}\n};`;
      }
    }
    // The module's singleton methods (`class << self` / `def self.x` / singleton
    // attrs) are exported functions; they are also seated on the module object,
    // so `X.m(...)` answers as Ruby's `X.m` does (the hand port's
    // `Object.assign(Serializers, { serialize, … })`, activejob serializers.ts).
    // A `this`-typed function is an instance mixin method and stays off it.
    const seatNames = [
      ...new Set(
        fns
          .map(
            (t) =>
              /^(?:\/\*\*[\s\S]*?\*\/\n)?export (?:async )?function (\w+)\((?!this\b)/.exec(t)?.[1],
          )
          .filter((x): x is string => !!x),
      ),
    ];
    const seatLine = seatNames.length ? `Object.assign(${name}, { ${seatNames.join(", ")} });` : "";
    // `extend ActiveSupport::Concern` first, so a concern this module includes
    // records a dependency instead of running against the module itself.
    const concernLine = isConcern
      ? `${this.lw.rc(this.baseCtx(u, f, {}), "extend")}(${name}, ${this.lw.as(this.baseCtx(u, f, {}), "Concern")});`
      : "";
    // The module is a ruby-compat `Module` (the hand port's `new Module((mod) =>
    // mod.defineMethod(...))` shape), so `superMethod` can resolve a module `super`.
    // A zero-argument reader whose writer another gem scope declares (`def priority`
    // in QueuePriority, `attr_writer :priority` in Core) is the getter half of one
    // accessor: seated on the carrier with `moduleEval`, where ruby-compat pairs it
    // with the includer's writer (trails#8993, `defineAccessorHalf`).
    const readerHalves = new Set(
      u.body
        .filter(
          (d: N) =>
            d.k === "def" &&
            !d.singleton &&
            d.params.length === 0 &&
            this.index.instanceWriters.has(d.name),
        )
        .map((d: N) => tsMethodName(d.name, u.fqn)),
    );
    // A delegated attribute (`delegate :x, :x=, to: :t`) reads as a property too.
    for (const d of u.body)
      if (d.k === "call" && d.recv === null && d.name === "delegate") {
        const syms = d.args.filter((a: N) => a.k === "sym").map((a: N) => a.value as string);
        for (const a of syms) if (syms.includes(`${a}=`)) readerHalves.add(tsMethodName(a, u.fqn));
      }
    const defs2 = dedupeMembers(members).map((m) => {
      const line = toDefineMethod(m);
      const hit = /^mod\.defineMethod\("([\w$]+)", ([\w$]+|function[\s\S]*)\);$/.exec(line);
      return hit && readerHalves.has(hit[1])
        ? `mod.moduleEval((table: any) => Object.defineProperty(table, ${JSON.stringify(hit[1])}, { configurable: true, get: ${hit[2]} }));`
        : line;
    });
    const out: string[] = [...fns.flatMap((x) => [x, ""])];
    const ModuleRef = this.lw.rc(this.baseCtx(u, f, {}), "Module");
    const modLines = [...modAttrs, ...defs2];
    const ctorBody = modLines.length ? `(mod: any) => {\n${indent(modLines).join("\n")}\n}` : "";
    const modExpr = `new ${ModuleRef}(${ctorBody})`;
    // The gem's top namespace is seated by the hand port's `namespaces.ts`, a
    // plain object extended with `ActiveSupport::Autoload` (CLAUDE.md, "Call-time
    // constant resolution"); this file adds its module functions, not a second object.
    if (!ctorBody && handNamespaceFqns().get(u.fqn) === name) {
      // The same object, typed `any`: the generated module functions keep their
      // state on it (`X._x`), where the hand port uses module-level variables.
      const seat = this.lw.imp(this.baseCtx(u, f, {}), "@root/namespaces.js", name, `${name}Seat`);
      out.push(`export const ${name}: any = ${seat};`);
      if (seatLine) out.push(seatLine);
      if (concernLine) out.push(concernLine);
      if (incl) out.push(incl);
      if (tops.length) {
        const tc = this.baseCtx(u, f, { selfKind: "static", selfExpr: name });
        const lines = this.lw.block(tops, tc, false);
        if (lines.length) after.push(`{\n${indent(lines).join("\n")}\n}`);
      }
      return { text: [...out, ...after].join("\n"), defs };
    }
    // `X[included] = fn` at top level is the shape the extractor reads an
    // `included do` port from (includedHookOwner).
    out.push(`export const ${name}: any = ${modExpr};`);
    // A constant in the module body (`VERSION::STRING`) lives in the module's
    // constant table, as well as the file's flat export.
    {
      const cs = u.body.filter((s: N) => s.k === "casgn" && s.path?.length === 1);
      const set = cs.length ? this.lw.rc(this.baseCtx(u, f, {}), "rbModConstSet") : "";
      for (const c of cs) out.push(`${set}(${name}, ${JSON.stringify(c.path[0])}, ${c.path[0]});`);
    }
    if (seatLine) out.push(seatLine);
    if (concernLine) out.push(concernLine);
    if (incl) out.push(incl);
    if (tops.length) {
      const tc = this.baseCtx(u, f, { selfKind: "static", selfExpr: name });
      const lines = this.lw.block(tops, tc, false);
      const hoisted: Set<string> | undefined = tc.scope.hoisted;
      if (hoisted?.size)
        lines.unshift(`let ${[...hoisted].map((h) => `${jsIdent(h)}: any`).join(", ")};`);
      if (lines.length) after.push(`{\n${indent(lines).join("\n")}\n}`);
    }
    return { text: [...out, ...after].join("\n"), defs };
  }
}

void rubyMethodToTsIgnoringSkip;

/**
 * An object-literal member (shorthand reference, inline method, getter) as a
 * `mod.defineMethod(name, fn)` statement.
 */
function toDefineMethod(m: string): string {
  const doc = m.match(/^(\/\*\*[^]*?\*\/\n)/)?.[1] ?? "";
  const body = m.slice(doc.length);
  const short = body.match(/^([\w$]+)$/);
  if (short) return `${doc}mod.defineMethod(${JSON.stringify(short[1])}, ${short[1]});`;
  const mm = body.match(/^(async )?(get |set )?("[^"]+"|[\w$]+)\(/);
  if (!mm) return `${doc}/* unconverted */ void 0;`;
  const name = mm[3].startsWith('"') ? JSON.parse(mm[3]) : mm[3];
  const rest = body.slice(mm[0].length);
  return `${doc}mod.defineMethod(${JSON.stringify(name)}, ${mm[1] ?? ""}function (${rest});`;
}

/** A JS class must be declared before a class that extends it in the same file. */
function orderBySuperclass(units: Unit[], index: GemIndex): Unit[] {
  const byFqn = new Map(units.map((u) => [u.fqn, u]));
  const out: Unit[] = [];
  const seen = new Set<string>();
  const visit = (u: Unit) => {
    if (seen.has(u.fqn)) return;
    seen.add(u.fqn);
    const sup = index.scopes.get(u.fqn)?.superclassFqn;
    const su = sup ? byFqn.get(sup) : undefined;
    if (su) visit(su);
    out.push(u);
  };
  units.forEach(visit);
  return out;
}

/**
 * The `def`s a `delegate :a, :b, to: :t` (no `prefix:` / `allow_nil:`) stands
 * for: `def a(*args, &block) = t.a(*args, &block)`, as IR.
 */
function delegateDefs(s: N): N[] {
  const opts = s.args.find((a: N) => a.k === "kwargs");
  const to = opts?.pairs.find((p: any) => p.key?.value === "to")?.value;
  const other = opts?.pairs.some((p: any) => p.key?.value !== "to");
  if (!to || (to.k !== "sym" && to.k !== "str") || other) return [];
  const target = to.value as string;
  const recv: N = target.startsWith("@")
    ? { k: "ivar", name: target }
    : { k: "call", recv: null, name: target, args: [], block: null, safe: false };
  return s.args
    .filter((a: N) => a.k === "sym" && !String(a.value).endsWith("="))
    .map(
      (a: N): N => ({
        k: "def",
        name: a.value,
        singleton: false,
        params: [
          { kind: "rest", name: "args" },
          { kind: "block", name: "block" },
        ],
        body: {
          k: "call",
          recv,
          name: a.value,
          args: [{ k: "splat", value: { k: "lvar", name: "args" } }],
          block: { k: "blockpass", value: { k: "lvar", name: "block" } },
          safe: false,
        },
        l: s.l,
      }),
    );
}

/**
 * Ruby lets a later `def` (or an attr after a def) replace an earlier member of
 * the same name; a TS class body rejects the duplicate. Keep the last
 * definition, as Ruby does; a getter and setter of one name may coexist.
 */
export function dedupeMembers(members: string[]): string[] {
  const seen = new Map<string, Set<string>>();
  const out: string[] = [];
  for (let i = members.length - 1; i >= 0; i--) {
    const m = members[i];
    const head = m.replace(/^\/\*\*[^]*?\*\/\n/, "");
    const short = head.match(/^([\w$]+)$/);
    const mm = short
      ? [head, undefined, undefined, short[1]]
      : head.match(/^(static )?(?:protected )?(?:async )?(get |set )?("[^"]+"|[\w$]+)\s*\(/);
    if (!mm) {
      out.push(m);
      continue;
    }
    const key = `${mm[1] ?? ""}${mm[3]}`;
    const kind = (mm[2] ?? "method").trim();
    const kinds = seen.get(key) ?? new Set<string>();
    const clash = kind === "method" ? kinds.size > 0 : kinds.has("method") || kinds.has(kind);
    if (clash) continue;
    kinds.add(kind);
    seen.set(key, kinds);
    out.push(m);
  }
  return out.reverse();
}

/** The constant a receiver chain starts at (`ActiveJob::Base.queue_adapter` → `ActiveJob::Base`). */
function rootConst(n: N | null | undefined): N | undefined {
  while (n?.k === "call") n = n.recv;
  return n?.k === "const" ? n : undefined;
}
