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
import { VITEST_MATCHERS } from "./mappings/vitest-matchers.js";
import { rubyMethodToTsIgnoringSkip } from "../../parity/conventions.js";
import { TS_CONSTANT_RENAMES } from "./constant-renames.js";
import { TS_CLASS_RENAMES } from "../../parity/conventions.js";
import type { IrFile, N, Param } from "./ir.js";
import { walk } from "./ir.js";
import { GemIndex, lexicalChain, qualify, rubyAncestors, type ScopeInfo } from "./gem-index.js";
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

import { candidates, type TypeRef } from "./types.js";

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
  /** An RSpec spec: the constant `RSpec.describe` names (`described_class`). */
  describedClass?: N;
  /** An RSpec spec (`RSpec.describe`), as opposed to a Minitest one. */
  rspec?: boolean;
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

/** Constants whose every use is ruled out repo-wide, with the CLAUDE.md section that rules it. */
const PERMANENT_CONSTS: Record<string, string> = {
  Zeitwerk: 'CLAUDE.md "Trails has no autoloader (`Rails.autoloaders` / Zeitwerk)"',
};

/**
 * A blank line between the blocks of a test file's `describe` (each `it`, hook,
 * helper function, and the statements between them), as a hand-written suite
 * has; a test body keeps its own layout.
 */
function spaceBlocks(lines: string[]): string[] {
  const opener =
    /^(it|it\.\w+(\([^)]*\))?|beforeEach|afterEach|describe)\(|^\/\/ PERMANENT-SKIP|^(async )?function /;
  const ind = (l: string) => l.length - l.trimStart().length;
  const levels = new Set(lines.filter((l) => opener.test(l.trim())).map(ind));
  const out: string[] = [];
  // The indent of the `it` / hook whose body we are in, else -1.
  let body = -1;
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const prev = out[out.length - 1];
    const t = cur.trim();
    if (body >= 0) {
      out.push(cur);
      if (ind(cur) === body && /^\}\)/.test(t)) {
        body = -1;
        const next = lines[i + 1];
        if (next !== undefined && ind(next) === ind(cur) && !/^[})]/.test(next.trim()))
          out.push("");
      }
      continue;
    }
    if (
      prev !== undefined &&
      prev.trim() !== "" &&
      !prev.trimEnd().endsWith("{") &&
      !prev.trim().startsWith("// PERMANENT-SKIP") &&
      opener.test(t)
    )
      out.push("");
    out.push(cur);
    if (/^(it|it\.\w+(\([^)]*\))?|beforeEach|afterEach)\(/.test(t) && t.endsWith("{"))
      body = ind(cur);
    const next = lines[i + 1];
    if (next === undefined || !levels.has(ind(cur)) || ind(next) !== ind(cur)) continue;
    const nt = next.trim();
    if (/^[})]/.test(nt) || opener.test(nt)) continue;
    if (/^\}\)?;?$/.test(t) || (t.startsWith("let ") && !nt.startsWith("let "))) out.push("");
  }
  return out;
}

export class Emitter {
  /** Nested constants with no seat on their parent (see `emitFile`). */
  unseated: string[] = [];
  /** Concerns emitted as plain objects: their `ClassMethods` is extended from the `[included]` hook, not seated. */
  plainConcerns = new Set<string>();
  /** Modules emitted as plain objects: a nested constant is not seated on one (it has no constant table). */
  plainModules = new Set<string>();
  lw: Lowerer;
  constructor(
    readonly index: GemIndex,
    readonly resolver: Resolver,
  ) {
    this.lw = new Lowerer(index, resolver);
  }

  /** Pre-pass: assign each unit its export name so cross-file refs resolve. */
  /** Every registered IR file, by Ruby path (`marcel/mime_type.rb`). */
  irByFile = new Map<string, IrFile>();

  /**
   * A lib file's `require`s of other gem files, in order, split into those it
   * makes before its first class or module body and those after (a trailing
   * `require 'marcel/mime_type/definitions'`, mime_type.rb:98, which runs
   * once `MimeType` exists).
   */
  gemRequires(rubyFile: string): { lead: string[]; trail: string[] } {
    const file = this.irByFile.get(rubyFile);
    const out = { lead: [] as string[], trail: [] as string[] };
    if (!file) return out;
    let seenBody = false;
    const visit = (stmts: N[]) => {
      for (const s of stmts) {
        if (!s) continue;
        if (s.k === "module" || s.k === "class") {
          visit(s.body?.k === "seq" ? s.body.body : s.body ? [s.body] : []);
          seenBody = true;
          continue;
        }
        if (
          s.k === "call" &&
          s.recv === null &&
          (s.name === "require" || s.name === "require_relative") &&
          s.args[0]?.k === "str"
        ) {
          const v: string = s.args[0].value;
          const target =
            s.name === "require"
              ? `${v}.rb`
              : path.posix.normalize(path.posix.join(path.posix.dirname(rubyFile), `${v}.rb`));
          if (this.irByFile.has(target)) (seenBody ? out.trail : out.lead).push(target);
        }
      }
    };
    visit(file.body?.k === "seq" ? file.body.body : file.body ? [file.body] : []);
    return out;
  }

  register(file: IrFile): void {
    this.irByFile.set(file.file, file);
    this.lw.noteRanges(file.body);
    this.lw.noteKwargs(file.body);
    this.lw.notePositionalSyms(file.body);
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
      // The conventions' class renames (`Railtie` → `Trailtie`) name the
      // declaration, as parity:api matches it; the Ruby name still seats it.
      let name = TS_CONSTANT_RENAMES[u.fqn] ?? TS_CLASS_RENAMES[short] ?? short;
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
      // A prepended module sits ahead of the class (`prependChain`), not here.
      const prepended = new Set(scope.prepends.map((p) => p.join("::")));
      for (const inc of [...scope.includes].reverse()) {
        if (prepended.has(inc.join("::"))) continue;
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
   * The `initialize` of each module a class prepends, in Ruby's ancestor order
   * (the last `prepend` first): they run before the class's own `initialize`,
   * which their `super` enters (`moduleAncestors`' `prepended`, the
   * `@inlinedFrom` gate's chain order).
   */
  prependChain(fqn: string): InlineHook[] {
    const cls = this.index.scopes.get(fqn);
    if (!cls || cls.kind !== "class") return [];
    const chain = lexicalChain(this.index, cls.lexicalParent);
    const out: InlineHook[] = [];
    for (const p of [...cls.prepends].reverse()) {
      const m = this.index.resolveConst(p, [...chain, cls.fqn]);
      const ms = m ? this.index.scopes.get(m.fqn) : undefined;
      const d = ms?.kind === "module" ? ms.defs.get("initialize") : undefined;
      if (ms && d?.node && d.lineEnd)
        out.push({
          module: ms.fqn,
          def: d.node,
          file: d.file,
          cite: `${CITE_PREFIX}/${d.file}:${d.line}-${d.lineEnd}`,
        });
    }
    return out;
  }

  /**
   * A prepended `initialize(...)` / `initialize(*)` forwards exactly the
   * caller's arguments, so it is written with the parameters of the body its
   * `super` enters: the constructor keeps that signature.
   */
  private headWithParams(head: InlineHook, params: Param[]): InlineHook {
    const anon = head.def.params.every(
      (p: Param) =>
        p.kind === "fwd" ||
        ((p.kind === "rest" || p.kind === "keyrest" || p.kind === "block") && !p.name),
    );
    return anon ? { ...head, def: { ...head.def, params: [...params] } } : head;
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
    // A test under a class-body condition (`unless adapter_skips_scheduling?`) is
    // registered skipped, not left out: a file whose every test Ruby skips still
    // has tests, which vitest requires of a collected file.
    const itCall = (guard: string | null): string =>
      guard ? `${vitest("it")}.skipIf(!(${guard}))` : vitest("it");
    // A test whose body names a constant a ratified CLAUDE.md section rules out
    // is parked as `it.skip` under a `PERMANENT-SKIP:` line, its body kept.
    const permanentSkip = (stmts: N[]): string | null => this.permanentSkip(u, stmts);
    const testHead = (stmts: N[], guard: string | null, nm: string): string[] => {
      const why = permanentSkip(stmts);
      return why
        ? [
            `// PERMANENT-SKIP: ${why}`,
            `${vitest("it")}.skip@@TC@@(${nm}, async ({ testCase }) => {`,
          ]
        : [`${itCall(guard)}@@TC@@(${nm}, async ({ testCase }) => {`];
    };
    const guarded = (guard: string | null, lines: string[]): string[] =>
      guard ? [`if (${guard}) {`, ...indent(lines), "}"] : lines;
    const emitBody = (stmts: N[], out: string[], guard: string | null = null): void => {
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
          out.push(...testHead(s.block.body, guard, nm), ...indent(body(s.block.body)), "});");
        } else if (s.k === "if") {
          // A test defined under a condition (`if adapter_is?(:sucker_punch)`).
          const c = this.lw.cond(s.cond, nameCtx());
          const and = (x: string): string => (guard ? `(${guard}) && ${x}` : x);
          emitBody(this.lw.seqBody(s.then), out, and(`(${c})`));
          emitBody(this.lw.seqBody(s.else), out, and(`!(${c})`));
        } else if (s.k === "def" && /^test_/.test(s.name)) {
          const nm = s.name.replace(/^test_/, "").replace(/_/g, " ");
          out.push(...testHead(s.body, guard, JSON.stringify(nm)), ...indent(body(s.body)), "});");
        } else if (
          s.k === "call" &&
          s.recv === null &&
          (s.name === "setup" || s.name === "teardown") &&
          s.block?.k === "block"
        ) {
          const hook = vitest(s.name === "setup" ? "beforeEach" : "afterEach");
          out.push(
            ...guarded(guard, [
              `${hook}@@TC@@(async ({ testCase }) => {`,
              ...indent(body(s.block.body)),
              "});",
            ]),
          );
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
          emitBody(this.lw.seqBody(s.block.body), inner, guard);
          loopLocals.pop();
          out.push(`for (const ${jsIdent(p)} of ${list}) {`, ...indent(inner), "}");
        } else if (s.k === "class" || s.k === "module") {
          // A nested class is its own unit, emitted beside the test case.
          continue;
        } else if (s.k === "sclass") {
          // `class << self; def x` in a test class: a static method on it.
          for (const d of this.lw.seqBody(s.body)) {
            if (d.k !== "def") continue;
            hostMembers.push(
              this.emitMethod(d, u, f, {
                static: true,
                module: false,
                vis: "public",
                selfExpr: "this",
              }),
            );
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
        } else if (
          s.k === "call" &&
          s.recv === null &&
          s.block?.k === "block" &&
          !["test", "setup", "teardown"].includes(s.name)
        ) {
          // A class-level helper that defines tests from its block (marcel's
          // `each_content_type_fixture('magic') do |file, name, content_type|
          // test "…" do`, test_helper.rb:29-40): the test class's own method, run
          // as vitest collects, as Ruby runs it at class definition.
          const params: string[] = s.block.params.map((p: { name: string }) => p.name);
          const mark = loopLocals.length;
          loopLocals.push(...params);
          const inner: string[] = [];
          emitBody(this.lw.seqBody(s.block.body), inner, guard);
          loopLocals.length = mark;
          const args = s.args.map((a: N) => this.lw.expr(a, nameCtx()));
          out.push(
            `${short}.${tsMethodName(s.name, u.fqn, true)}(${[...args, `(${params.map(jsIdent).join(", ")}) => {`].join(", ")}`,
            ...indent(inner),
            "});",
          );
        } else if (s.k === "lasgn" || (s.k === "call" && !s.block)) {
          // A class-body statement between test definitions (extension_test.rb:12-23's
          // `extensions = []` and `extensions << extension`), run as vitest collects.
          out.push(...guarded(guard, this.lw.stmt(s, nameCtx(), false)));
          if (s.k === "lasgn" && !loopLocals.includes(s.name)) loopLocals.push(s.name);
        } else {
          const ctx = this.baseCtx(u, f, { selfKind: "static", selfExpr: "testCase" });
          out.push(
            ...guarded(guard, [
              `${this.lw.decline(ctx, "unhandled-node", s, `test class body: ${s.k} ${s.name ?? ""}`)};`,
            ]),
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
      // A static method of the test class, in its body.
      hostMembers.push(
        this.emitMethod(d, u, f, { static: true, module: false, vis: "public", selfExpr: "this" }),
      );
    }
    emitBody(u.body, out);
    // activesupport's testing/autorun runs each test on a fresh instance of the
    // class its describe names, between Minitest's `before_setup` and
    // `after_teardown`, and counts its assertions (minitest/test.rb `run`);
    // `setup` / `teardown` run inside them.
    const hctx = this.baseCtx(u, f, {});
    this.lw.imp(hctx, "@blazetrails/activesupport/testing/autorun", "", "");
    // The test class is a top-level constant, as Ruby's `class ExceptionsTest <
    // ActiveJob::TestCase` is: declared at module level, beside the `describe`
    // autorun resolves to it by name, so a class nested in it is seated on it.
    // A test class with no members and nothing included is the one autorun
    // builds from the registered spec type (test/helper.rb): no declaration.
    const bare =
      !hostMembers.length &&
      !classLines.length &&
      f.rubyFile.startsWith("test/cases/") &&
      ![...this.index.scopes.keys()].some((k) => k.startsWith(`${u.fqn}::`));
    // A test class whose Ruby superclass is the gem's (`ActiveJob::TestCase`)
    // extends it, and gets `TestHelper`'s members through it.
    const supHit =
      u.superclass?.k === "const"
        ? this.index.resolveConst(u.superclass.path, u.nesting)
        : undefined;
    // A dependency's class a test support file reopens (`ActiveSupport::TestCase`
    // in support/job_buffer.rb) is not the gem's.
    const depRoot = /^(ActiveSupport|ActiveRecord|ActiveModel|Minitest|Rails)::/.test(
      supHit?.kind === "scope" ? `${supHit.fqn}::` : "",
    );
    const supRef =
      supHit?.kind === "scope" &&
      !depRoot &&
      this.index.scopes.get(supHit.fqn)?.kind === "class" &&
      this.resolver.exportNames.get(supHit.fqn)
        ? this.resolver.fqnRef(supHit.fqn, hctx, this.lw)
        : null;
    const declared = !bare || !!supRef;
    const host = !declared
      ? ""
      : (supRef ??
        this.lw.imp(
          hctx,
          "@blazetrails/activesupport/test-case",
          "TestCase",
          "ActiveSupportTestCase",
        ));
    const mix = declared ? this.mixinDecls(u, f, short, hostMembers) : { iface: null, statics: [] };
    // The ivars the tests keep on the test case (`@logger` in `setup`).
    const testIvars = new Set<string>();
    for (const l of [...out, ...hostMembers])
      for (const m of l.matchAll(/\btestCase\.(_[\w$]+)\b(?!\s*\()/g)) testIvars.add(m[1]);
    const inheritedT = this.inheritedFields(u.fqn);
    const ivarLines = [...testIvars]
      .filter(
        (x) =>
          !inheritedT.has(x) &&
          !hostMembers.some((m) => new RegExp(`\\b${x}\\b`).test(m.split("\n")[0])),
      )
      .map((x) => `declare ${x}: unknown;`);
    const members = [...ivarLines, ...mix.statics, ...hostMembers];
    // Each test and hook receives this class's instance as `testCase`.
    const tc = declared ? `<{ testCase: ${short} }>` : "";
    const sub = (l: string) => l.split("@@TC@@").join(tc);
    const lines = [
      ...(!declared
        ? []
        : [
            members.length
              ? [
                  `class ${short} extends ${host} {`,
                  ...indent(members.join("\n\n").split("\n")),
                  "}",
                ].join("\n")
              : `class ${short} extends ${host} {}`,
            // The test class is module-local: its merged interface is too.
            ...(mix.iface ? [mix.iface.replace(/^export interface /, "interface ")] : []),
            `${this.lw.rc(hctx, "registerConstant")}(${JSON.stringify(short)}, ${short});`,
          ]),
      ...classLines,
      `${desc}(${JSON.stringify(short)}, () => {`,
      ...indent([
        `${vitest("beforeEach")}${tc}(async ({ testCase }) => {`,
        "  await testCase.setup();",
        "});",
        `${vitest("afterEach")}${tc}(async ({ testCase }) => {`,
        "  await testCase.teardown();",
        "});",
        ...out.map(sub),
      ]),
      "});",
    ]
      .join("\n")
      .split("\n");
    return spaceBlocks(lines).join("\n");
  }

  /** A test whose body names a constant a ratified CLAUDE.md section rules out. */
  permanentSkip(u: Unit, stmts: N[]): string | null {
    let why: string | null = null;
    let stringSub = false;
    let namesString = false;
    walk(stmts, (n) => {
      if (why) return false;
      if (n.k === "const") {
        const fqn = n.path.filter((x: string) => x).join("::");
        if (PERMANENT_CONSTS[fqn]) why = PERMANENT_CONSTS[fqn];
        // A subclass of Ruby's String (`class StringWithoutSerializer < String`):
        // a trails String is a JS primitive, which no class extends…
        const hit = this.index.resolveConst(n.path, [
          ...lexicalChain(this.index, this.index.scopes.get(u.fqn)?.lexicalParent),
          u.fqn,
        ]);
        const sc = hit?.kind === "scope" ? this.index.scopes.get(hit.fqn) : undefined;
        const sp = sc?.superclassPath?.filter((x: string) => x).join("::");
        if (sc && !sc.superclassFqn && sp === "String") stringSub = true;
        if (fqn === "String") namesString = true;
      }
    });
    // …and only where the test asserts String-ness of it (`assert_instance_of
    // String, deserialized`); a round-trip through its own serializer ports.
    if (!why && stringSub && namesString)
      why = 'CLAUDE.md "Ruby Strings are JS string primitives (no mutable String carrier)"';
    return why;
  }

  /** A spec's `describe` argument as a vitest title: a String, or a constant's name. */
  specTitle(arg: N, ctx: Ctx): string {
    if (arg.k === "str") return JSON.stringify(arg.value);
    if (arg.k === "const") return JSON.stringify(arg.path.filter((x: string) => x).join("::"));
    return this.lw.expr(arg, ctx);
  }

  /** Minitest classes a test helper may reopen to give every spec its helpers. */
  static SPEC_SUPPORT = ["Minitest::Test", "Minitest::Spec"];

  /** Minitest's own class-level DSL, which vitest's `describe` / `it` / hooks replace. */
  static MINITEST_DSL = new Set(["setup", "teardown", "test"]);

  /**
   * A gem test support class (`class Marcel::TestCase < Minitest::Test` in
   * test/test_helper.rb): a superclass of test classes, under test/, that
   * defines no tests of its own.
   */
  isTestSupport(fqn: string): boolean {
    const sc = this.index.scopes.get(fqn);
    // A helper module under the suite's support/ (mini_magick's `Helpers`, which
    // `RSpec.configure { config.include Helpers }` gives every example).
    // Only a module of instance methods, the ones an include hands every example;
    // one of singleton methods (activejob's `JobBuffer.add`) is called on itself.
    if (
      sc?.kind === "module" &&
      [...sc.files].every((x) => x.startsWith("test/support/")) &&
      sc.defs.size > 0 &&
      sc.sdefs.size === 0
    )
      return true;
    if (!sc || sc.kind !== "class") return false;
    if (![...sc.files].every((x) => x.startsWith("test/"))) return false;
    // Minitest's own classes reopened by a test helper (image_processing's
    // test_helper.rb: `class Minitest::Test; def fixture_image`): every spec's
    // helpers.
    if (Emitter.SPEC_SUPPORT.includes(fqn)) return true;
    const sp = (sc.superclassPath ?? []).filter((x) => x).join("::");
    if (!["Minitest::Test", "ActiveSupport::TestCase"].includes(sp)) return false;
    if ([...sc.defs.keys()].some((k) => k.startsWith("test_"))) return false;
    return [...this.index.scopes.values()].some((x) => x.superclassFqn === fqn);
  }

  /**
   * A test class: a `TestCase`, `Minitest::Test` itself, or a subclass of a gem
   * test support class (builder's `class TestEvents < Builder::Test`).
   */
  isTestClass(u: Unit): boolean {
    const p: string[] = (u.superclass?.path ?? []).filter((x: string) => x);
    if (/(^|::)TestCase$/.test(p.join("::")) || p.join("::") === "Minitest::Test") return true;
    if (u.superclass?.k !== "const") return false;
    const hit = this.index.resolveConst(u.superclass.path, u.nesting);
    return hit?.kind === "scope" && this.isTestSupport(hit.fqn);
  }

  /** The defs a test support class contributes, by name: a singleton def wins its instance twin. */
  supportDefs(u: Unit): Map<string, N> {
    const out = new Map<string, N>();
    for (const d of u.body) if (d.k === "def" && !d.singleton) out.set(d.name, d);
    for (const d of [...u.sbody, ...u.body.filter((d) => d.k === "def" && d.singleton)])
      if (d.k === "def") out.set(d.name, d);
    for (const k of Emitter.MINITEST_DSL) out.delete(k);
    return out;
  }

  private supportCache = new Map<string, { file: string; fns: Map<string, boolean> }>();

  /**
   * The functions a test support class exports, with which are async, found by
   * lowering them (to a fixpoint, since one may call another).
   */
  supportFns(fqn: string): { file: string; fns: Map<string, boolean> } | null {
    const hit = this.supportCache.get(fqn);
    if (hit) return hit;
    const sc = this.index.scopes.get(fqn);
    const ruby = sc?.primaryFile ?? (sc ? [...sc.files][0] : undefined);
    const file = ruby ? this.irByFile.get(ruby) : undefined;
    const u = file ? collectUnits(file).find((x) => x.fqn === fqn) : undefined;
    if (!u || !ruby) return null;
    const defs = this.supportDefs(u);
    const fns = new Map<string, boolean>([...defs.keys()].map((k) => [k, false]));
    const scratch: FileCtx = {
      rubyFile: ruby,
      tsFile: rubyFileToTsAr(ruby),
      imports: new Map(),
      usedLocalNames: new Set(),
      declines: [],
      stats: {},
    };
    for (let changed = true, i = 0; changed && i < 5; i++) {
      changed = false;
      for (const [name, d] of defs) {
        const text = this.supportFn(u, scratch, name, d, fns, false);
        const asy = text.startsWith("async ");
        if (asy !== fns.get(name)) {
          fns.set(name, asy);
          changed = true;
        }
      }
    }
    const out = { file: rubyFileToTsAr(ruby), fns };
    this.supportCache.set(fqn, out);
    return out;
  }

  private testFnMap(
    names: Map<string, boolean>,
    local: (n: string) => string,
  ): Map<string, { name: string; async: boolean }> {
    return new Map([...names].map(([k, a]) => [k, { name: local(k), async: a }]));
  }

  private supportFn(
    u: Unit,
    f: FileCtx,
    name: string,
    d: N,
    fns: Map<string, boolean>,
    exported: boolean,
  ): string {
    const ctx = this.baseCtx(u, f, {
      selfKind: "top",
      selfExpr: "this",
      testFns: this.testFnMap(fns, (k) => tsMethodName(k)),
    });
    return this.lw.fnDecl(tsMethodName(name), d.params ?? [], d.body, ctx, exported);
  }

  /** A gem test support class as the functions its tests call (Minitest's DSL left to vitest). */
  emitTestSupport(u: Unit, f: FileCtx): string {
    const sup = this.supportFns(u.fqn);
    if (!sup) return "";
    return [...this.supportDefs(u)]
      .map(([name, d]) => this.supportFn(u, f, name, d, sup.fns, true))
      .join("\n\n");
  }

  /**
   * Whether a test class ports as native vitest, and the support class whose
   * functions it calls (null for none). False where it needs a dependency's
   * test mixin (`ActiveJob::TestHelper`), which has no functional surface yet.
   */
  nativeTestSupport(u: Unit): string | null | false {
    if (u.body.some((s) => s.k === "call" && s.recv === null && s.name === "include")) return false;
    if (u.superclass?.k !== "const") return false;
    const path = u.superclass.path.filter((x: string) => x).join("::");
    if (path === "ActiveSupport::TestCase" || path === "Minitest::Test") return null;
    const hit = this.index.resolveConst(u.superclass.path, u.nesting);
    if (hit?.kind === "scope" && this.isTestSupport(hit.fqn)) return hit.fqn;
    return false;
  }

  /**
   * A Rails test class as plain vitest: a `describe` named after it, `it` per
   * test, `beforeEach` / `afterEach` for `setup` / `teardown`, each `@ivar` a
   * `let` the `describe` declares, each helper `def` a function in it, and the
   * gem's test support functions imported. No test case instance.
   */
  emitNativeTest(u: Unit, f: FileCtx, supFqn: string | null | string[], title?: string): string {
    const short = title ?? u.fqn.split("::").pop()!;
    const hctx = this.baseCtx(u, f, {});
    const vitest = (x: string) => this.lw.imp(hctx, "vitest", x);
    // Ivars: one `let` each, named for the ivar unless a local of the class has that name.
    const lvars = new Set<string>();
    const ivars = new Set<string>();
    walk(u.body, (n) => {
      if (n.k === "lasgn" || n.k === "lvar") lvars.add(n.name);
      if (n.k === "ivar" || n.k === "iasgn") ivars.add(n.name);
    });
    const ivarLocals = new Map<string, string>();
    for (const iv of ivars) {
      const base = propName(iv.slice(1)).replace(/^_/, "");
      ivarLocals.set(
        iv,
        lvars.has(iv.slice(1)) ? `self${base[0].toUpperCase()}${base.slice(1)}` : base,
      );
    }
    // RSpec `subject` / `let(:x)` / `let!(:x)` (at any depth) and
    // `described_class`: describe-scoped `let`s and the spec's constant.
    const specLocals = new Map<string, string>();
    const specLets: string[] = [];
    if (u.rspec) {
      walk(u.body, (n) => {
        if (n.k !== "call" || n.recv !== null || n.block?.k !== "block") return;
        if (!["subject", "let", "let!"].includes(n.name)) return;
        const nm =
          n.args[0]?.k === "sym" ? n.args[0].value : n.name === "subject" ? "subject" : null;
        if (!nm) return;
        const js = jsIdent(propName(nm));
        if (!specLets.includes(js)) specLets.push(js);
        specLocals.set(nm, js);
        if (n.name === "subject") specLocals.set("subject", js);
      });
      if (u.describedClass) specLocals.set("described_class", this.lw.expr(u.describedClass, hctx));
    }
    // Helper defs of the test class, and the support class's functions.
    const helpers = new Map<string, N>();
    for (const s of [...u.body, ...u.sbody])
      if (s.k === "def" && !/^test_/.test(s.name) && !["setup", "teardown"].includes(s.name))
        helpers.set(s.name, s);
    const impFrom = (file: string, k: string) =>
      this.lw.imp(hctx, `@root/${file.replace(/\.ts$/, ".js")}`, tsMethodName(k));
    const sups = (Array.isArray(supFqn) ? supFqn : supFqn ? [supFqn] : [])
      .map((x) => this.supportFns(x))
      .filter((x): x is NonNullable<typeof x> => !!x);
    const helperAsync = new Map<string, boolean>([...helpers.keys()].map((k) => [k, false]));
    const testFns = (): Map<string, { name: string; async: boolean }> => {
      const m = new Map<string, { name: string; async: boolean }>();
      for (const sup of sups)
        for (const [k, a] of sup.fns)
          m.set(k, {
            // Imported where a test calls it.
            get name() {
              return impFrom(sup.file, k);
            },
            async: a,
          });
      for (const [k, a] of helperAsync) m.set(k, { name: tsMethodName(k), async: a });
      m.set("skip", { name: "context.skip", async: false });
      return m;
    };
    const ctxFor = (over: Partial<Ctx>) =>
      this.baseCtx(u, f, {
        selfKind: "instance",
        selfExpr: "this",
        ivarLocals,
        testFns: testFns(),
        ...(u.rspec ? { specLocals } : {}),
        ...over,
      });
    const helperText = (): string[] => {
      const out: string[] = [];
      for (const [name, d] of helpers) {
        const t = this.lw.fnDecl(tsMethodName(name), d.params ?? [], d.body, ctxFor({}), false);
        helperAsync.set(name, t.startsWith("async "));
        out.push(t);
      }
      return out;
    };
    for (let i = 0; i < 3; i++) helperText();
    const helperLines = helperText();

    const body = (b: N, locals: string[]): string[] => {
      const ctx = ctxFor({ testMode: true, asyncBox: { awaits: false }, testTail: [] });
      // The function body a local's assignments are counted in (`const` for one).
      ctx.scope.body = b;
      for (const l of locals) ctx.scope.locals.add(l);
      const lines = [
        ...this.lw.block(this.lw.seqBody(b), ctx, false),
        // rspec-mocks message expectations, verified as the example ends.
        ...(ctx.testTail ?? []),
      ];
      const hz: Set<string> | undefined = ctx.scope.hoisted;
      if (hz?.size)
        lines.unshift(`let ${[...hz].map((h) => `${jsIdent(h)}: unknown`).join(", ")};`);
      return lines;
    };
    // `async` only where the body awaits (an `await` nested in an inner async
    // arrow belongs to that arrow, so this can say async where it need not).
    const fnHead = (lines: string[]) =>
      `${lines.some((l) => /\bawait\b/.test(l)) ? "async " : ""}${lines.some((l) => /\bcontext\.skip\(/.test(l)) ? "(context)" : "()"}`;
    const out: string[] = [];
    const loopLocals: string[] = [];
    // The class-level block being lowered, for counting a local's assignments.
    let classBody: N | undefined;
    const nameCtx = () => {
      const c = ctxFor({ selfKind: "static", asyncBox: undefined });
      for (const l of loopLocals) c.scope.locals.add(l);
      c.scope.body = classBody;
      return c;
    };
    const emitBody = (stmts: N[], out: string[], guard: string | null): void => {
      const it = (nm: string, b: N) => {
        const lines = body(b, loopLocals);
        const why =
          GEM.skipTests?.[JSON.parse(nm.startsWith('"') ? nm : '""')] ??
          this.permanentSkip(u, this.lw.seqBody(b));
        if (why) {
          out.push(
            `// PERMANENT-SKIP: ${why}`,
            `${vitest("it")}.skip(${nm}, ${fnHead(lines)} => {`,
            ...indent(lines),
            "});",
          );
          return;
        }
        out.push(
          `${guard ? `${vitest("it")}.skipIf(!(${guard}))` : vitest("it")}(${nm}, ${fnHead(lines)} => {`,
          ...indent(lines),
          "});",
        );
      };
      for (const s of stmts) {
        if (
          s.k === "call" &&
          s.recv === null &&
          (s.name === "test" || s.name === "it") &&
          (s.args[0]?.k === "str" || s.args[0]?.k === "dstr") &&
          s.block?.k === "block"
        ) {
          it(
            s.args[0].k === "str"
              ? JSON.stringify(s.args[0].value)
              : this.lw.expr(s.args[0], nameCtx()),
            s.block.body,
          );
        } else if (s.k === "def" && /^test_/.test(s.name)) {
          it(JSON.stringify(s.name.replace(/^test_/, "").replace(/_/g, " ")), s.body);
        } else if (
          u.rspec &&
          s.k === "call" &&
          s.recv === null &&
          ["subject", "let", "let!"].includes(s.name) &&
          s.block?.k === "block"
        ) {
          // RSpec `subject { … }` / `let(:x) { … }`: the value, set for each
          // example before it runs (in definition order, outer first).
          const nm = s.args[0]?.k === "sym" ? s.args[0].value : "subject";
          const ctx = ctxFor({ testMode: true, asyncBox: { awaits: false } });
          for (const l of loopLocals) ctx.scope.locals.add(l);
          const seq = this.lw.seqBody(s.block.body);
          const value =
            seq.length === 1
              ? this.lw.expr(seq[0], ctx)
              : `await (${this.lw.arrow([], s.block.body, ctx)})()`;
          const asy = ctx.asyncBox!.awaits || value.startsWith("await") ? "async " : "";
          out.push(
            `${vitest("beforeEach")}(${asy}() => {`,
            `  ${specLocals.get(nm)} = ${value};`,
            "});",
          );
        } else if (
          s.k === "call" &&
          s.recv === null &&
          (s.name === "describe" || s.name === "context") &&
          s.args.length >= 1 &&
          s.block?.k === "block"
        ) {
          // Minitest::Spec's nested `describe ".valid_image?" do`: a nested
          // vitest `describe`, its hooks scoped to it as Minitest scopes them.
          const inner: string[] = [];
          emitBody(this.lw.seqBody(s.block.body), inner, guard);
          out.push(
            `${vitest("describe")}(${this.specTitle(s.args[0], nameCtx())}, () => {`,
            ...indent(inner),
            "});",
          );
        } else if (
          (s.k === "call" &&
            s.recv === null &&
            (s.name === "setup" ||
              s.name === "teardown" ||
              // Minitest::Spec `before` / `after` (`before :each` is the same).
              ((s.name === "before" || s.name === "after") &&
                (s.args.length === 0 || (s.args[0].k === "sym" && s.args[0].value === "each")))) &&
            s.block?.k === "block") ||
          (s.k === "def" && (s.name === "setup" || s.name === "teardown"))
        ) {
          const b = s.k === "def" ? s.body : s.block.body;
          const hook = vitest(
            s.name === "setup" || s.name === "before" ? "beforeEach" : "afterEach",
          );
          // A `def setup; super; …` reaches Minitest's empty `setup`.
          const stripped = {
            k: "seq",
            body: this.lw.seqBody(b).filter((x: N) => !(x.k === "super" || x.k === "zsuper")),
          };
          const hb = body(stripped, loopLocals);
          out.push(`${hook}(${fnHead(hb)} => {`, ...indent(hb), "});");
        } else if (s.k === "if") {
          const c = this.lw.cond(s.cond, nameCtx());
          const and = (x: string) => (guard ? `(${guard}) && ${x}` : x);
          emitBody(this.lw.seqBody(s.then), out, and(`(${c})`));
          emitBody(this.lw.seqBody(s.else), out, and(`!(${c})`));
        } else if (
          s.k === "call" &&
          s.name === "each" &&
          s.recv?.k === "array" &&
          s.block?.k === "block" &&
          s.block.params.length === 1
        ) {
          const p = s.block.params[0].name;
          const inner: string[] = [];
          const list = this.lw.expr(s.recv, nameCtx());
          loopLocals.push(p);
          emitBody(this.lw.seqBody(s.block.body), inner, guard);
          loopLocals.pop();
          out.push(`for (const ${jsIdent(p)} of ${list}) {`, ...indent(inner), "}");
        } else if (s.k === "def" || s.k === "sclass" || s.k === "class" || s.k === "module") {
          continue;
        } else if (
          s.k === "call" &&
          s.recv === null &&
          ["private", "protected", "public", "require", "require_relative"].includes(s.name)
        ) {
          continue;
        } else if (s.k === "call" && s.recv === null && s.block?.k === "block") {
          // A class-level helper that defines tests from its block
          // (`each_content_type_fixture('magic') do |file, name, content_type|`).
          const fn = testFns().get(s.name);
          const params: string[] = s.block.params.map((p: { name: string }) => p.name);
          const mark = loopLocals.length;
          loopLocals.push(...params);
          const inner: string[] = [];
          const outer = classBody;
          classBody = s.block.body;
          emitBody(this.lw.seqBody(s.block.body), inner, guard);
          classBody = outer;
          loopLocals.length = mark;
          const args = s.args.map((a: N) => this.lw.expr(a, nameCtx()));
          const callee =
            fn?.name ??
            this.lw.decline(nameCtx(), "unhandled-node", s, `test class helper ${s.name}`);
          out.push(
            `${callee}(${[...args, `(${params.map(jsIdent).join(", ")}) => {`].join(", ")}`,
            ...indent(inner),
            "});",
          );
        } else if (s.k === "lasgn" || (s.k === "call" && !s.block)) {
          const lines = this.lw.stmt(s, nameCtx(), false);
          out.push(...(guard ? [`if (${guard}) {`, ...indent(lines), "}"] : lines));
          if (s.k === "lasgn" && !loopLocals.includes(s.name)) loopLocals.push(s.name);
        } else {
          out.push(
            `${this.lw.decline(nameCtx(), "unhandled-node", s, `test class body: ${s.k} ${s.name ?? ""}`)};`,
          );
        }
      }
    };
    emitBody(u.body, out, null);
    const lets = [...ivarLocals.values(), ...specLets].map((x) => `let ${x}: unknown;`);
    // rspec-mocks' doubles are reset after each example.
    if (out.some((l) => l.includes(".spyOn(")))
      out.unshift(
        `${vitest("afterEach")}(() => {`,
        `  ${this.lw.imp(hctx, "vitest", "vi")}.restoreAllMocks();`,
        "});",
      );
    // A test class that nests constants (`SerializersTest::DummySerializer`,
    // which a test `constantize`s by that name) is still their namespace.
    const nests = [...this.index.scopes.keys()].some((k) => k.startsWith(`${u.fqn}::`));
    return spaceBlocks([
      ...(nests
        ? [
            `class ${short} {}`,
            `${this.lw.rc(hctx, "registerConstant")}(${JSON.stringify(short)}, ${short});`,
          ]
        : []),
      `${vitest("describe")}(${JSON.stringify(short)}, () => {`,
      ...indent([...lets, ...helperLines.flatMap((h) => h.split("\n")), ...out]),
      "});",
    ]).join("\n");
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
        out.push(`${hook}(async ({ testCase }) => {`, ...indent(lines), "});");
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
    // A class or module body's locals become module-scope bindings (emitClass).
    for (const u of collectUnits(file))
      for (const s of u.body) if (s.k === "lasgn") f.usedLocalNames.add(jsIdent(s.name));
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
      if (GEM.symbolColon) f.symbolColon = true;
    }
    const units = orderBySuperclass(
      collectUnits(file).filter((u) => this.emits(u, file.file)),
      this.index,
    );
    const nativeUnits = new Set<string>();
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
      if (file.file.startsWith("test/") && this.isTestSupport(u.fqn)) {
        nativeUnits.add(u.fqn);
        chunks.push(this.emitTestSupport(u, f));
        continue;
      }
      if (file.file.startsWith("test/") && u.kind === "class" && this.isTestClass(u)) {
        const native = this.nativeTestSupport(u);
        // A native test class is a `describe`, not a constant to seat.
        if (native !== false) nativeUnits.add(u.fqn);
        chunks.push(native === false ? this.emitTestCase(u, f) : this.emitNativeTest(u, f, native));
        continue;
      }
      const r = u.kind === "class" ? this.emitClass(u, name, f) : this.emitModule(u, name, f);
      defs += r.defs;
      chunks.push(r.text);
      // A test's module is named for `Module#name` the way its classes are.
      if (u.kind === "module" && file.file.startsWith("test/") && !u.fqn.includes("::"))
        chunks.push(
          `${this.lw.rc(this.baseCtx(u, f, {}), "registerConstant")}(${JSON.stringify(u.fqn)}, ${name});`,
        );
    }
    // A test fixture's top-level statements (`adapters/inline.rb`'s
    // `ActiveJob::Base.queue_adapter = :inline`) run when it is loaded.
    // A test's `require "helper"` loads `adapters/#{ENV["AJ_ADAPTER"] ||= "inline"}`
    // (activejob/test/helper.rb:9-17): the default adapter's file, for its effect.
    if (
      (file.file.startsWith("test/cases/") ||
        /^test\/(?:.*_test|(?:.*\/)?test_[^/]*)\.rb$/.test(file.file)) &&
      (file.body?.k === "seq" ? file.body.body : [file.body]).some(
        (s: N) => s?.k === "call" && s.name === "require" && s.args[0]?.value === "helper",
      )
    ) {
      const hctx = this.baseCtx({ nesting: [] } as unknown as Unit, f, {});
      this.lw.imp(hctx, "@root/test-helpers/helper.js", "", "");
    }
    // An RSpec spec's `require "spec_helper"` (mini_magick): it loads the gem
    // and the support files, for their effect.
    if (
      /^test\/.*_spec\.rb$/.test(file.file) &&
      (file.body?.k === "seq" ? file.body.body : [file.body]).some(
        (s: N) => s?.k === "call" && s.name === "require" && s.args[0]?.value === "spec_helper",
      )
    ) {
      const hctx = this.baseCtx({ nesting: [] } as unknown as Unit, f, {});
      this.lw.imp(hctx, "@root/test-helpers/spec-helper.js", "", "");
    }
    // A library file's `require`s of other gem files: side-effect imports in
    // Ruby's order, each followed by the files it requires at its end.
    if (!file.file.startsWith("test/")) {
      const rctx = this.baseCtx({ nesting: [] } as unknown as Unit, f, {});
      const order: string[] = (f.requireOrder ??= []);
      const add = (rb: string, seen: Set<string>) => {
        if (seen.has(rb)) return;
        seen.add(rb);
        const spec = `@root/${this.resolver.tsFileOf(rb).replace(/\.ts$/, ".js")}`;
        this.lw.imp(rctx, spec, "", "");
        if (!order.includes(spec)) order.push(spec);
        for (const t of this.gemRequires(rb).trail) add(t, seen);
      };
      for (const rb of this.gemRequires(file.file).lead) add(rb, new Set([file.file]));
    }
    // A library file's top-level statements (marcel's mime_type/definitions.rb,
    // `Marcel::MimeType.extend "text/plain", …`) run when it is loaded.
    if (!file.file.startsWith("test/")) {
      const top = (file.body?.k === "seq" ? file.body.body : file.body ? [file.body] : []).filter(
        (s: N) => s.k === "call" && s.recv?.k === "const" && rootConst(s.recv)?.path[0] !== "ENV",
      );
      const fake = { nesting: [], fqn: undefined, body: [], sbody: [] } as unknown as Unit;
      const lctx = this.baseCtx(fake, f, {});
      for (const s of top) chunks.push(...this.lw.stmt(s, lctx, false));
    }
    if (file.file.startsWith("test/")) {
      const top = (file.body?.k === "seq" ? file.body.body : file.body ? [file.body] : []).filter(
        (s: N) =>
          s.k === "call" &&
          !["require", "require_relative"].includes(s.name) &&
          rootConst(s.recv)?.path.filter((x: string) => x)[0] !== undefined &&
          rootConst(s.recv)!.path.filter((x: string) => x)[0] !== "ENV" &&
          // RSpec's own configuration and DSL (`RSpec.configure`, `RSpec.describe`,
          // `RSpec::Matchers.define`): vitest's describe / it / setupFiles replace it.
          rootConst(s.recv)!.path.filter((x: string) => x)[0] !== "RSpec",
      );
      const stmts = file.body?.k === "seq" ? file.body.body : file.body ? [file.body] : [];
      const fake = { nesting: [], fqn: undefined, body: [], sbody: [] } as unknown as Unit;
      const tctx = this.baseCtx(fake, f, {});
      // A Minitest::Spec file (`describe "ImageProcessing::Vips" do`): each
      // top-level `describe` is a vitest one, its helpers those the test helper
      // reopens Minitest::Test / Minitest::Spec with.
      for (const s of stmts) {
        const rspecRecv =
          s.recv?.k === "const" && s.recv.path.filter((x: string) => x).join("::") === "RSpec";
        if (
          !(
            s.k === "call" &&
            (s.recv === null || rspecRecv) &&
            s.name === "describe" &&
            s.block?.k === "block"
          )
        )
          continue;
        const spec = {
          kind: "class",
          fqn: `Spec(${s.args[0]?.value ?? s.args[0]?.path?.join("::") ?? "?"})`,
          nesting: [],
          superclass: null,
          body: this.lw.seqBody(s.block.body),
          sbody: [],
          // RSpec's `described_class`: the constant a top-level describe names.
          describedClass: s.args[0]?.k === "const" ? s.args[0] : undefined,
          rspec: rspecRecv,
        } as unknown as Unit;
        const sups = [
          ...Emitter.SPEC_SUPPORT,
          ...[...this.index.scopes.keys()].filter(
            (k) => this.index.scopes.get(k)?.kind === "module",
          ),
        ].filter((x) => this.isTestSupport(x));
        chunks.push(
          this.emitNativeTest(
            spec,
            f,
            sups,
            this.specTitle(s.args[0], tctx).startsWith('"')
              ? JSON.parse(this.specTitle(s.args[0], tctx))
              : undefined,
          ),
        );
      }
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
      // The suite's test class is `ActiveSupport::TestCase` (the test host) unless
      // a test file names another: Minitest::Spec's `register_spec_type`
      // (minitest/spec.rb), which autorun builds a `describe`'s class from, so a
      // test class with nothing of its own needs no declaration.
      if (file.file === "test/helper.rb") {
        const reg = this.lw.imp(
          tctx,
          "@blazetrails/activesupport/testing/autorun",
          "registerSpecType",
        );
        const host = this.lw.imp(
          tctx,
          "@blazetrails/activesupport/test-case",
          "TestCase",
          "ActiveSupportTestCase",
        );
        chunks.push(`${reg}(/(?:)/, ${host});`);
      }
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
    // seats in `namespaces.ts` is read from there; a parent in this file, or in
    // a file this one already imports (`relation.ts` seats `WhereClause`), is
    // read directly. Seating on a parent this file does not import would add an
    // edge that closes a cycle whenever that file imports its children
    // (`serializers.rb` names every serializer), so such a constant stays
    // unseated and is listed in the report.
    {
      const bctx = this.baseCtx(units[0] ?? ({} as Unit), f, {});
      for (const u of units) {
        const i = u.fqn.lastIndexOf("::");
        if (i < 0 || nativeUnits.has(u.fqn)) continue;
        const parent = u.fqn.slice(0, i);
        if (this.plainModules.has(parent)) continue;
        const seat = handNamespaceFqns().get(parent);
        const parentExp = this.resolver.exportNames.get(parent);
        const parentSpec = parentExp && `@root/${parentExp.tsFile.replace(/\.ts$/, ".js")}`;
        const ref = seat
          ? this.lw.imp(bctx, "@root/namespaces.js", seat, `${seat}Seat`)
          : names.has(parent)
            ? names.get(parent)!
            : parentSpec && f.imports.get(parentSpec)?.has(parentExp.name)
              ? f.imports.get(parentSpec)!.get(parentExp.name)!
              : null;
        // A reopened constant of another gem (`ActiveSupport::TestCase`) is
        // already seated where that gem defines it.
        if (!ref && !this.index.scopes.has(parent) && !handNamespaceFqns().has(parent)) continue;
        if (!ref) {
          f.stats["unseated-constant"] = (f.stats["unseated-constant"] ?? 0) + 1;
          this.unseated.push(u.fqn);
          continue;
        }
        chunks.push(
          `${this.lw.rc(bctx, "rbModConstSet")}(${ref}, ${JSON.stringify(u.fqn.slice(i + 2))}, ${names.get(u.fqn)});`,
        );
      }
    }
    for (const u of units) {
      if (!u.late?.length) continue;
      const exp = this.resolver.exportNames.get(u.fqn);
      const name = exp && exp.tsFile === tsFile ? exp.name : u.fqn.split("::").join("");
      const ctx = this.baseCtx(u, f, { selfKind: "static", selfExpr: name });
      for (const s of u.late) chunks.push(...this.lw.stmt(s, ctx, false));
    }
    const header = this.imports(f);
    // A test using a `@blazetrails/vitest-matchers` matcher opts into its types
    // the way the hand tests do (activejob argument-serialization.test.ts).
    if (
      tsFile.endsWith(".test.ts") &&
      new RegExp(`\\.(${VITEST_MATCHERS.join("|")})\\(`).test(chunks.join("\n"))
    )
      header.unshift('import type {} from "@blazetrails/vitest-matchers";');
    const text =
      [...header, ...(f.prelude?.size ? ["", ...f.prelude] : []), "", ...chunks].join("\n") + "\n";
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
    const req = f.requireOrder ?? [];
    const first = (x: string) =>
      x === "@root/test-helpers/helper.js" ? -1 : req.includes(x) ? req.indexOf(x) : req.length;
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
    for (const [spec, m] of [...(f.typeImports ?? new Map<string, Map<string, string>>())].sort()) {
      if (spec.startsWith("@root/") && spec.slice(6).replace(/\.js$/, ".ts") === f.tsFile) continue;
      const s = spec.startsWith("@root/") ? rel(spec.slice(6)) : spec;
      const names = [...m.entries()]
        .filter(([k]) => !f.imports.get(spec)?.has(k))
        .map(([k, v]) => (k === v ? k : `${k} as ${v}`));
      if (names.length) lines.push(`import type { ${names.join(", ")} } from "${s}";`);
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
    ctx.scope.body = d.body;
    const twin = isCtor ? undefined : this.handTwin(u, d.name, opts);
    if (twin?.info.async) ctx.defAsync = true;
    if (twin?.info.params) ctx.paramTypes = twin.info.params.map((t) => this.lw.tsType(t, ctx));
    let ps = this.lw.paramList(params, ctx, false);
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
        // A Ruby Date / DateTime may be a `Temporal.PlainDate` / `ZonedDateTime`
        // in trails (activesupport's `Date.today`): left untyped, its calls dispatch.
        const temporal = path.length === 1 && (path[0] === "Date" || path[0] === "DateTime");
        const key = temporal
          ? undefined
          : (path.length === 1 && core[path[0]]) || this.lw.resolver.types.depClass(path);
        if (key) (ctx.scope.types ??= new Map()).set(params[0].name, { k: "class", key } as any);
      }
    }
    // A writer (`name=`, `[]=`) answers its argument, not its body; an operator
    // spelled with `=` (`==`, `<=`) answers its body.
    const writer = /^(\w+|\[\])=$/.test(d.name);
    let body = this.lw.block(this.lw.seqBody(d.body), ctx, !isCtor && !writer);
    if (ctx.prologue) body = [...ctx.prologue, ...body];
    // `ruby2_keywords(:initialize)`: a trailing Hash passed as keywords is
    // flagged (`Hash.ruby2_keywords_hash?` answers true for it), so ActiveJob's
    // serializer can tell `perform(a, b: 1)` from `perform(a, { b: 1 })`.
    const r2kOwner = opts.inlinedHead?.module ?? u.fqn;
    const rest = (d.params as Param[]).find((p) => p.kind === "rest" && p.name);
    if (rest && this.index.scopes.get(r2kOwner)?.ruby2Keywords?.has(d.name)) {
      const r = jsIdent(rest.name!);
      const flag = this.lw.rc(ctx, "rbHashSRuby2KeywordsHash");
      body = [
        `const last = ${r}[${r}.length - 1];`,
        `if (typeof last === "object" && last !== null && Object.getPrototypeOf(last) === Object.prototype)`,
        `  ${r}[${r}.length - 1] = ${flag}(last);`,
        ...body,
      ];
    }
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
    if (isCtor && this.methodMissingRoot(u.fqn))
      body = [...body, ...this.methodMissingTrap(u, ctx)];
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
    // The hand twin decides async-ness where it has one: a twin the hand port
    // keeps synchronous (it reads a prewarmed fact, activerecord CLAUDE.md
    // "Adapter facts are prewarmed and peeked") is not recorded async, so its
    // callers stop awaiting it and their bodies follow on the next pass. A
    // body that still awaits (a truly async call below) stays async, counted.
    const twinSync = twin?.info.kind === "method" && twin.info.async === false;
    if (twinSync && awaits) f.stats["twin-sync-awaits"] = (f.stats["twin-sync-awaits"] ?? 0) + 1;
    if (
      !isCtor &&
      !(twinSync && !awaits) &&
      (awaits || twin?.info.async || body.some((l) => /^return .*, async \(/.test(l)))
    ) {
      this.resolver.asyncDefs.add(`${u.fqn}${opts.static ? "." : "#"}${d.name}`);
      // A `ClassMethods` module's method is static on its class, and is still
      // the module's instance method to Ruby's lookup (`extend`).
      if (opts.static && !d.singleton) this.resolver.asyncDefs.add(`${u.fqn}#${d.name}`);
    }
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
      const gt = twin?.info.ret ? `: ${this.lw.tsType(twin.info.ret, ctx)}` : "";
      return `${doc}${mod}get ${propKey(tsName)}()${gt} {\n${indent(body).join("\n")}\n}`;
    }
    const inherited =
      !opts.module && !opts.objectMember && !opts.asFunction
        ? this.lw.inheritedDepGetter(u.fqn, d.name, opts.static)
        : undefined;
    if (inherited && !awaits && d.params.length === 0 && !/=$/.test(d.name))
      return `${opts.static ? "static " : ""}get ${propKey(inherited.tsName)}() {\n${indent(body).join("\n")}\n}`;
    if (
      !opts.static &&
      !opts.module &&
      !opts.objectMember &&
      !opts.asFunction &&
      !isCtor &&
      !awaits &&
      d.params.length === 0 &&
      u.fqn &&
      this.lw.index.instanceWriters.has(d.name) &&
      this.lw.index.ancestors(u.fqn).some((sc) => sc.fqn !== u.fqn && sc.attrs.has(d.name))
    )
      return [
        `${doc}get ${propKey(tsName)}(): any {\n${indent(body).join("\n")}\n}`,
        `set ${propKey(tsName)}(value: any) {\n  this._${tsName} = value;\n}`,
      ].join("\n\n");
    // A parameter the body never reads is `_name`, as the hand port writes an
    // abstract method's (object-serializer.ts `deserialize(_json)`).
    if (!isCtor) {
      const text = body.join("\n");
      for (const p of d.params as Param[]) {
        if (!p.name || !["req", "opt", "rest", "key"].includes(p.kind) || p.kind === "key")
          continue;
        const id = jsIdent(p.name);
        if (id.startsWith("_") || new RegExp(`\\b${id.replace(/\$/g, "\\$")}\\b`).test(text))
          continue;
        ps = ps.replace(new RegExp(`(^|, |\\.\\.\\.)${id}(?=\\??:| =|,|$)`), `$1_${id}`);
      }
    }
    const host = opts.module ? this.hostThis(u, f) : "";
    const thisParam = opts.module ? (ps ? `this: ${host}, ` : `this: ${host}`) : "";
    // The hand twin's declared return type where there is one; otherwise none,
    // so TypeScript infers it from the body rather than reading `any`.
    const retType = twin?.info.ret ? this.lw.tsType(twin.info.ret, ctx) : null;
    const ret = isCtor || !retType ? "" : asy ? `: Promise<${retType}>` : `: ${retType}`;
    if (/^[a-z_]\w*=$/.test(d.name) && opts.asFunction) {
      const fnName = tsName.startsWith("set")
        ? tsName
        : "set" + tsName[0].toUpperCase() + tsName.slice(1);
      const tp = thisParam;
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
    // A module's private method is called on its includer (`this: TestCase`),
    // which TypeScript's `protected` would hide from an interface extending the
    // module: `@internal` only, as the hand port marks one (activejob core.ts).
    const hidden =
      (opts.vis === "protected" || opts.vis === "private") &&
      !(opts.module && this.resolver.isClassModule(u.fqn));
    const mod = opts.objectMember
      ? ""
      : `${opts.static ? "static " : ""}${hidden ? "protected " : ""}`;
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
    const bodyLocals: string[] = [];
    const staticStmts: N[] = [];
    let defs = 0;
    const body = this.flattenDefs(u.body);
    const vis = this.visibilityOf(body);
    this.ivarTypes(u, f, body);
    const ctxStatic = this.baseCtx(u, f, { selfKind: "static", selfExpr: "this" });
    let ext = "";
    // `class MyString < String`: a JS `String` object, which carries the
    // content `MyString.new("foo")` passes (ruby-compat's `rbCString` is a
    // class tag with no content).
    const scPath = u.superclass?.k === "const" ? u.superclass.path.filter((x: string) => x) : [];
    if (
      scPath.length === 1 &&
      scPath[0] === "String" &&
      !this.index.resolveConst(u.superclass!.path, u.nesting.slice(0, -1))
    ) {
      ext = " extends String";
    } else if (u.superclass) {
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
      const [head, ...restChain] = [...this.prependChain(u.fqn), ...this.initializeChain(u.fqn)];
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
    const prepends = this.prependChain(u.fqn);
    for (const s of body) {
      if (s.k === "def") {
        defs++;
        // A prepended `initialize` runs first; its `super` is this class's own
        // `initialize`, whose `super` continues down the included chain.
        if (s.name === "initialize" && !s.singleton && prepends.length) {
          const [head, ...rest] = prepends;
          const own: InlineHook = { module: u.fqn, def: s, file: f.rubyFile, cite: "" };
          members.push(
            this.emitMethod(this.headWithParams(head, s.params).def, u, f, {
              static: false,
              module: false,
              vis: vis.get(s) ?? "public",
              inlineChain: [...rest, own, ...this.initializeChain(u.fqn)],
              inlinedHead: head,
            }),
          );
          continue;
        }
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
      } else if (s.k === "lasgn") {
        // A local of the class body (marcel tables.rb:2391 `b = Hash.new { … }`),
        // read by the constants after it: a module-scope binding ahead of the class.
        this.bodyLocal(s, name, ctxStatic, bodyLocals, members);
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
            members.push(
              `get ${js}(): any {\n  return this._${js.replace(/^_/, "")}${this.unsetNil(u.fqn, a.value)};\n}`,
            );
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
          // The module's reopenings in other files, after it (path (a)).
          const hitM = a.k === "const" ? this.index.resolveConst(a.path, u.nesting) : undefined;
          if (hitM?.kind === "scope")
            after.push(
              ...this.reopeningLines(
                name,
                hitM.fqn,
                s.name === "extend" ? "extend" : "include",
                ctxStatic,
              ),
            );
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
            members.push(
              `static get ${js}(): any {\n  return this._${js.replace(/^_/, "")} ?? null;\n}`,
            );
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
    // A top-level class is a constant of `Object` (`rb_const_set` on `rb_cObject`,
    // ruby-compat's `registerConstant`), which `constantize` reads. A nested one
    // is seated on its parent instead (`emitFile`), as the hand port does.
    if (!u.fqn.includes("::"))
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
    // `"#{klass}"` is `Module#to_s`, the constant path; a JS class interpolates its
    // source, so each class carries the seat the hand port's `class-to-string-seat`
    // lint writes.
    if (!members.some((m) => /^(?:override )?static (?:override )?toString\(/.test(m)))
      members.unshift(`static toString(): string {\n  return ${JSON.stringify(u.fqn)};\n}`);
    const head = `export class ${name}${ext} {`;
    const mix = this.mixinDecls(u, f, name, members);
    const sig = [...this.ivarDecls(u, f, members), ...mix.statics];
    const text = [
      ...bodyLocals,
      head,
      ...indent([...sig, ...pairSetters(dedupeMembers(members)).flatMap((m) => ["", m])]),
      "}",
      ...(mix.iface ? [mix.iface] : []),
      ...after,
    ].join("\n");
    return { text, defs };
  }

  /**
   * A module's reopenings (path (a), the hand port's shape, activerecord
   * validations/absence.ts): each Ruby file other than the module's own that
   * defines methods on it, emitted there as a plain object of those methods
   * under the module's joined name (`ActiveRecordValidationsClassMethods`).
   */
  reopenings(fqn: string): { tsFile: string; name: string; defs: string[] }[] {
    const sc = this.index.scopes.get(fqn);
    const own = this.resolver.exportNames.get(fqn)?.tsFile;
    if (!sc || !own) return [];
    const byFile = new Map<string, string[]>();
    for (const [name, d] of sc.defs) {
      const t = this.resolver.tsFileOf(d.file);
      if (t === own || d.file.startsWith("test/")) continue;
      (byFile.get(t) ?? byFile.set(t, []).get(t)!).push(name);
    }
    return [...byFile].map(([tsFile, defs]) => ({ tsFile, name: fqn.split("::").join(""), defs }));
  }

  /**
   * The lines that bring a module's reopenings to an includer: `include(K, X)`
   * for an included module's, `extend(K, X)` for an extended one's or a
   * Concern's `ClassMethods`'.
   */
  reopeningLines(target: string, fqn: string, how: "include" | "extend", ctx: Ctx): string[] {
    const out: string[] = [];
    const add = (m: string, h: "include" | "extend") => {
      for (const r of this.reopenings(m)) {
        // Aliased per file: every reopening carries the module's joined name.
        const ref = this.resolver.importFrom(r.tsFile, r.name, ctx, this.lw);
        out.push(`${this.lw.rc(ctx, h)}(${target}, ${ref});`);
      }
    };
    add(fqn, how);
    if (how === "include" && this.index.scopes.get(fqn)?.concern)
      add(`${fqn}::ClassMethods`, "extend");
    return out;
  }

  /**
   * The `this` of a module's functions: the gem classes the module enters the
   * Ruby ancestors of (`include M` on `Base`), imported with `import type` so
   * the module file takes no runtime import of its includer; `typeof` them for a
   * Concern's `ClassMethods`. `any` (for the type pass) where no lib class
   * includes it, or more than a few do.
   */
  hostThis(u: Unit, f: FileCtx): string {
    const isCm = u.fqn.endsWith("::ClassMethods");
    const mod = isCm ? u.fqn.slice(0, -"::ClassMethods".length) : u.fqn;
    const memo = (this.hostMemo ??= new Map<string, string[]>());
    let hosts = memo.get(mod);
    if (!hosts) {
      hosts = [];
      for (const s of this.index.scopes.values()) {
        if (s.kind !== "class") continue;
        if (!rubyAncestors(this.index, s.fqn).includes(mod)) continue;
        if (s.superclassFqn && rubyAncestors(this.index, s.superclassFqn).includes(mod)) continue;
        hosts.push(s.fqn);
      }
      // `extend M` (`Base` extends `Querying`): the module's methods are the
      // class's own singleton methods, so `self` is the class, `typeof Base`.
      if (!isCm)
        for (const s of this.index.scopes.values()) {
          if (s.kind !== "class" || !this.extendsModule(s, mod)) continue;
          const sup = s.superclassFqn ? this.index.scopes.get(s.superclassFqn) : undefined;
          if (sup && this.extendsModule(sup, mod)) continue;
          hosts.push(`extend:${s.fqn}`);
        }
      memo.set(mod, hosts);
    }
    const lib = hosts.filter((h) => {
      const e = this.resolver.exportNames.get(h.replace(/^extend:/, ""));
      return e && !/\.test\.ts$|(^|\/)test-helpers\//.test(e.tsFile);
    });
    if (!lib.length || lib.length > 3) return "any";
    const ctx = this.baseCtx(u, f, {});
    return lib
      .map((h) => {
        const ext = h.startsWith("extend:");
        const e = this.resolver.exportNames.get(h.replace(/^extend:/, ""))!;
        const local =
          e.tsFile === f.tsFile
            ? e.name
            : this.lw.impType(ctx, `@root/${e.tsFile.replace(/\.ts$/, ".js")}`, e.name);
        return `${isCm || ext ? "typeof " : ""}${local}`;
      })
      .join(" | ");
  }

  hostMemo?: Map<string, string[]>;

  /**
   * ` ?? null` for a reader of `@name` unless the scope's own `initialize`
   * assigns it: an ivar never set reads nil in Ruby and `undefined` in JS.
   */
  unsetNil(fqn: string, name: string): string {
    const init = this.index.scopes.get(fqn)?.defs.get("initialize")?.node;
    let set = false;
    if (init)
      walk(init.body ?? null, (n: N) => {
        if (set) return false;
        if (n.k === "iasgn" && n.name.replace(/^@/, "") === name) set = true;
      });
    return set ? "" : " ?? null";
  }

  /** Whether class scope `s` is `extend`ed with `mod` or a module including it. */
  extendsModule(s: ScopeInfo, mod: string): boolean {
    const chain = [...lexicalChain(this.index, s.lexicalParent), s.fqn];
    return s.extends.some((p) => {
      const hit = this.index.resolveConst(p, chain);
      return hit?.kind === "scope" && rubyAncestors(this.index, hit.fqn).includes(mod);
    });
  }

  /**
   * The members a class gets from the modules that enter its Ruby ancestors at
   * this class (`include M`, and a Concern's `ClassMethods`, which its
   * `append_features` extends the class with), typed through ruby-compat's
   * `Included<>` / `Extended<>`: the instance side as an interface merged with
   * the class, the class side as `declare static` members. A name the class
   * defines itself, or a nearer module already gave it, is left to that one.
   */
  mixinDecls(
    u: Unit,
    f: FileCtx,
    name: string,
    members: string[],
  ): { iface: string | null; statics: string[] } {
    const sc = this.index.scopes.get(u.fqn);
    if (!sc || sc.kind !== "class") return { iface: null, statics: [] };
    const ctx = this.baseCtx(u, f, {});
    const inherited = new Set(sc.superclassFqn ? rubyAncestors(this.index, sc.superclassFqn) : []);
    const mods = rubyAncestors(this.index, u.fqn).filter(
      (m) => m !== u.fqn && !inherited.has(m) && this.index.scopes.get(m)?.kind === "module",
    );
    const ownName = (m: string) =>
      /^(?:override )?(static )?(?:override )?(?:async )?(?:get |set )?\*?([\w$]+)\(/.exec(m) ??
      null;
    const own = { inst: new Set<string>(), stat: new Set<string>() };
    for (const m of members) {
      const hit = ownName(m);
      if (hit) (hit[1] ? own.stat : own.inst).add(hit[2]);
    }
    const ref = (fqn: string) =>
      this.lw.expr({ k: "const", path: ["", ...fqn.split("::")] } as N, ctx);
    const quote = (n: string) => JSON.stringify(n);
    const bases: string[] = [];
    const statics: string[] = [];
    const attrs: string[] = [];
    // A module is a class (emitModuleClass): its instance side is the class's
    // instance type, imported as a type; a module the hand port seats as a
    // namespace object keeps `Included<>`.
    const typeRef = (fqn: string): string | null => {
      const e = this.resolver.exportNames.get(fqn);
      if (!e) return null;
      if (!this.resolver.isClassModule(fqn)) return null;
      return e.tsFile === f.tsFile
        ? e.name
        : this.lw.impType(ctx, `@root/${e.tsFile.replace(/\.ts$/, ".js")}`, e.name);
    };
    const key = this.resolver.oracleKey(u.fqn);
    // A `class_attribute` / `mattr_accessor` an `included do` block declares on
    // the includer: activesupport's accessor property, typed by the hand twin.
    const attrType = (a: string, isStatic: boolean): string => {
      const t = key ? this.resolver.types.member(key, a, isStatic)?.info.ret : undefined;
      const ts = this.lw.tsType(t ?? undefined, ctx);
      return ts === "any" ? "unknown" : ts;
    };
    // A writer `def x=` is the module function `setX` (CLAUDE.md's `setX()` spelling).
    const fnName = (d: string, owner: string) =>
      d.endsWith("=") && !/[=!<>]=$/.test(d)
        ? `set${propName(d.slice(0, -1))[0].toUpperCase()}${propName(d.slice(0, -1)).slice(1)}`
        : tsMethodName(d, owner);
    // Names a gem subclass redefines as a method: a property in the merged
    // interface would clash with its method (TS2425), so these are declared as
    // method signatures of the module function's type.
    const overridden = new Set<string>();
    for (const o of this.index.scopes.values())
      if (o.kind === "class" && o.fqn !== u.fqn && rubyAncestors(this.index, o.fqn).includes(u.fqn))
        for (const d of o.defs.keys()) overridden.add(fnName(d, o.fqn));
    const methods: string[] = [];
    for (const m of mods) {
      const ms = this.index.scopes.get(m)!;
      // A module reached only through a cast (a namespace seat read as
      // `(X as any)`) has no type to name: skipped.
      const r = typeRef(m) ? null : ref(m);
      if (r !== null && !/^[\w$.]+$/.test(r)) continue;
      const t =
        typeRef(m) ?? `${this.lw.imp(ctx, "@blazetrails/ruby-compat", "Included")}<typeof ${r}>`;
      const names: string[] = [];
      for (const [d, info] of ms.defs) {
        // A reader whose writer another scope declares is an accessor half: a property.
        if (info.params.length === 0 && this.index.instanceWriters.has(d)) continue;
        names.push(fnName(d, m));
      }
      const omit = names.filter((n) => own.inst.has(n) || overridden.has(n));
      if (names.length) bases.push(omit.length ? `Omit<${t}, ${omit.map(quote).join(" | ")}>` : t);
      for (const n of names) {
        if (!own.inst.has(n) && overridden.has(n))
          methods.push(
            `${n}(...args: Parameters<${t}[${quote(n)}]>): ReturnType<${t}[${quote(n)}]>;`,
          );
        own.inst.add(n);
      }
      for (const a of ms.sattrs) {
        const n = propName(a);
        if (own.stat.has(n)) continue;
        own.stat.add(n);
        statics.push(`declare static ${n}: ${attrType(a, true)};`);
      }
      for (const a of ms.attrs) {
        const n = propName(a);
        if (own.inst.has(n)) continue;
        own.inst.add(n);
        attrs.push(`${n}: ${attrType(a, false)};`);
      }
      const cm = this.index.scopes.get(`${m}::ClassMethods`);
      if (ms.concern && cm) {
        for (const d of cm.defs.keys()) {
          const n = fnName(d, cm.fqn);
          // A `ClassMethods#new` is inlined into the constructor (CLAUDE.md, "A
          // module's `initialize` is inlined"), not a static member.
          if (d === "new" || d === "initialize" || n === "constructor") continue;
          if (own.stat.has(n)) continue;
          own.stat.add(n);
          const cmRef = typeRef(cm.fqn);
          if (!cmRef && !/^[\w$.]+$/.test(ref(cm.fqn))) continue;
          statics.push(
            cmRef
              ? `declare static ${n}: typeof ${cmRef}.${n};`
              : `declare static ${n}: ${this.lw.imp(ctx, "@blazetrails/ruby-compat", "Extended")}<typeof ${ref(cm.fqn)}>[${quote(n)}];`,
          );
        }
      }
    }
    // Each module's reopenings in other files (path (a)): their methods are
    // the includer's too, typed from the plain object that carries them.
    for (const m of mods) {
      for (const [fq, side] of [
        [m, "inst"],
        [`${m}::ClassMethods`, "stat"],
      ] as const) {
        if (side === "stat" && !this.index.scopes.get(m)?.concern) continue;
        for (const r of this.reopenings(fq)) {
          const ref = this.lw.impType(ctx, `@root/${r.tsFile.replace(/\.ts$/, ".js")}`, r.name);
          for (const d of r.defs) {
            const n = fnName(d, fq);
            if (side === "stat") {
              if (own.stat.has(n)) continue;
              own.stat.add(n);
              statics.push(`declare static ${n}: (typeof ${ref})[${quote(n)}];`);
            } else {
              if (own.inst.has(n)) continue;
              own.inst.add(n);
              attrs.push(`${n}: (typeof ${ref})[${quote(n)}];`);
            }
          }
        }
      }
    }
    // `extend M` on the class itself (`Base` extends `ConnectionHandling`):
    // M's methods, and those of the modules M includes, are its statics.
    const classSide: string[] = [];
    for (const m of mods) {
      const cm = this.index.scopes.get(`${m}::ClassMethods`);
      if (this.index.scopes.get(m)?.concern && cm) classSide.push(cm.fqn);
    }
    const chainHere = [...lexicalChain(this.index, sc.lexicalParent), sc.fqn];
    for (const p of sc.extends) {
      const hit = this.index.resolveConst(p, chainHere);
      if (hit?.kind !== "scope" || this.index.scopes.get(hit.fqn)?.kind !== "module") continue;
      for (const em of rubyAncestors(this.index, hit.fqn)) {
        const es = this.index.scopes.get(em);
        if (!es || es.kind !== "module" || classSide.includes(em)) continue;
        classSide.push(em);
        const tr = typeRef(em);
        const allStatic = em.endsWith("::ClassMethods") || !!es.moduleFunction;
        for (const d of es.defs.keys()) {
          const n = fnName(d, em);
          if (d === "new" || d === "initialize" || n === "constructor" || own.stat.has(n)) continue;
          if (!tr && !/^[\w$.]+$/.test(ref(em))) continue;
          own.stat.add(n);
          statics.push(
            tr
              ? allStatic
                ? `declare static ${n}: typeof ${tr}.${n};`
                : `declare static ${n}: ${tr}[${quote(n)}];`
              : `declare static ${n}: ${this.lw.imp(ctx, "@blazetrails/ruby-compat", "Extended")}<typeof ${ref(em)}>[${quote(n)}];`,
          );
        }
      }
    }
    // The class-level ivars those methods keep on the class (`@sequence_name`
    // in ModelSchema::ClassMethods): its static storage, typed by the type pass.
    for (const cs of classSide) {
      for (const d of this.index.scopes.get(cs)?.defs.values() ?? [])
        walk(d.node?.body ?? null, (nd) => {
          if (nd.k === "def") return false;
          if (nd.k !== "ivar" && nd.k !== "iasgn") return;
          const field = this.lw.ivarField(String(nd.name), cs);
          if (
            own.stat.has(field) ||
            members.some((m) => new RegExp(`^static (?:get |set )?${field}\\b`).test(m))
          )
            return;
          own.stat.add(field);
          statics.push(`declare static ${field}: unknown;`);
        });
    }
    const iface =
      bases.length || attrs.length || methods.length
        ? `export interface ${name}${bases.length ? ` extends ${bases.join(", ")}` : ""} {${attrs.length || methods.length ? `\n${indent([...attrs, ...methods]).join("\n")}\n` : ""}}`
        : null;
    return { iface, statics };
  }

  /**
   * The type of each ivar the class's instance methods assign: the hand twin's
   * field, else the type every assignment agrees on. It is nullable where any
   * assignment is `nil`, and for an inferred type also unless `initialize`
   * assigns it unconditionally (a Ruby ivar reads `nil` until it is assigned).
   * Recorded on the file so `typeOf` reads it while the methods lower.
   */
  ivarTypes(u: Unit, f: FileCtx, body: N[]): Map<string, TypeRef> {
    const assigned = new Map<string, N[]>();
    for (const d of body) {
      if (d.k !== "def" || d.singleton) continue;
      walk(d.body, (n) => {
        if (n.k === "def" || n.k === "class" || n.k === "module" || n.k === "sclass") return false;
        if (n.k === "iasgn") {
          const list = assigned.get(n.name) ?? [];
          list.push(n.value);
          assigned.set(n.name, list);
        }
      });
    }
    const init = body.find((d) => d.k === "def" && !d.singleton && d.name === "initialize");
    const setInInit = new Set(
      (init ? this.lw.seqBody(init.body) : [])
        .filter((st: N) => st.k === "iasgn" && st.value?.k !== "nil")
        .map((st: N) => st.name),
    );
    const ctx = this.baseCtx(u, f, { selfKind: "instance" });
    const key = this.resolver.oracleKey(u.fqn);
    const types = new Map<string, TypeRef>();
    for (const [ivar, values] of assigned) {
      const assignsNil = values.some((v) => v?.k === "nil");
      const twin = key ? this.resolver.types.ivar(key, ivar) : null;
      if (twin) {
        types.set(
          ivar,
          assignsNil && twin.k !== "fn" && twin.k !== "gemClass" && twin.k !== "hash"
            ? ({ ...twin, nullable: true } as TypeRef)
            : twin,
        );
        continue;
      }
      const seen = values.filter((v) => v?.k !== "nil").map((v) => this.lw.typeOf(v, ctx));
      const first = seen[0];
      // Untyped: still declared (as `unknown`), for the type pass to narrow.
      if (
        !first ||
        first.k === "gemClass" ||
        !seen.every((t) => JSON.stringify(t) === JSON.stringify(first))
      ) {
        types.set(ivar, null);
        continue;
      }
      const nullable =
        (assignsNil || !setInInit.has(ivar)) && first.k !== "fn" && first.k !== "hash";
      types.set(ivar, nullable ? ({ ...first, nullable: true } as TypeRef) : first);
    }
    (f.ivarTypes ??= new Map()).set(u.fqn, types);
    return types;
  }

  /** `declare _x: T;` for each typed ivar; `declare` emits no field initializer. */
  /**
   * A local of a class body. Ahead of the class, unless its value reads the
   * class (builder xchar.rb:100 reads `XChar::CP1252`): then it is declared
   * ahead and assigned in a `static {}` block where Ruby's statement stands, so
   * the static fields before it are set first.
   */
  bodyLocal(s: N, name: string, ctx: Ctx, bodyLocals: string[], members: string[]): void {
    const lines = this.lw.stmt(s, ctx, false);
    const m =
      lines.length === 1
        ? /^(?:let|const) ([\w$]+)(?:: [^=]+)? = ([\s\S]*);$/.exec(lines[0])
        : null;
    if (!m || !new RegExp(`\\b${name}\\b`).test(m[2])) {
      bodyLocals.push(...lines);
      return;
    }
    bodyLocals.push(`let ${m[1]}: unknown;`);
    members.push(`static {\n  ${m[1]} = ${m[2]};\n}`);
  }

  /**
   * Whether `fqn` defines `method_missing` and no gem ancestor does: its
   * constructor returns the Proxy that reaches it (CLAUDE.md, "Ruby protocol
   * methods with a different JS mechanism").
   */
  methodMissingRoot(fqn: string): boolean {
    if (!this.index.scopes.get(fqn)?.defs.has("method_missing")) return false;
    return !rubyAncestors(this.index, fqn).some(
      (a) => a !== fqn && this.index.scopes.get(a)?.defs.has("method_missing"),
    );
  }

  /**
   * `BasicObject#method_missing` dispatch (vm_eval.c:2570) for a class that
   * defines it: a name the object does not answer is a function calling
   * `methodMissing` with the Ruby name, except the names JS itself probes
   * (`PROTOCOL_PROBES`), and, where the class defines `respond_to_missing?`,
   * a name it does not claim.
   */
  methodMissingTrap(u: Unit, ctx: Ctx): string[] {
    const probes = this.lw.imp(ctx, "@blazetrails/ruby-compat", "PROTOCOL_PROBES");
    const sc = this.index.scopes.get(u.fqn)!;
    const short = u.fqn.split("::").at(-1)!;
    const claims = sc.defs.has("respond_to_missing?")
      ? ` || !(receiver as ${short}).isRespondToMissing(name, false)`
      : "";
    // The name reaches `method_missing` as a Symbol.
    const sym = GEM.symbolColon ? '":" + name' : "name";
    return [
      "return new Proxy(this, {",
      "  get(target, name, receiver) {",
      `    if (typeof name === "symbol" || name in target || ${probes}.has(name)${claims})`,
      "      return Reflect.get(target, name, receiver);",
      `    return (...args: unknown[]) => (receiver as ${short}).methodMissing(${sym}, ...args);`,
      "  },",
      "});",
    ];
  }

  /**
   * The instance fields the class's ancestors (superclasses and included
   * modules, in the gem) already declare: each ivar their methods assign, and
   * each `attr_*`'s storage. A subclass that declares one again with another
   * type stops being assignable to the ancestor (TS2684 on a `this: Base`
   * method), so it inherits the declaration instead.
   */
  inheritedFields(fqn: string): Set<string> {
    const memo = (this.inheritedMemo ??= new Map<string, Set<string>>());
    const hit = memo.get(fqn);
    if (hit) return hit;
    const out = new Set<string>();
    for (const a of rubyAncestors(this.index, fqn)) {
      if (a === fqn) continue;
      const sc = this.index.scopes.get(a);
      if (!sc) continue;
      for (const at of sc.attrs) out.add(this.lw.ivarField(at, fqn));
      for (const d of sc.defs.values())
        walk(d.node?.body ?? null, (n) => {
          if (n.k === "def") return false;
          if (n.k === "iasgn" || n.k === "ivar") out.add(this.lw.ivarField(String(n.name), fqn));
        });
    }
    memo.set(fqn, out);
    return out;
  }

  inheritedMemo?: Map<string, Set<string>>;

  ivarDecls(u: Unit, f: FileCtx, members: string[]): string[] {
    const ctx = this.baseCtx(u, f, { selfKind: "instance" });
    const out: string[] = [];
    const inherited = this.inheritedFields(u.fqn);
    for (const [ivar, t] of f.ivarTypes?.get(u.fqn) ?? []) {
      const field = this.lw.ivar(ivar, ctx).replace(/^this\./, "");
      if (inherited.has(field)) continue;
      if (members.some((m) => new RegExp(`^(?:get |set |static )?${field}\\b`).test(m))) continue;
      const ts = this.lw.tsType(t, ctx);
      // `any`, or `{}` (any non-nullish value), says nothing a reader can use.
      out.push(
        `declare ${field}: ${ts === "any" || /^\{\}( \| null)?$/.test(ts) ? "unknown" : ts};`,
      );
    }
    // An ivar only an `attr_*` accessor or a read touches (`@filter`, set through
    // `attr_writer`) is still the instance's storage: declared, `unknown` until
    // the type pass narrows it. A class-level ivar (`this._x` in a static
    // member) is declared static.
    const declared = new Set(out.map((d) => /^declare ([\w$#]+)/.exec(d)![1]));
    const definedBy = (field: string, isStatic: boolean) =>
      members.some((m) =>
        new RegExp(
          `^(?:override )?${isStatic ? "static " : ""}(?:override )?(?:async )?(?:get |set )?${field.replace(/\$/g, "\\$")}\\b`,
        ).test(m),
      );
    for (const isStatic of [false, true]) {
      const seen = new Set<string>();
      for (const m of members) {
        if (/^(?:override )?static\b/.test(m) !== isStatic) continue;
        for (const hit of m.matchAll(/\bthis\.(_[\w$]+)\b(?!\s*\()/g)) seen.add(hit[1]);
      }
      for (const field of seen) {
        const key = `${isStatic ? "static " : ""}${field}`;
        if (declared.has(key) || (!isStatic && declared.has(field)) || definedBy(field, isStatic))
          continue;
        if (!isStatic && inherited.has(field)) continue;
        declared.add(key);
        out.push(`declare ${isStatic ? "static " : ""}${field}: unknown;`);
      }
    }
    return out;
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
      const thisP = module ? `this: ${this.hostThis(u, f)}, ` : "";
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
        // A module that is a class carries the pair as an accessor, as a class does.
        if (module && this.resolver.isClassModule(u.fqn)) {
          out.push(
            m.endsWith("=")
              ? `set ${prop}(value: any) {\n  ${t}.${prop} = value;\n}`
              : `get ${prop}(): any {\n  return ${t}.${prop};\n}`,
          );
          continue;
        }
        if (m.endsWith("="))
          out.push(
            `set${prop[0].toUpperCase()}${prop.slice(1)}(${thisP}value: any): any {\n  return (${t}.${prop} = value);\n}`,
          );
        else out.push(`${nm}(${thisP.replace(/, $/, "")}): any {\n  return ${t}.${prop};\n}`);
        continue;
      }
      if (m.endsWith("=")) continue;
      const twin = module ? undefined : this.handTwin(u, pre + m, { static: false });
      if (twin && twin.info.kind !== "method" && !twin.info.async) {
        const gctx = this.baseCtx(u, f, { selfKind: "instance" });
        const read: N = {
          k: "call",
          recv: targetIr,
          name: m,
          args: [],
          block: null,
          safe: allowNil,
        };
        out.push(
          `get ${twin.tsName}(): ${this.lw.tsType(twin.info.ret, gctx)} {\n  return ${this.lw.expr(read, gctx)};\n}`,
        );
        continue;
      }
      const ctx = this.baseCtx(u, f, {
        selfKind: module ? "module" : "instance",
        isModule: module,
        asyncBox: { awaits: false },
      });
      // The delegated method's own parameters where the gem defines it once
      // (`delegate :serialize, to: :instance` takes `serialize(argument)`, the
      // hand port's object-serializer.ts), else Ruby's `(*args)`.
      const targetDefs = [...this.index.scopes.values()]
        .map((sc) => sc.defs.get(m))
        .filter((d): d is NonNullable<typeof d> => !!d);
      const own = this.index.scopes.get(u.fqn)?.defs.get(m);
      const tdef = own ?? (targetDefs.length === 1 ? targetDefs[0] : undefined);
      const simple =
        tdef?.params.every((p: Param) => ["req", "opt", "rest"].includes(p.kind) && p.name) ??
        false;
      const ps: Param[] = simple ? tdef!.params : [{ kind: "rest", name: "args" } as Param];
      for (const p of ps) {
        ctx.scope.locals.add(p.name!);
        if (p.kind === "rest")
          (ctx.scope.types ??= new Map()).set(p.name!, { k: "array", el: null });
      }
      const call: N = {
        k: "call",
        recv: targetIr,
        name: m,
        args: ps.map((p) =>
          p.kind === "rest"
            ? { k: "splat", value: { k: "lvar", name: p.name } }
            : { k: "lvar", name: p.name },
        ),
        block: null,
        safe: allowNil,
      };
      const e = this.lw.expr(call, ctx);
      const asy = ctx.asyncBox!.awaits ? "async " : "";
      const list = ps
        .map((p) =>
          p.kind === "rest"
            ? `...${jsIdent(p.name!)}: any[]`
            : `${jsIdent(p.name!)}${p.kind === "opt" ? "?" : ""}: any`,
        )
        .join(", ");
      out.push(`${asy}${nm}(${thisP}${list}) {\n  return ${e};\n}`);
    }
    return out;
  }

  /**
   * A Ruby module as a JS class (the hand port's shape, activejob core.ts /
   * queue-name.ts): its instance methods are methods (`this` its includer), its
   * singleton methods and a `ClassMethods` module's methods are static, its
   * constants static properties, and `static [classModule] = true` tells
   * ruby-compat's `include()` it is a module, whose prototype is copied onto the
   * includer. A Concern is `extend(M, Concern)`, its `included do` block
   * `M.included(null, function () { … })`.
   */
  emitModuleClass(u: Unit, name: string, f: FileCtx): { text: string; defs: number } {
    const members: string[] = [];
    const after: string[] = [];
    const bodyLocals: string[] = [];
    const staticStmts: N[] = [];
    const sclassStmts: N[] = [];
    let defs = 0;
    const body = this.flattenDefs(u.body);
    const vis = this.visibilityOf(body);
    this.ivarTypes(u, f, body);
    const ctxStatic = this.baseCtx(u, f, { selfKind: "static", selfExpr: name });
    const parentFqn = u.fqn.endsWith("::ClassMethods")
      ? u.fqn.slice(0, -"::ClassMethods".length)
      : "";
    // A Concern's `ClassMethods` is extended onto the includer: every method is static.
    const isCm = !!parentFqn && !!this.index.scopes.get(parentFqn)?.concern;
    const allStatic =
      isCm ||
      body.some(
        (s) =>
          s.k === "call" &&
          s.recv === null &&
          ((s.name === "module_function" && s.args.length === 0) ||
            (s.name === "extend" && s.args[0]?.k === "self")),
      );
    const isConcern = !!this.index.scopes.get(u.fqn)?.concern;
    let includedBlock: N | null = null;
    const accessor = (js: string, kind: string, isStatic: boolean, rb?: string) => {
      const st = isStatic ? "static " : "";
      const field = `this._${js.replace(/^_/, "")}`;
      const nil = isStatic || !rb ? " ?? null" : this.unsetNil(u.fqn, rb);
      if (kind !== "attr_writer")
        members.push(`${st}get ${js}(): any {\n  return ${field}${nil};\n}`);
      if (kind !== "attr_reader" && kind !== "attr")
        members.push(`${st}set ${js}(value: any) {\n  ${field} = value;\n}`);
    };
    for (const s of body) {
      if (s.k === "def") {
        if (s.name === "initialize" && !s.singleton && this.inlinedModules().has(u.fqn)) continue;
        defs++;
        const isStatic = s.singleton || allStatic;
        members.push(
          this.emitMethod(s, u, f, {
            static: isStatic,
            module: !s.singleton && !(allStatic && !isCm),
            vis: vis.get(s) ?? "public",
            ...(s.singleton || (allStatic && !isCm) ? { selfExpr: "this" } : {}),
          }),
        );
      } else if (s.k === "lasgn") {
        // A local of the class body (marcel tables.rb:2391 `b = Hash.new { … }`),
        // read by the constants after it: a module-scope binding ahead of the class.
        this.bodyLocal(s, name, ctxStatic, bodyLocals, members);
      } else if (s.k === "casgn" && s.path?.length === 1) {
        members.push(`static ${s.path[0]}: any = ${this.lw.expr(s.value, ctxStatic)};`);
      } else if (
        s.k === "call" &&
        s.recv === null &&
        /^attr_(reader|accessor|writer)$|^attr$/.test(s.name)
      ) {
        for (const a of s.args)
          if (a.k === "sym") {
            accessor(propName(a.value), s.name, allStatic, a.value);
            defs++;
          }
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
        ["include", "extend", "prepend"].includes(s.name)
      ) {
        for (const a of s.args) {
          if (a.k === "self") continue;
          if (a.k === "const" && a.path.join("::").endsWith("ActiveSupport::Concern")) continue;
          // activesupport ports its testing assertions as flat functions, which
          // a helper module's `assert_*` calls reach by name: nothing to mix in.
          if (
            a.k === "const" &&
            a.path.filter((x: string) => x).join("::") === "ActiveSupport::Testing::Assertions"
          )
            continue;
          after.push(`${this.lw.rc(ctxStatic, s.name)}(${name}, ${this.lw.expr(a, ctxStatic)});`);
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
        ].includes(s.name)
      ) {
        continue;
      } else if (s.k === "call" && s.recv === null && s.name === "delegate") {
        members.push(...this.delegate(s, u, f, true).map((m) => (allStatic ? `static ${m}` : m)));
      } else if (
        s.k === "alias" ||
        (s.k === "call" && s.recv === null && s.name === "alias_method" && s.args.length === 2)
      ) {
        const [nw, old] = s.k === "alias" ? [s.new, s.old] : [s.args[0].value, s.args[1].value];
        if (typeof nw !== "string" || typeof old !== "string") continue;
        const [ps, as] = this.aliasSignature(u.fqn, old, allStatic);
        members.push(
          `${allStatic ? "static " : ""}${propKey(tsMethodName(nw, u.fqn, allStatic))}(${ps}): any {\n  return this.${tsMethodName(old, u.fqn, allStatic)}(${as});\n}`,
        );
        defs++;
      } else staticStmts.push(s);
    }
    for (const s of this.flattenDefs(u.sbody)) {
      if (s.k === "def") {
        defs++;
        members.push(
          this.emitMethod(s, u, f, {
            static: true,
            module: false,
            vis: "public",
            selfExpr: "this",
          }),
        );
      } else if (
        s.k === "call" &&
        s.recv === null &&
        /^attr_(reader|accessor|writer)$/.test(s.name)
      ) {
        for (const a of s.args)
          if (a.k === "sym") {
            accessor(propName(a.value), s.name, true);
            defs++;
          }
      } else if (s.k === "call" && s.recv === null && s.name === "delegate") {
        for (const d of delegateDefs(s)) {
          defs++;
          members.push(
            this.emitMethod(d, u, f, {
              static: true,
              module: false,
              vis: "public",
              selfExpr: "this",
            }),
          );
        }
      } else if (
        s.k === "call" &&
        s.recv === null &&
        ["private", "protected", "public"].includes(s.name)
      ) {
        continue;
      } else sclassStmts.push(s);
    }
    // `extend ActiveSupport::Concern` first, so a concern this module includes
    // records a dependency instead of running against the module itself.
    if (isConcern)
      after.unshift(
        `${this.lw.rc(ctxStatic, "extend")}(${name}, ${this.lw.as(ctxStatic, "Concern")});`,
      );
    if (includedBlock) {
      const host = this.hostThis({ ...u, fqn: `${u.fqn}::ClassMethods` } as Unit, f);
      const ic = this.baseCtx(u, f, { selfKind: "static", selfExpr: "this" });
      const lines = this.lw.block(this.lw.seqBody(includedBlock.body), ic, false);
      const hoisted: Set<string> | undefined = ic.scope.hoisted;
      if (hoisted?.size) lines.unshift(`let ${[...hoisted].map((h) => jsIdent(h)).join(", ")};`);
      if (isConcern)
        after.push(
          `${name}.included(null, function (this: ${host}): void {\n${indent(lines).join("\n")}\n});`,
        );
      else
        members.push(
          `static [${this.lw.rc(ic, "included")}](base: ${host}): void {\n${indent(lines.map((l) => l.replace(/\bthis\b/g, "base"))).join("\n")}\n}`,
        );
    }
    if (sclassStmts.length) {
      const scVar = `${name}Singleton`;
      const tc = this.baseCtx(u, f, { selfKind: "static", selfExpr: scVar });
      const lines = this.lw.block(sclassStmts, tc, false);
      const hoisted: Set<string> | undefined = tc.scope.hoisted;
      if (hoisted?.size) lines.unshift(`let ${[...hoisted].map((h) => jsIdent(h)).join(", ")};`);
      if (lines.some((l) => l.includes(scVar)))
        after.push(`const ${scVar} = ${this.lw.rc(tc, "rbObjSingletonClass")}(${name});`);
      after.push(...lines);
    }
    if (staticStmts.length) {
      const sc = this.baseCtx(u, f, { selfKind: "static", selfExpr: name });
      const lines = this.lw.block(staticStmts, sc, false);
      const hoisted: Set<string> | undefined = sc.scope.hoisted;
      if (hoisted?.size) lines.unshift(`let ${[...hoisted].map((h) => jsIdent(h)).join(", ")};`);
      if (lines.length) after.push(`{\n${indent(lines).join("\n")}\n}`);
    }
    if (!members.some((m) => /^static toString\(/.test(m)))
      members.unshift(`static toString(): string {\n  return ${JSON.stringify(u.fqn)};\n}`);
    // A `ClassMethods` holder is `extend`ed: its methods are statics, which
    // `extend` copies from an unmarked class (a marked one gives its prototype's).
    if (!/(^|::)ClassMethods$/.test(u.fqn))
      members.unshift(`static readonly [${this.lw.rc(ctxStatic, "classModule")}] = true;`);
    const sig = this.ivarDecls(u, f, members);
    // What `extend(M, Concern)` gives it, and the `ClassMethods` constant that
    // `rbModConstSet` seats on it: declared, so they type-check.
    if (isConcern) {
      sig.push(
        `declare static included: ${this.lw.imp(ctxStatic, "@blazetrails/ruby-compat", "Extended")}<typeof ${this.lw.as(ctxStatic, "Concern")}>["included"];`,
      );
      const cm = this.resolver.exportNames.get(`${u.fqn}::ClassMethods`);
      if (cm)
        sig.push(
          `declare static ClassMethods: typeof ${cm.tsFile === f.tsFile ? cm.name : this.lw.impType(ctxStatic, `@root/${cm.tsFile.replace(/\.ts$/, ".js")}`, cm.name)};`,
        );
    }
    const text = [
      ...bodyLocals,
      `export class ${name} {`,
      ...indent([...sig, ...pairSetters(dedupeMembers(members)).flatMap((m) => ["", m])]),
      "}",
      ...after,
    ].join("\n");
    return { text, defs };
  }

  emitModule(u: Unit, name: string, f: FileCtx): { text: string; defs: number } {
    // A namespace the hand port seats in `namespaces.ts` keeps the seat object;
    // every other module is a class.
    // A mixin is a class; a module of functions keeps the hand port's object
    // of functions (activejob arguments.ts), as do a module that mixes into its
    // own singleton class (a JS class has no singleton class apart from its
    // statics) and a namespace seat.
    if (this.resolver.isClassModule(u.fqn) && this.resolver.exportNames.get(u.fqn)?.name === name)
      return this.emitModuleClass(u, name, f);
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
      } else if (s.k === "lasgn") {
        // A local of the module body (marcel tables.rb:2391), in source order.
        fns.push(...this.lw.stmt(s, ctxTop, false));
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
              return `${propKey(tsMethodName(nw, u.fqn))}(${[`this: ${this.hostThis(u, f)}`, ps].filter(Boolean).join(", ")}): any {\n  return this.${tsMethodName(old, u.fqn)}(${as});\n}`;
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
    let includedLines: string[] = [];
    if (includedBlock) {
      const ic = this.baseCtx(u, f, { selfKind: "static", selfExpr: "base" });
      const lines = this.lw.block(this.lw.seqBody(includedBlock.body), ic, false);
      const hoisted: Set<string> | undefined = ic.scope.hoisted;
      if (hoisted?.size)
        lines.unshift(`let ${[...hoisted].map((h) => `${jsIdent(h)}: any`).join(", ")};`);
      includedLines = lines;
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
    const concernLine = (): string =>
      isConcern
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
    // A method written inline is hoisted to a named function, so the Module's
    // method table can be typed by `typeof` each entry (`Included<>` / `Extended<>`).
    const hoistedFns: string[] = [];
    const defs2 = dedupeMembers(members).map((m) => {
      let line = toDefineMethod(m);
      const inline =
        /^((?:\/\*\*[^]*?\*\/\n)?)mod\.defineMethod\("([\w$]+)", ((?:async )?function \([^]*)\);$/.exec(
          line,
        );
      if (inline) {
        const fn = `${inline[2]}$method`;
        hoistedFns.push(`${inline[1]}const ${fn} = ${inline[3]};`);
        line = `mod.defineMethod(${JSON.stringify(inline[2])}, ${fn});`;
      }
      const hit = /^mod\.defineMethod\("([\w$]+)", ([\w$]+|function[\s\S]*)\);$/.exec(line);
      return hit && readerHalves.has(hit[1])
        ? `mod.moduleEval((table: any) => Object.defineProperty(table, ${JSON.stringify(hit[1])}, { configurable: true, get: ${hit[2]} }));`
        : line;
    });
    const out: string[] = [...fns.flatMap((x) => [x, ""])];
    // The Module's instance-method table as a type: each `defineMethod` entry.
    const tableType = (): string => {
      const entries = defs2
        .map((l) => /^mod\.defineMethod\("([\w$]+)", ([\w$]+)\);$/.exec(l))
        .filter((h): h is RegExpExecArray => !!h)
        .map(
          (h) => `${/^[A-Za-z_$][\w$]*$/.test(h[1]) ? h[1] : JSON.stringify(h[1])}: typeof ${h[2]}`,
        );
      return entries.length ? `<{ ${entries.join("; ")} }>` : "";
    };
    // CLAUDE.md "Module mixins": a module is a plain object of its `this`-typed
    // functions, which `include()` copies onto the includer (activerecord's
    // `Integration`). It is a ruby-compat `Module` only for what needs its
    // method table: a `super` from one of its methods (`superMethod`),
    // `attr_*` / an accessor half (`attrReader`, `moduleEval`), a module it
    // includes or extends itself, or `ActiveSupport::Concern`'s machinery.
    const mixes = tops.some(
      (t: N) =>
        t.k === "call" && t.recv === null && ["include", "extend", "prepend"].includes(t.name),
    );
    const usesSuper = [...fns, ...members].some((t) => t.includes(`${name}.superMethod(`));
    // A namespace other constants are seated on, and a Concern's `ClassMethods`
    // (which `append_features` extends the includer with), keep the Module.
    // A module a test file defines is used as a value (an adapter module whose
    // name is read), so it keeps the Module that carries its identity and name.
    // A Concern is a plain object too (activerecord's `Integration`): its
    // `[included]` hook does `append_features`' work on the includer, extending
    // it with `ClassMethods` and then running the `included do` block. It keeps
    // the Module when another module includes it, since Concern's
    // `append_features` then records it as a dependency of that module rather
    // than running against it, and when it includes others (`mixes`), whose
    // methods must sit beneath its own.
    const cmFqn = `${u.fqn}::ClassMethods`;
    const includedByModule = [...this.index.scopes.values()].some(
      (s) =>
        s.kind === "module" &&
        [...s.includes, ...s.prepends].some((p) => {
          const j = p.join("::");
          return j === u.fqn || u.fqn.endsWith(`::${j}`);
        }),
    );
    // A module of functions (`extend self`, `module_function`) is a plain object
    // carrying its Ruby `name`, as the hand port's namespace objects do
    // (`{ name: "ActiveJob", loadPath }`): nested constants seat on it and
    // `mattr_accessor` defines on it, so only `super` or `module_eval` need more.
    const ownExp = this.resolver.exportNames.get(u.fqn);
    const reopening = !!ownExp && ownExp.tsFile !== f.tsFile;
    const fnModule = !!this.index.scopes.get(u.fqn)?.moduleFunction || reopening;
    const plain = fnModule
      ? !usesSuper && !defs2.some((l) => l.includes("moduleEval("))
      : !f.rubyFile.startsWith("test/") &&
        !(isConcern && (includedByModule || !!u.late?.length)) &&
        // A Concern's `ClassMethods` stays a Module: extended as its own layer, a
        // subclass's override (TestHelper's per-job `queue_adapter`) sits above it.
        !(
          u.fqn.endsWith("::ClassMethods") &&
          this.index.scopes.get(u.fqn.slice(0, -"::ClassMethods".length))?.concern
        ) &&
        ![...this.index.scopes.keys()].some(
          (k) => k.startsWith(`${u.fqn}::`) && !(isConcern && k === cmFqn),
        ) &&
        !modAttrs.length &&
        !mixes &&
        !usesSuper &&
        !defs2.some((l) => l.includes("moduleEval("));
    const ModuleRef = plain ? "" : this.lw.rc(this.baseCtx(u, f, {}), "Module");
    const modLines = [...modAttrs, ...defs2];
    const ctorBody = modLines.length ? `(mod: any) => {\n${indent(modLines).join("\n")}\n}` : "";
    // A plain module's constants (`VERSION::STRING`) are its properties.
    const consts = u.body.filter((c: N) => c.k === "casgn" && c.path?.length === 1);
    // Its singleton functions are its own members too, rather than seated later.
    if (plain && !fnModule) this.plainModules.add(u.fqn);
    if (plain && isConcern) {
      this.plainConcerns.add(u.fqn);
      const hc = this.baseCtx(u, f, {});
      const cmExp = this.resolver.exportNames.get(cmFqn);
      const cm = this.index.scopes.has(cmFqn)
        ? cmExp && cmExp.tsFile === f.tsFile
          ? cmExp.name
          : cmFqn.split("::").join("")
        : "";
      const hook = [...(cm ? [`${this.lw.rc(hc, "extend")}(base, ${cm});`] : []), ...includedLines];
      if (hook.length)
        members.push(
          `[${this.lw.rc(hc, "included")}](base: any): void {\n${indent(hook).join("\n")}\n}`,
        );
      incl = "";
    }
    const plainMembers = [
      // Not on a reopening: an includer extended with it would take its `name`.
      // Nor where the module defines its own `name`, which Ruby's lookup finds first.
      ...(plain && fnModule && !reopening && !seatNames.includes("name")
        ? [`name: ${JSON.stringify(u.fqn)}`]
        : []),
      ...consts.map((c: N) => c.path[0] as string),
      ...(plain ? seatNames : []),
      ...dedupeMembers(members),
    ];
    // Module-level state the singleton functions keep on it (`JobBuffer.@values`).
    const stateful = plain && fns.some((t) => new RegExp(`\\b${name}\\._\\w`).test(t));
    const modExpr = plain
      ? plainMembers.length
        ? `{\n${indent(plainMembers.join(",\n").split("\n")).join("\n")},\n}`
        : "{}"
      : seatNames.length
        ? `Object.assign(new ${ModuleRef}${tableType()}(${ctorBody}), { ${seatNames.join(", ")} })`
        : `new ${ModuleRef}${tableType()}(${ctorBody})`;
    // The gem's top namespace is seated by the hand port's `namespaces.ts`, a
    // plain object extended with `ActiveSupport::Autoload` (CLAUDE.md, "Call-time
    // constant resolution"); this file adds its module functions, not a second object.
    if (!ctorBody && handNamespaceFqns().get(u.fqn) === name) {
      // The same object, typed `any`: the generated module functions keep their
      // state on it (`X._x`), where the hand port uses module-level variables.
      const seat = this.lw.imp(this.baseCtx(u, f, {}), "@root/namespaces.js", name, `${name}Seat`);
      out.push(`export const ${name}: any = ${seat};`);
      if (seatLine) out.push(seatLine);
      if (concernLine()) out.push(concernLine());
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
    if (!plain) out.push(...hoistedFns.flatMap((x) => [x, ""]));
    out.push(`export const ${name}${plain && !stateful ? "" : plain ? ": any" : ""} = ${modExpr};`);
    // A constant in the module body (`VERSION::STRING`) lives in the module's
    // constant table, as well as the file's flat export.
    {
      const cs = plain ? [] : u.body.filter((s: N) => s.k === "casgn" && s.path?.length === 1);
      const set = cs.length ? this.lw.rc(this.baseCtx(u, f, {}), "rbModConstSet") : "";
      for (const c of cs) out.push(`${set}(${name}, ${JSON.stringify(c.path[0])}, ${c.path[0]});`);
    }
    if (seatLine && !plain && !modExpr.startsWith("Object.assign(")) out.push(seatLine);
    if (isConcern && !plain) out.push(concernLine());
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

/**
 * A setter beside a getter of the same name takes the getter's type: its
 * parameter is left unannotated, since TypeScript otherwise reads an
 * unannotated getter's type off the setter's parameter (`unknown`), and the
 * class stops being assignable to an ancestor that typed the property.
 */
function pairSetters(members: string[]): string[] {
  const getters = new Set(
    members
      .map((m) => /^(?:\/\*\*[^]*?\*\/\n)?((?:static )?)get ([\w$]+)\(/.exec(m))
      .filter((x): x is RegExpExecArray => !!x)
      .map((x) => `${x[1]}${x[2]}`),
  );
  // A reader/writer pair emitted as one member (`get x() …\n\nset x(value: any) …`).
  for (const m of members)
    for (const g of m.matchAll(/(?:^|\n)((?:static )?)get ([\w$]+)\(/g))
      getters.add(`${g[1]}${g[2]}`);
  return members.map((m) =>
    m.replace(
      /(^|\n)((?:static )?)set ([\w$]+)\((\w+): any\)/g,
      (all, pre: string, st: string, name: string, v: string) =>
        getters.has(`${st}${name}`) ? `${pre}${st}set ${name}(${v})` : all,
    ),
  );
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
