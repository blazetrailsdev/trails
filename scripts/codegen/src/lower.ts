/* eslint-disable @typescript-eslint/no-explicit-any -- the IR is untyped JSON from the Ruby front-end */
/**
 * Pass 7: lowering. One function per IR node kind, emitting TypeScript text.
 *
 * Every Ruby idiom CLAUDE.md lists as "does not translate literally" is decided
 * here exactly once:
 *   - truthiness       → `x != null && x !== false` (or `(e ?? false) !== false`)
 *                        unless the node is statically boolean or object-typed
 *   - `a || b` (value) → a truthiness test of a hoisted temp, `? _t : b`
 *   - `h.fetch`        → ruby-compat `fetch`, never `??`
 *   - present?/blank?  → activesupport `isPresent` / `isBlank` / `presence`
 *   - kwargs           → one trailing options object, camelCase keys (RFC 0149)
 *   - symbols          → bare strings
 *   - dup/clone/send/respond_to?/is_a? → the ruby-compat object protocol
 * Anything the lowering cannot express is emitted as a `declined(...)` call
 * carrying the Ruby source, so the output still parses and the gap is counted.
 */
import { rubyMethodToTsIgnoringSkip, snakeToCamel } from "../../parity/conventions.js";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { RUBY_COMPAT_EXPORTS } from "../../parity/ruby-compat.js";
import { operatorSpelling } from "../../api-compare/operator-order-spelling.js";
import type { N, Param } from "./ir.js";
import { walk } from "./ir.js";
import { GemIndex, lexicalChain, qualify, rubyAncestors, type ScopeInfo } from "./gem-index.js";
import { GEM, ROOT, coreExtSends, handNamespaceAutoloads, handNamespaceFqns } from "./gem.js";
import type { Resolver } from "./resolve.js";
import { isBool, isObjectLike, type TypeRef } from "./types.js";

export const RESERVED = new Set(
  (
    "break case catch class const continue debugger default delete do else enum export extends false finally for " +
    "function if import in instanceof new null return super switch this throw true try typeof var void while with " +
    "yield let static implements interface package private protected public await arguments eval undefined"
  ).split(" "),
);

export function jsIdent(rubyName: string): string {
  let n =
    rubyName.startsWith("_") && rubyName.length > 1
      ? "_" + snakeToCamel(rubyName.slice(1))
      : snakeToCamel(rubyName);
  if (n === "") n = "_";
  if (RESERVED.has(n)) n = n + "_";
  return n;
}

/** A Ruby name used as a property key: camelCase, reserved words allowed (`x.default`). */
export function propName(rubyName: string): string {
  const n = jsIdent(rubyName);
  return n.endsWith("_") && RESERVED.has(n.slice(0, -1)) ? n.slice(0, -1) : n;
}

/** Ruby method name → TS member name (first conventions candidate). */
export function tsMethodName(rubyName: string, fqn?: string, singleton = false): string {
  const op = fqn ? operatorSpelling(fqn, singleton ? `self.${rubyName}` : rubyName) : undefined;
  if (op && op.length) return op[0];
  const DEFAULT_OPS: Record<string, string> = {
    "==": "equals",
    "[]": "get",
    "[]=": "set",
    "<=>": "compareTo",
    "+": "plus",
    "-": "minus",
    "|": "union",
    "&": "intersect",
    "<<": "append",
    "===": "caseEq",
    "=~": "match",
    "!": "not",
    "!=": "notEquals",
    "*": "times",
    "/": "divide",
    "%": "modulo",
    "<": "lt",
    ">": "gt",
    "<=": "lte",
    ">=": "gte",
    "+@": "uplus",
    "-@": "negate",
    "!~": "notMatch",
    "~": "bitwiseNot",
    ">>": "rshift",
    "^": "xor",
    "**": "pow",
  };
  if (DEFAULT_OPS[rubyName]) return DEFAULT_OPS[rubyName];
  if (rubyName === "initialize") return "constructor";
  if (rubyName === "to_s" || rubyName === "to_str") return "toString";
  const c = rubyMethodToTsIgnoringSkip(rubyName);
  if (c && c.length) return c[0];
  return jsIdent(rubyName.replace(/[?!=]$/, ""));
}

export type DeclineReason =
  | "unhandled-node"
  | "sclass-include-on-class"
  | "const-unresolved"
  | "retry"
  | "break-in-block"
  | "redo"
  | "defined"
  | "gvar"
  | "masgn-complex"
  | "super-in-module"
  | "method-missing"
  | "string-mutation"
  | "for-loop"
  | "case-in"
  | "ruby-eval"
  | "tsc-diagnostic"
  | "async-in-constructor"
  | "regex-unsupported"
  | "this-before-super";

interface Scope {
  locals: Set<string>;
  parent?: Scope;
  /** Flow-insensitive local types: first typed assignment wins; a conflict clears it. */
  types?: Map<string, TypeRef>;
  /** Locals first assigned inside a nested block, declared at the function's top. */
  hoisted?: Set<string>;
  /** The Ruby body this function scope lowers, for counting a local's assignments. */
  body?: N;
  assigns?: Map<string, number>;
}

export interface FileCtx {
  rubyFile: string;
  tsFile: string;
  imports: Map<string, Map<string, string>>; // module specifier → (exported name → local name)
  /** Names used only as types (`import type { … }`), same shape as `imports`. */
  typeImports?: Map<string, Map<string, string>>;
  /** Each class's ivar types, by class fqn then Ruby ivar name (emit.ts `ivarTypes`). */
  ivarTypes?: Map<string, Map<string, TypeRef>>;
  usedLocalNames: Set<string>;
  declines: { reason: DeclineReason; line?: number; ruby: string }[];
  stats: Record<string, number>;
  /**
   * The file keeps a Symbol's leading colon (`":key"`, ruby-compat `isSymbol` /
   * `stringToSym` / `symbolToS`), as CLAUDE.md requires where control flow turns
   * on `Symbol === x`. Taken from the hand port: its twin imports `isSymbol`.
   */
  symbolColon?: boolean;
  /** The file's top-level function names, so a module function is not emitted twice. */
  fileFns?: Set<string>;
  /** The file's singleton (`def self.x`) function names. */
  sfnNames?: Set<string>;
}

interface Ctx {
  /** The local an assignment being lowered writes (`x = x(...)` keeps `x` the call). */
  assigning?: string;
  /** Statements a parameter list needs ahead of the body (a `*rest` block's split). */
  prologue?: string[];
  f: FileCtx;
  /** Lexical nesting of fqns (for constant lookup). */
  nesting: string[];
  /** fqn of the class/module whose body we are in. */
  owner?: string;
  selfKind: "instance" | "static" | "module" | "top";
  /** Inside a `function (this: any)` (an `instance_exec`ed block): `this` is not a type. */
  thisAny?: boolean;
  selfExpr: string;
  scope: Scope;
  blockVar?: string;
  /** Inside an arrow function body (block). `next` → return. */
  inBlock: boolean;
  /** Inside a JS loop body (while / for-of) at the current function level. */
  inLoop: boolean;
  defName?: string;
  defParams?: Param[];
  /** The hand twin's TS types for the method's positional parameters, by position. */
  paramTypes?: (string | null)[];
  /** Ruby `def` is singleton (static). */
  singleton?: boolean;
  isModule?: boolean;
  isCtor?: boolean;
  /** Current method's async-ness (decided by the async pass). */
  async?: boolean;
  /** Inside the loop a `begin … retry` lowered to; `retry` is `continue`. */
  inRetry?: boolean;
  /** The hand twin of the def being lowered is async. */
  defAsync?: boolean;
  /** A `def obj.m` on an object: `super` is the method of the object's class. */
  objSingletonSuper?: boolean;
  /** Set when an `await` is emitted in the current JS function (method, arrow, IIFE). */
  asyncBox?: { awaits: boolean };
  /** Lowering inside a nested JS block (if/case/try/loop): new locals hoist to fnScope. */
  nested?: boolean;
  /** The function-level scope hoisted declarations land in. */
  fnScope?: Scope;
  /** The receiver of an explicit `super` inside a module function. */
  /**
   * In a constructor: the module `initialize` bodies still ahead in Ruby's
   * ancestor chain, which a statement `super` writes in place (CLAUDE.md, "A
   * module's `initialize` is inlined into the constructor"; RFC 0188).
   */
  inlineChain?: InlineHook[];
  /** The hooks a constructor actually inlined, for its `@inlinedFrom` tags. */
  inlined?: InlineHook[];
  /**
   * In an inlined `initialize` with a `*rest` or `(...)` parameter: the call
   * arguments it took, which its own bare `super` forwards on unchanged.
   */
  forwarded?: { rest: string[]; kw: string | null; blk: string | null };
  /** Inside a `rescue` arm: the JS name of the exception being handled (Ruby `$!`). */
  rescued?: string;
  /** A constructor's trailing `errinfo` parameter, Ruby's `$!` in its body. */
  errinfoParam?: string;
  /** Lowering an inlined `ClassMethods#new`: its bare `super` is the object `Class#new` built. */
  superIsSelf?: boolean;
  /**
   * Inside a ported test body (`test "…" do`): assertions become `expect`
   * forms, and every other call is awaited, since which activejob calls are
   * async is not known here (awaiting a plain value is harmless).
   */
  testMode?: boolean;
}

/** A module `initialize` a constructor can inline. */
export interface InlineHook {
  module: string;
  def: N;
  /** Ruby file of the `def`, relative to the gem's lib (activerecord) or null for a dependency. */
  file: string | null;
  /** The `@inlinedFrom` citation, `rails/v8.0.2/<gem>/lib/<file>:<first>-<last>`. */
  cite: string;
}

/**
 * CLAUDE.md "A Ruby Symbol is a JS string": a ported test whose subject reads
 * Symbol-ness (`ActiveJob::Arguments`' `_aj_symbol_keys`) keeps the colon on its
 * Symbol literals and Symbol hash keys (`":a"`), as the hand tests write them.
 */
function symColonHere(ctx: Ctx): boolean {
  return !!ctx.f.symbolColon && ctx.f.rubyFile.startsWith("test/");
}

const RB_CORE_CLASSES: Record<string, string> = {
  String: "rbCString",
  Integer: "rbCInteger",
  Float: "rbCFloat",
  Numeric: "rbCNumeric",
  Array: "rbCArray",
  Symbol: "rbCSymbol",
  NilClass: "rbCNilClass",
  TrueClass: "rbCTrueClass",
  FalseClass: "rbCFalseClass",
};
const FLAT_ASSERTION_MODULES = new Set([
  "ActiveSupport::Testing::Assertions",
  "Minitest::Assertions",
]);

export class Lowerer {
  constructor(
    readonly index: GemIndex,
    readonly resolver: Resolver,
  ) {}

  // ───────────────────────────── helpers ─────────────────────────────

  decline(ctx: Ctx, reason: DeclineReason, node: N, ruby?: string): string {
    const src = ruby ?? node?.src ?? node?.k ?? "";
    ctx.f.declines.push({ reason, line: node?.l, ruby: String(src).slice(0, 160) });
    this.imp(ctx, "@root/codegen-declined.js", "declined");
    return `declined(${JSON.stringify(`${ctx.f.rubyFile}:${node?.l ?? 0}`)}, ${JSON.stringify(reason)}, ${JSON.stringify(String(src).slice(0, 160))})`;
  }

  imp(ctx: Ctx, spec: string, name: string, local = name): string {
    let m = ctx.f.imports.get(spec);
    if (!m) ctx.f.imports.set(spec, (m = new Map()));
    const existing = m.get(name);
    if (existing) return existing;
    // A package helper the file shadows with its own declaration
    // (`FinderMethods#take` beside ruby-compat's `take`) is reached through a
    // namespace import, as the hand port's `RubyCompat.except` does
    // (relation/spawn-methods.ts): the call keeps the helper's name.
    const NS: Record<string, string> = {
      "@blazetrails/ruby-compat": "RubyCompat",
      "@blazetrails/activesupport": "ActiveSupportExports",
    };
    // `typedSplat` casts with TS's global `Parameters` / `ConstructorParameters`
    // utility types, which a binding of that name would shadow (a ported
    // `ActionController::Parameters` stub).
    if (local === name && (name === "Parameters" || name === "ConstructorParameters"))
      local = `${name}Class`;
    if (local === name && name !== "*" && NS[spec] && ctx.f.usedLocalNames.has(name)) {
      m.delete(name);
      if (m.size === 0) ctx.f.imports.delete(spec);
      return `${this.imp(ctx, spec, "*", NS[spec])}.${name}`;
    }
    m.set(name, local);
    return local;
  }

  /**
   * A name used only in a type, imported with `import type` at the top of the
   * file (no runtime edge, so no import cycle). A name the file already imports
   * as a value is reused.
   */
  impType(ctx: Ctx, spec: string, name: string): string {
    const value = ctx.f.imports.get(spec)?.get(name);
    if (value) return value;
    const tm = (ctx.f.typeImports ??= new Map());
    let m = tm.get(spec);
    if (!m) tm.set(spec, (m = new Map()));
    const existing = m.get(name);
    if (existing) return existing;
    const taken = new Set<string>(ctx.f.usedLocalNames);
    for (const mm of [...ctx.f.imports.values(), ...tm.values()])
      for (const l of mm.values()) taken.add(l);
    let local = name;
    for (let i = 2; taken.has(local); i++) local = `${name}${i}`;
    m.set(name, local);
    return local;
  }

  /** A ruby-compat helper; falls back to the generated runtime shim (counted as wanted). */
  rc(ctx: Ctx, name0: string): string {
    // Spellings the lowering asks for that ruby-compat exports under its own
    // MRI-derived name (scripts/parity/ruby-compat.ts RUBY_COMPAT_EXPORTS).
    const RENAMES: Record<string, string> = {
      rbIvarGet: "rbObjIvarGet",
      rbIvarSet: "rbObjIvarSet",
      rbIvarDefined: "rbObjIvarDefined",
      rbInteger: "kernelInteger",
      rbFloat: "kernelFloat",
      rbFCatch: "kernelCatch",
      rbFThrow: "kernelThrow",
      rbToI: "toI",
      rbToA: "toA",
      rbToH: "toH",
      rbFormat: "format",
      jsDefineMethod: "rbModDefineMethod",
    };
    const name = RENAMES[name0] ?? name0;
    if (
      this.resolver.pkgExports("@blazetrails/activesupport").has(name) &&
      !this.resolver.pkgExports("@blazetrails/ruby-compat").has(name)
    )
      return this.imp(ctx, "@blazetrails/activesupport", name);
    if (this.resolver.pkgExports("@blazetrails/ruby-compat").has(name))
      return this.imp(ctx, "@blazetrails/ruby-compat", name);
    this.resolver.wanted.set(name, (this.resolver.wanted.get(name) ?? 0) + 1);
    return this.imp(ctx, "@root/codegen-runtime.js", name);
  }

  as(ctx: Ctx, name: string): string {
    if (this.resolver.pkgExports("@blazetrails/activesupport").has(name))
      return this.imp(ctx, "@blazetrails/activesupport", name);
    if (this.resolver.pkgExports("@blazetrails/ruby-compat").has(name))
      return this.imp(ctx, "@blazetrails/ruby-compat", name);
    this.resolver.wanted.set(name, (this.resolver.wanted.get(name) ?? 0) + 1);
    return this.imp(ctx, "@root/codegen-runtime.js", name);
  }

  stat(ctx: Ctx, key: string): void {
    ctx.f.stats[key] = (ctx.f.stats[key] ?? 0) + 1;
  }

  declareLocal(ctx: Ctx, name: string): boolean {
    for (let s: Scope | undefined = ctx.scope; s; s = s.parent)
      if (s.locals.has(name)) return false;
    ctx.scope.locals.add(name);
    return true;
  }

  /** Declare `name` if new; returns the `let ` prefix, or hoists it when nested. */
  letFor(ctx: Ctx, name: string): string {
    if (!this.declareLocal(ctx, name)) return "";
    if (!ctx.nested) return "let ";
    const target = ctx.fnScope ?? ctx.scope;
    (target.hoisted ??= new Set()).add(name);
    this.stat(ctx, "hoisted-local");
    return "";
  }

  /**
   * The declaration for a new local, or the bare name when it already exists or is
   * hoisted. A local its function assigns once is a `const` whose type TypeScript
   * infers; one Ruby reassigns, possibly to another type, stays `let x: any`.
   */
  decl(ctx: Ctx, name: string, value?: string): string {
    const pre = this.letFor(ctx, name);
    if (!pre) return jsIdent(name);
    const id = jsIdent(name);
    if (this.assignCount(ctx, name) !== 1 || value === undefined || value === "null")
      return `let ${id}: any`;
    if (value.startsWith("{")) return `const ${id}: Record<string, any>`;
    if (value === "[]") return `const ${id}: any[]`;
    if (this.helperResult(ctx, value)) return `const ${id}: any`;
    return `const ${id}`;
  }

  /**
   * Whether `value` is the result of a ruby-compat or activesupport helper. Those
   * helpers type an arbitrary Ruby value as `unknown`, which the Ruby code reads
   * members off freely.
   */
  helperResult(ctx: Ctx, value: string): boolean {
    const head = /^\(?(?:await )?\(?([\w$]+)(?:\.[\w$]+)?\(/.exec(value)?.[1];
    if (!head) return false;
    for (const spec of ["@blazetrails/ruby-compat", "@blazetrails/activesupport"])
      for (const local of ctx.f.imports.get(spec)?.values() ?? []) if (local === head) return true;
    return false;
  }

  assignCount(ctx: Ctx, name: string): number {
    const fs = ctx.fnScope;
    if (!fs?.body) return Infinity;
    if (!fs.assigns) {
      const counts = new Map<string, number>();
      const bump = (x: string) => counts.set(x, (counts.get(x) ?? 0) + 1);
      walk(fs.body, (n) => {
        if (n.k === "def" || n.k === "class" || n.k === "module" || n.k === "sclass") return false;
        if (n.k === "lasgn") bump(n.name);
        else if (
          n.k === "call" &&
          n.recv?.k === "lvar" &&
          (n.name === "<<" || n.name.endsWith("!"))
        )
          bump(n.recv.name);
        else if (n.k === "masgn" || n.k === "opasgn" || n.k === "for") {
          walk(n, (m) => {
            if (m.k === "lasgn" || m.k === "lvar") bump(m.name);
          });
          if (n.k === "for" && n.var) bump(n.var);
        }
      });
      fs.assigns = counts;
    }
    return fs.assigns.get(name) ?? 0;
  }

  nest(ctx: Ctx): Ctx {
    return ctx.nested ? ctx : { ...ctx, nested: true };
  }

  isLocal(ctx: Ctx, name: string): boolean {
    for (let s: Scope | undefined = ctx.scope; s; s = s.parent) if (s.locals.has(name)) return true;
    return false;
  }

  child(ctx: Ctx, over: Partial<Ctx>): Ctx {
    return { ...ctx, ...over };
  }

  // ───────────────────────────── statements ─────────────────────────────

  /** Lower a statement list. `tail` marks the last statement as the value. */
  block(nodes: N[], ctx: Ctx, tail: boolean): string[] {
    const out: string[] = [];
    nodes.forEach((n, i) => out.push(...this.stmt(n, ctx, tail && i === nodes.length - 1)));
    if (tail && nodes.length === 0) {
      /* implicit nil */
    }
    return out;
  }

  seqBody(n: N | null | undefined): N[] {
    if (!n) return [];
    if (n.k === "seq") return n.body;
    return [n];
  }

  stmt(n: N, ctx: Ctx, tail: boolean): string[] {
    const ret = (e: string) => (tail ? [`return ${e};`] : [`${e};`]);
    // An unset instance variable reads nil (`def priority; …; @priority; end`); a
    // JS property never set reads `undefined`, which a `fetch` treats as no key.
    if (tail && n.k === "ivar" && !ctx.inBlock)
      return [`return ${this.ivar(n.name, ctx)} ?? null;`];
    switch (n.k) {
      case "seq":
        return this.block(n.body, ctx, tail);
      case "if": {
        const cond = this.cond(n.cond, ctx);
        const restore = this.narrow(n.cond, ctx);
        const t = this.block(this.seqBody(n.then), this.nest(ctx), tail);
        restore();
        const e = n.else ? this.block(this.seqBody(n.else), this.nest(ctx), tail) : [];
        const out = [`if (${cond}) {`, ...indent(t), `}`];
        if (e.length) {
          if (this.isElseIf(n.else) && e[0].startsWith("if (")) {
            out[out.length - 1] = `} else ${e[0]}`;
            out.push(...e.slice(1));
          } else {
            out[out.length - 1] = `} else {`;
            out.push(...indent(e), `}`);
          }
        }
        if (tail && !n.else) out.push("return null;");
        return out;
      }
      case "case":
        return this.caseStmt(n, ctx, tail);
      case "while": {
        const body = this.block(
          this.seqBody(n.body),
          this.child(ctx, { inLoop: true, nested: true }),
          false,
        );
        const cond = this.cond(n.cond, ctx);
        const out = n.do_while
          ? [`do {`, ...indent(body), `} while (${cond});`]
          : [`while (${cond}) {`, ...indent(body), `}`];
        if (tail) out.push("return null;");
        return out;
      }
      case "for": {
        const v = n.var?.k === "lvar" ? n.var.name : null;
        if (!v) return ret(this.decline(ctx, "for-loop", n, "for"));
        const pre = this.letFor(ctx, v);
        const body = this.block(
          this.seqBody(n.body),
          this.child(ctx, { inLoop: true, nested: true }),
          false,
        );
        const out = [
          `${pre ? `let ${jsIdent(v)};\n` : ""}for (${jsIdent(v)} of ${this.iter(n.iter, ctx)}) {`,
          ...indent(body),
          `}`,
        ];
        if (tail) out.push("return null;");
        return out;
      }
      case "begin":
        return this.beginStmt(n, ctx, tail);
      case "return": {
        if (ctx.inBlock) {
          this.stat(ctx, "return-in-block");
        }
        return [n.value ? `return ${this.expr(n.value, ctx)};` : `return null;`];
      }
      case "next":
        if (ctx.inLoop) return [`continue;`];
        return [n.value ? `return ${this.expr(n.value, ctx)};` : `return null;`];
      case "break":
        if (ctx.inLoop) return [`break;`];
        return ret(this.decline(ctx, "break-in-block", n, "break"));
      case "retry":
        if (ctx.inRetry) return ["continue;"];
        return ret(this.decline(ctx, "retry", n, "retry"));
      case "lasgn": {
        const name = n.name;
        // Ruby makes `name` a local from its left-hand side on (parse.y), so the
        // right-hand side already sees it shadowing a same-named function.
        const prevAssigning = ctx.assigning;
        ctx.assigning = jsIdent(name);
        const v =
          n.value?.k === "hash" && OPTIONS_NAME.test(name)
            ? this.hashLit(n.value.pairs, ctx, true)
            : this.expr(n.value, ctx);
        ctx.assigning = prevAssigning;
        const line = `${this.decl(ctx, name, v)} = ${v};`;
        this.noteLocalType(ctx, name, n.value);
        return tail ? [line, `return ${jsIdent(name)};`] : [line];
      }
      case "masgn":
        return this.masgn(n, ctx, tail);
      case "opasgn":
        return this.opasgnStmt(n, ctx, tail);
      case "super": {
        const inl = this.inlineSuper(n, ctx);
        if (inl) return inl;
        return ret(this.expr(n, ctx));
      }
      case "call": {
        const special = this.callStmt(n, ctx, tail);
        if (special) return special;
        return ret(this.expr(n, ctx));
      }
      // `def obj.m(...)` on a local (a stub in a test): a method of that object
      // alone, its singleton class's (CLAUDE.md "singleton_class is a per-object
      // subclass"); seated as an own property, and its `super` reaches the class's.
      case "def":
        if (n.singleton && n.receiver?.k === "lvar") {
          const recv = this.expr(n.receiver, ctx);
          // A `respond_to?` override is asked the TS member name (rbObjRespondTo).
          const body =
            n.name === "respond_to?"
              ? JSON.parse(JSON.stringify(n.body), (_k, v) =>
                  v && v.k === "sym" ? { ...v, k: "str", value: tsMethodName(v.value) } : v,
                )
              : n.body;
          const fn = this.selfFunction(n.params, body, ctx, {
            testMode: false,
            defName: n.name,
            defParams: n.params,
            objSingletonSuper: true,
          });
          return [`${recv}.${tsMethodName(n.name)} = ${fn};`];
        }
        return ret(this.decline(ctx, "unhandled-node", n, `nested ${n.k} in body`));
      case "class":
      case "module":
      case "sclass":
        return ret(this.decline(ctx, "unhandled-node", n, `nested ${n.k} in body`));
      case "nil":
        return tail ? ["return null;"] : [];
      case "alias":
      case "undef":
        return [];
      default:
        return ret(this.expr(n, ctx));
    }
  }

  private isElseIf(e: N | null): boolean {
    const b = this.seqBody(e);
    return b.length === 1 && b[0].k === "if";
  }

  caseStmt(n: N, ctx: Ctx, tail: boolean): string[] {
    const out: string[] = [];
    let subj: string | null = null;
    if (n.subject) {
      if (n.subject.k === "lvar" || n.subject.k === "ivar" || n.subject.k === "self")
        subj = this.expr(n.subject, ctx);
      else {
        const tmp = this.tmp(ctx, "caseValue");
        out.push(`const ${tmp} = ${this.expr(n.subject, ctx)};`);
        subj = tmp;
      }
    }
    n.whens.forEach((w: any, i: number) => {
      const conds = w.conds.map((c: N) => (subj ? this.caseEq(c, subj, ctx) : this.cond(c, ctx)));
      const body = this.block(this.seqBody(w.body), this.nest(ctx), tail);
      out.push(`${i === 0 ? "if" : "} else if"} (${conds.join(" || ")}) {`, ...indent(body));
    });
    if (n.else) {
      out.push(`} else {`, ...indent(this.block(this.seqBody(n.else), this.nest(ctx), tail)), `}`);
    } else {
      out.push(`}`);
      if (tail) out.push("return null;");
    }
    return out;
  }

  tmpCounter = 0;
  tmp(ctx: Ctx, base: string): string {
    let name = base;
    let i = 1;
    while (this.isLocal(ctx, name)) name = `${base}${++i}`;
    ctx.scope.locals.add(name);
    return name;
  }

  /** `when X` against subject → Ruby `X === subject`. */
  caseEq(c: N, subj: string, ctx: Ctx): string {
    if (c.k === "splat")
      return `${this.expr(c.value, ctx)}.some((x: any) => ${this.rc(ctx, "rbEqq")}(x, ${subj}))`;
    if (c.k === "const") {
      // `when SomeClass` is a type test; `when SOME_VALUE` (a value constant,
      // `::Float::INFINITY`) is Ruby `===` on the value.
      const segs = (c.path as string[]).filter((x) => x !== "");
      const hit = this.index.resolveConst(c.path, ctx.nesting);
      const isClass = hit
        ? hit.kind === "scope"
        : /^[A-Z][a-z]/.test(segs[segs.length - 1]) && !/^[A-Z0-9_]+$/.test(segs[segs.length - 1]);
      if (isClass) {
        const t = this.typeTest(c, subj, ctx);
        if (t) return t;
      }
      return `${this.rc(ctx, "rbEqq")}(${this.expr(c, ctx)}, ${subj})`;
    }
    // `when nil` is also JS `undefined` (a missed key or slot reads it).
    if (c.k === "nil") return `${subj} == null`;
    if (c.k === "str" || c.k === "sym" || c.k === "int" || c.k === "true" || c.k === "false")
      return `${subj} === ${this.expr(c, ctx)}`;
    if (c.k === "regex") return `${this.expr(c, ctx)}.test(${subj})`;
    if (c.k === "range") return `${this.rc(ctx, "rbEqq")}(${this.expr(c, ctx)}, ${subj})`;
    return `${this.rc(ctx, "rbEqq")}(${this.expr(c, ctx)}, ${subj})`;
  }

  /** `x.is_a?(K)` / `K === x` for a constant K, using JS type tests for core classes. */
  typeTest(c: N, subj: string, ctx: Ctx): string | null {
    if (c.k !== "const") return null;
    const name = c.path.filter((s: string) => s !== "").join("::");
    switch (name) {
      case "String":
        if (ctx.f.symbolColon)
          return `(typeof ${subj} === "string" && !${this.rc(ctx, "isSymbol")}(${subj}))`;
        return `typeof ${subj} === "string"`;
      case "Symbol":
        if (ctx.f.symbolColon) return `${this.rc(ctx, "isSymbol")}(${subj})`;
        return `typeof ${subj} === "string"`;
      // Ruby's Integer includes a bigint, and a Float may be a boxed integral
      // Number (`1.0`): ruby-compat's classes answer both (`rbObjClass`).
      case "Integer":
        return `${this.rc(ctx, "rbObjIsKindOf")}(${subj}, ${this.rc(ctx, "rbCInteger")})`;
      case "Float":
        return `${this.rc(ctx, "rbObjIsKindOf")}(${subj}, ${this.rc(ctx, "rbCFloat")})`;
      case "Numeric":
        return `typeof ${subj} === "number"`;
      case "Array":
        return `Array.isArray(${subj})`;
      // A Ruby Hash is a plain object, a Map or a ruby-compat `Hash`; ruby-compat's
      // `kind_of?` answers all three (the hand port's `rbObjIsKindOf(argument, Hash)`).
      case "Hash":
        return `${this.rc(ctx, "rbObjIsKindOf")}(${subj}, ${this.rc(ctx, "Hash")})`;
      // A JS class is a function too; ruby-compat's `rbObjIsProc` answers a proc only.
      case "Proc":
        return `${this.rc(ctx, "rbObjIsProc")}(${subj})`;
      case "NilClass":
        return `${subj} == null`;
      case "TrueClass":
        return `${subj} === true`;
      case "FalseClass":
        return `${subj} === false`;
      // A Ruby module is a ruby-compat `Module` object; a class (a JS class) is a Module too.
      case "Module":
        return `(typeof ${subj} === "function" || ${subj} instanceof ${this.rc(ctx, "Module")})`;
      case "Class":
        return `typeof ${subj} === "function"`;
      case "Regexp":
        return `${subj} instanceof RegExp`;
      case "Range":
        return `${subj} instanceof ${this.rc(ctx, "Range")}`;
    }
    // A module is not a JS constructor, and Ruby's `Module#===` is `is_a?`, which
    // also answers for a mixed-in module: ruby-compat `rbObjIsKindOf`. A gem
    // class, or a dependency class the type oracle knows, keeps `instanceof`.
    const hit = this.index.resolveConst(c.path, ctx.nesting);
    const sc = hit?.kind === "scope" ? this.index.scopes.get(hit.fqn) : undefined;
    const isClass = sc
      ? sc.kind === "class"
      : !!this.resolver.types.depClass(c.path.filter((x: string) => x));
    if (!isClass) return `${this.rc(ctx, "rbObjIsKindOf")}(${subj}, ${this.expr(c, ctx)})`;
    return `${subj} instanceof ${this.expr(c, ctx)}`;
  }

  beginStmt(n: N, ctx0: Ctx, tail: boolean): string[] {
    let hasRetry = false;
    for (const r of n.rescues ?? [])
      walk(r.body, (x) => {
        if (x.k === "retry") hasRetry = true;
        if (x.k === "def" || x.k === "block" || x.k === "lambda") return false;
      });
    if (hasRetry && !ctx0.inRetry) {
      // `begin … rescue … retry end` → a loop: `retry` re-runs the body
      // (`continue`); finishing the body leaves it (`break`, or the tail `return`).
      this.stat(ctx0, "retry-loop");
      const inner = this.child(ctx0, { inRetry: true, inLoop: false });
      const body = this.beginStmt(n, inner, tail);
      return [`for (;;) {`, ...indent([...body, ...(tail ? [] : ["break;"])]), `}`];
    }
    if (!n.rescues.length && !n.ensure) return this.block(this.seqBody(n.body), ctx0, tail);
    const ctx = this.nest(ctx0);
    let body = this.block(this.seqBody(n.body), ctx, tail && !n.else);
    // In an async function, `return x` inside `try` hands back a promise that
    // settles after the `catch` / `finally` already ran; Ruby's `rescue` /
    // `ensure` wrap the whole call, so the value is awaited there.
    if (ctx0.asyncBox?.awaits || ctx0.defAsync)
      body = body.map((l) =>
        /^return (?!await )\S/.test(l) &&
        l !== "return null;" &&
        !isAwaited(l.slice("return ".length).replace(/;$/, ""))
          ? l.replace(/^return /, "return await ")
          : l,
      );
    const out = [`try {`, ...indent(body)];
    if (n.else) out.push(...indent(this.block(this.seqBody(n.else), ctx, tail)));
    if (n.rescues.length) {
      // When every arm binds the same variable (`rescue A, B => e`), the catch
      // parameter is that variable; otherwise a fresh temp.
      const varNames = new Set<string | null>(
        n.rescues.map((r: any): string | null => (r.var?.k === "lvar" ? r.var.name : null)),
      );
      const shared = varNames.size === 1 ? [...varNames][0] : null;
      const err = shared && !this.isLocal(ctx, shared) ? jsIdent(shared) : this.tmp(ctx, "error");
      if (shared && err === jsIdent(shared)) ctx.scope.locals.add(shared);
      const arms: string[] = [];
      n.rescues.forEach((r: any, i: number) => {
        const classes = r.classes.length ? r.classes : [{ k: "const", path: ["StandardError"] }];
        const test = classes
          .map((c: N) =>
            c.k === "splat"
              ? `${this.expr(c.value, ctx)}.some((k: any) => ${err} instanceof k)`
              : `${err} instanceof ${this.expr(c, ctx)}`,
          )
          .join(" || ");
        const lines: string[] = [];
        if (r.var?.k === "lvar" && jsIdent(r.var.name) !== err)
          lines.push(`${this.decl(ctx, r.var.name, err)} = ${err};`);
        // Type the rescued variable as the (single) rescued class.
        if (r.var?.k === "lvar" && classes.length === 1 && classes[0].k === "const") {
          const t = this.typeOf(classes[0], ctx);
          let s: Scope | undefined = ctx.scope;
          while (s && !s.locals.has(r.var.name)) s = s.parent;
          if (s && t?.k === "class")
            (s.types ??= new Map()).set(r.var.name, { k: "class", key: t.key });
        }
        // A bare `raise` in the arm re-raises the exception being handled (`$!`).
        lines.push(...this.block(this.seqBody(r.body), this.child(ctx, { rescued: err }), tail));
        arms.push(`${i === 0 ? "if" : "} else if"} (${test}) {`, ...indent(lines));
      });
      arms.push(`} else {`, `  throw ${err};`, `}`);
      out.push(`} catch (${err}: any) {`, ...indent(arms));
    }
    if (n.ensure)
      out.push(`} finally {`, ...indent(this.block(this.seqBody(n.ensure), ctx, false)));
    out.push(`}`);
    return out;
  }

  masgn(n: N, ctx: Ctx, tail: boolean): string[] {
    const targets: N[] = n.targets;
    const simple = targets.every(
      (t) =>
        t.k === "lvar" || t.k === "ivar" || (t.k === "splat" && (!t.value || t.value.k === "lvar")),
    );
    const value =
      n.value.k === "array"
        ? `[${n.value.elems.map((e: N) => this.expr(e, ctx)).join(", ")}]`
        : this.expr(n.value, ctx);
    if (simple && targets.every((t) => t.k === "lvar" || t.k === "splat")) {
      const names = targets.map((t) => (t.k === "splat" ? t.value?.name : t.name));
      const allNew = !ctx.nested && names.every((nm) => !nm || !this.isLocal(ctx, nm));
      const pat = targets
        .map((t) =>
          t.k === "splat" ? (t.value ? `...${jsIdent(t.value.name)}` : "") : jsIdent(t.name),
        )
        .join(", ");
      if (allNew) names.forEach((nm) => nm && this.declareLocal(ctx, nm));
      else names.forEach((nm) => nm && this.letFor(this.nest(ctx), nm));
      const line = allNew
        ? `let [${pat}] = ${this.aryEnsure(value, ctx)};`
        : `[${pat}] = ${this.aryEnsure(value, ctx)};`;
      return tail ? [line, `return ${value};`] : [line];
    }
    const tmp = this.tmp(ctx, "values");
    const out = [`const ${tmp} = ${this.aryEnsure(value, ctx)};`];
    targets.forEach((t, i) => {
      if (t.k === "splat") {
        if (t.value) out.push(...this.assignTo(t.value, `${tmp}.slice(${i})`, ctx));
      } else out.push(...this.assignTo(t, `${tmp}[${i}]`, ctx));
    });
    if (tail) out.push(`return ${tmp};`);
    return out;
  }

  assignTo(t: N, v: string, ctx: Ctx): string[] {
    switch (t.k) {
      case "lvar":
        return [`${this.decl(ctx, t.name, v)} = ${v};`];
      case "ivar":
        return [`${this.ivar(t.name, ctx)} = ${v};`];
      case "call":
        if (t.name === "[]")
          return [`${this.expr(t.recv, ctx)}[${this.expr(t.args[0], ctx)}] = ${v};`];
        return [`${this.expr(t.recv, ctx)}.${this.attrName(t.name)} = ${v};`];
      case "mtarget": {
        const tmp = this.tmp(ctx, "inner");
        const out = [`const ${tmp} = ${v};`];
        t.targets.forEach((tt: N, i: number) =>
          out.push(...this.assignTo(tt, `${tmp}[${i}]`, ctx)),
        );
        return out;
      }
      default:
        return [`${this.decline(ctx, "masgn-complex", t, "masgn target " + t.k)};`];
    }
  }

  /** `x ||= v`, `x += v` etc. */
  opasgnStmt(n: N, ctx: Ctx, tail: boolean): string[] {
    const t: N = n.target;
    // `IsolatedExecutionState[k] ||= v` / `&&=` through its get / set.
    if (
      t.k === "call" &&
      t.name === "[]" &&
      t.args.length === 1 &&
      isIsolatedExecutionState(t.recv) &&
      (n.op === "||" || n.op === "&&")
    ) {
      const R = this.expr(t.recv, ctx);
      const k = this.expr(t.args[0], ctx);
      const cond = this.truthy(`${R}.get(${k})`);
      const line = `if (${n.op === "||" ? "!" : ""}${cond}) ${R}.set(${k}, ${this.expr(n.value, ctx)});`;
      return tail ? [line, `return ${R}.get(${k});`] : [line];
    }
    let lhs: string;
    let decl = false;
    if (t.k === "lvar") {
      decl = !this.isLocal(ctx, t.name);
      lhs = jsIdent(t.name);
    } else lhs = this.lvalue(t, ctx);
    const v = this.expr(n.value, ctx);
    let line: string;
    if (decl) {
      const pre = this.letFor(ctx, t.name);
      line =
        n.op === "||"
          ? `${pre}${lhs}${pre ? ": any" : ""} = ${v};`
          : `${pre}${lhs}${pre ? ": any" : ""} = null;`;
    } else if (n.op === "||") {
      // `x ||= v` on a slot typed as an object (never `false`) is `x ??= v`.
      const tt = this.typeOf(t.k === "lvar" ? { k: "lvar", name: t.name } : t, ctx);
      if (isObjectLike(tt) || (tt?.k === "prim" && tt.name !== "boolean")) {
        line = `${lhs} ??= ${v};`;
        this.stat(ctx, "or-assign-typed");
      } else {
        line = `if (!${this.truthy(lhs, true)}) ${lhs} = ${v};`;
        this.stat(ctx, "or-assign");
      }
    } else if (n.op === "&&") {
      line = `if (${this.truthy(lhs)}) ${lhs} = ${v};`;
    } else {
      // `x op= v` is `x = x op v` with Ruby's operator semantics (array `|`, `+`, `-`, `<<`).
      const read = t.k === "lvar" ? { k: "lvar", name: t.name } : t;
      line = `${lhs} = ${this.operator({ k: "call", recv: read, name: n.op, args: [n.value], l: n.l }, lhs, ctx)};`;
    }
    return tail ? [line, `return ${lhs};`] : [line];
  }

  lvalue(t: N, ctx: Ctx): string {
    switch (t.k) {
      case "lvar":
        return jsIdent(t.name);
      case "ivar":
        return this.ivar(t.name, ctx);
      case "cvar":
        return this.cvar(t.name, ctx);
      case "gvar":
        return this.decline(ctx, "gvar", t, t.name);
      case "const":
        return this.constRef(t, ctx);
      case "call":
        if (t.name === "[]")
          return `${this.expr(t.recv, ctx)}[${t.args.map((a: N) => this.expr(a, ctx)).join(", ")}]`;
        return `${this.expr(t.recv, ctx)}.${this.attrName(t.name)}`;
    }
    return this.decline(ctx, "unhandled-node", t, `lvalue ${t.k}`);
  }

  /** Statement-position special forms: `each` → for-of, raise, attr writes. */
  callStmt(n: N, ctx: Ctx, tail: boolean): string[] | null {
    if (
      n.recv &&
      n.block?.k === "block" &&
      (n.name === "each" ||
        n.name === "each_value" ||
        n.name === "each_key" ||
        n.name === "each_pair") &&
      n.args.length === 0 &&
      !tail
    ) {
      const params: Param[] = n.block.params;
      const inner = this.child(ctx, {
        scope: { locals: new Set(), parent: ctx.scope },
        inLoop: true,
        nested: false,
      });
      let head: string;
      const recv = this.expr(n.recv, ctx);
      if (n.name === "each_pair" || (n.name === "each" && params.length === 2)) {
        params.forEach((p) => p.name && inner.scope.locals.add(p.name));
        head = `for (const [${params.map((p) => jsIdent(p.name ?? "_")).join(", ")}] of ${this.entries(recv, ctx, n.recv)})`;
      } else if (n.name === "each_value") {
        params.forEach((p) => p.name && inner.scope.locals.add(p.name));
        head = `for (const ${jsIdent(params[0]?.name ?? "_")} of Object.values(${recv}))`;
      } else if (n.name === "each_key") {
        params.forEach((p) => p.name && inner.scope.locals.add(p.name));
        head = `for (const ${jsIdent(params[0]?.name ?? "_")} of Object.keys(${recv}))`;
      } else if (params.length === 1 && params[0].kind === "req" && params[0].name) {
        inner.scope.locals.add(params[0].name);
        const rt = this.typeOf(n.recv, ctx);
        if (rt?.k === "array" && rt.el)
          (inner.scope.types ??= new Map()).set(params[0].name, rt.el);
        head = `for (const ${jsIdent(params[0].name)} of ${this.iter(n.recv, ctx, recv)})`;
      } else if (params.length === 1 && params[0].destructure) {
        const names = params[0].destructure.map((d) => (d ? jsIdent(d) : ""));
        params[0].destructure.forEach((d) => d && inner.scope.locals.add(d));
        head = `for (const [${names.join(", ")}] of ${this.iter(n.recv, ctx, recv)})`;
      } else if (params.length === 0) {
        head = `for (const _ of ${this.iter(n.recv, ctx, recv)})`;
      } else return null;
      this.stat(ctx, "each-for-of");
      return [`${head} {`, ...indent(this.block(this.seqBody(n.block.body), inner, false)), `}`];
    }
    // `ary.each_slice(n) { |slice| … }` → `for (const slice of eachSlice(ary, n))`,
    // the hand port's form (relation/batches.ts, has-many-association.ts): the
    // body may `await` in order, which a callback cannot. Ruby's block form
    // answers the receiver, so in tail position a plain-identifier receiver is
    // returned after the loop.
    if (
      n.recv &&
      n.name === "each_slice" &&
      n.args.length === 1 &&
      n.block?.k === "block" &&
      n.block.params.length === 1 &&
      n.block.params[0].kind === "req" &&
      n.block.params[0].name
    ) {
      const recv = this.expr(n.recv, ctx);
      if (tail && !/^[A-Za-z_$][\w$]*$/.test(recv)) return null;
      const p0: string = n.block.params[0].name;
      const inner = this.child(ctx, {
        scope: { locals: new Set([p0]), parent: ctx.scope },
        inLoop: true,
        nested: false,
      });
      this.stat(ctx, "each-slice-for-of");
      const head = `for (const ${jsIdent(p0)} of ${this.as(ctx, "eachSlice")}(${recv}, ${this.expr(n.args[0], ctx)}))`;
      const out = [
        `${head} {`,
        ...indent(this.block(this.seqBody(n.block.body), inner, false)),
        `}`,
      ];
      return tail ? [...out, `return ${recv};`] : out;
    }
    // `n.times { |i| … }` (numeric.c int_dotimes) in statement position: a
    // counted loop, whose body may await in order.
    if (
      n.recv &&
      n.name === "times" &&
      n.args.length === 0 &&
      n.block?.k === "block" &&
      n.block.params.length <= 1 &&
      (!n.block.params[0] || (n.block.params[0].kind === "req" && n.block.params[0].name)) &&
      !tail &&
      !this.resolver.isGemReceiver(n.recv, ctx, this)
    ) {
      const p0: string | undefined = n.block.params[0]?.name;
      const i = p0 ? jsIdent(p0) : "_i";
      const inner = this.child(ctx, {
        scope: { locals: new Set(p0 ? [p0] : []), parent: ctx.scope },
        inLoop: true,
        nested: false,
      });
      return [
        `for (let ${i} = 0, _n = ${this.expr(n.recv, ctx)}; ${i} < _n; ${i}++) {`,
        ...indent(this.block(this.seqBody(n.block.body), inner, false)),
        `}`,
      ];
    }
    if (n.recv === null && n.name === "loop" && n.block?.k === "block") {
      const body = this.block(this.seqBody(n.block.body), this.child(ctx, { inLoop: true }), false);
      return [`while (true) {`, ...indent(body), `}`];
    }
    if (n.recv === null && (n.name === "raise" || n.name === "fail")) return [this.raise(n, ctx)];
    // `autoload :X` in a module records X on the module, trails' `Autoload` port
    // (`Migration.autoload("CommandRecorder", …)` in the hand port), and loads
    // X's file eagerly: `const_get` is synchronous here, so the constant has to
    // be seated (rbModConstSet) before anything looks it up.
    if (
      n.recv === null &&
      n.name === "autoload" &&
      ctx.selfKind === "static" &&
      ctx.owner &&
      n.args[0]?.k === "sym"
    ) {
      const cname: string = n.args[0].value;
      const target = this.resolver.exportNames.get(`${ctx.owner}::${cname}`);
      // The hand port decides loading for the constants its `namespaces.ts`
      // autoloads (lazily, through `loadPath`); only the rest load eagerly.
      const seat = handNamespaceFqns().get(ctx.owner);
      const handDeclared = !!seat && handNamespaceAutoloads().has(`${seat}::${cname}`);
      if (
        target &&
        target.tsFile !== ctx.f.tsFile &&
        !handDeclared &&
        !this.resolver.unresolvedFiles.has(target.tsFile)
      )
        this.imp(ctx, `@root/${target.tsFile.replace(/\.ts$/, ".js")}`, "", "");
      // Rails' explicit path (`autoload :DeserializationError, "active_job/arguments"`) is kept.
      const pathArg = n.args[1] ? `, ${this.expr(n.args[1], ctx)}` : "";
      return [`${ctx.selfExpr}.autoload(${JSON.stringify(cname)}${pathArg});`];
    }
    if (
      n.recv === null &&
      (n.name === "require" ||
        n.name === "require_relative" ||
        n.name === "autoload" ||
        n.name === "eager_autoload")
    ) {
      // `eager_autoload do … end` holds `autoload`s: lower them in place.
      if (n.name === "eager_autoload" && n.block?.k === "block")
        return this.block(this.seqBody(n.block.body), ctx, false);
      return [];
    }
    // `Module#ruby2_keywords :m` flags a method's trailing Hash as keywords
    // (Ruby 2.7 compatibility). trails passes keywords as a trailing options
    // object everywhere, so there is nothing to flag.
    if (n.recv === null && n.name === "ruby2_keywords" && ctx.selfKind === "static") return [];
    if (
      n.name.endsWith("=") &&
      !["==", "!=", "<=", ">=", "==="].includes(n.name) &&
      n.name !== "[]="
    ) {
      const recv = n.recv ? this.nonNullRecv(n.recv, this.expr(n.recv, ctx), ctx) : ctx.selfExpr;
      const v = this.expr(n.args[0], ctx);
      // A writer `def x=` in a module is the function `setX` (CLAUDE.md's
      // `setX()` spelling), not a property: `self.queue_adapter = :async` calls it.
      const w = this.resolver.member(n, n.recv ?? { k: "self" }, ctx, this);
      const owner = this.writerOwner(n.name, n.recv ?? { k: "self" }, ctx);
      if ((w?.kind === "method" || (!w && owner)) && owner?.kind === "module") {
        // The emitter's name for a module writer function (emit.ts `fnName`).
        const wn = w?.name ?? propName(n.name.slice(0, -1));
        const fnName = wn.startsWith("set") ? wn : `set${wn[0].toUpperCase()}${wn.slice(1)}`;
        const call = `${recv}${n.safe ? "?." : "."}${fnName}(${v});`;
        return tail ? [call, `return ${v};`] : [call];
      }
      // A dependency whose trails port spells the class-level writer as a flat
      // `setX` export (globalid's `GlobalID.app=` is `setApp`).
      const depSet =
        n.recv?.k === "const" ? this.resolver.depFlatSetter(n.recv.path, n.name, ctx, this) : null;
      if (depSet) return tail ? [`${depSet}(${v});`, `return ${v};`] : [`${depSet}(${v});`];
      const line = `${recv}${n.safe ? "?" : ""}.${this.attrName(n.name.slice(0, -1))} = ${v};`;
      return tail ? [line, `return ${recv}.${this.attrName(n.name.slice(0, -1))};`] : [line];
    }
    if (n.name === "[]=" && isExecutionContext(n.recv) && n.args.length === 2) {
      const set = `${this.expr(n.recv, ctx)}.setKey(${n.args.map((a: N) => this.expr(a, ctx)).join(", ")})`;
      return [tail ? `return ${set};` : `${set};`];
    }
    if (n.name === "[]=" && isIsolatedExecutionState(n.recv) && n.args.length === 2) {
      const set = `${this.expr(n.recv, ctx)}.set(${n.args.map((a: N) => this.expr(a, ctx)).join(", ")})`;
      return [tail ? `return ${set};` : `${set};`];
    }
    // `ENV[k] = v` is ruby-compat `setEnv(k, v)`.
    if (
      n.name === "[]=" &&
      n.recv?.k === "const" &&
      n.recv.path.filter((x: string) => x).join("::") === "ENV" &&
      n.args.length === 2
    )
      return [`${this.rc(ctx, "setEnv")}(${n.args.map((a: N) => this.expr(a, ctx)).join(", ")});`];
    if (n.name === "[]=" && n.recv) {
      const recv = this.expr(n.recv, ctx);
      const args = n.args.map((a: N) => this.expr(a, ctx));
      const ok = this.optionKey(n, this.typeOf(n.recv, ctx), ctx);
      // Ruby's `h[k] = v` answers v; as the tail it is the JS assignment's value,
      // not v evaluated a second time.
      const asg = ok
        ? `${recv}.${ok} = ${args[args.length - 1]}`
        : args.length === 2 && this.mayBeMap(n.recv, ctx)
          ? `${this.rc(ctx, "hashAset")}(${recv}, ${args[0]}, ${args[1]})`
          : `${recv}[${args[0]}] = ${args[args.length - 1]}`;
      return [tail ? `return (${asg});` : `${asg};`];
    }
    return null;
  }

  /** A hash literal, or a value typed as a Hash that is never a `Map`. */
  plainHash(n: N, ctx: Ctx): boolean {
    if (n.k === "hash") return true;
    const t = this.typeOf(n, ctx);
    return t?.k === "hash" && !t.map;
  }

  /** A Hash the hand twin types as possibly a `Map` (hand-oracle `{ k: "hash", map }`). */
  mayBeMap(n: N, ctx: Ctx): boolean {
    const t = this.typeOf(n, ctx);
    return t?.k === "hash" && !!t.map;
  }

  /**
   * `h.key?(k)`: `Object.hasOwn(h, k)` on a plain object (CLAUDE.md, "Hash calls
   * on a plain object"), which a caller-supplied key cannot fool the way `in`'s
   * prototype walk can; ruby-compat's `hasKey` only where the hand twin types the
   * Hash as possibly a `Map`, which the helper dispatches to.
   */
  hasKeyForm(recvNode: N, r: string, key: string, ctx: Ctx): string {
    if (this.mayBeMap(recvNode, ctx)) return `${this.rc(ctx, "hasKey")}(${r}, ${key})`;
    return `Object.hasOwn(${r}, ${key})`;
  }

  /** `f` applied to `r` evaluated once: directly for a plain reference, else through an arrow. */
  withOnce(r: string, f: (x: string) => string): string {
    return /^[\w$]+(\.[\w$]+)*$/.test(r) ? f(r) : `((x) => ${f("x")})(${r})`;
  }

  /** A Hash's `[key, value]` pairs (`Hash#each`), a Map's entries, an Array itself. */
  entries(recv: string, ctx: Ctx, node?: N): string {
    const t = node ? this.typeOf(node, ctx) : null;
    if (t?.k === "array") return recv;
    if (t?.k === "hash" && !t.map) return `Object.entries(${recv})`;
    return this.withOnce(
      recv,
      (x) =>
        `(${x} instanceof globalThis.Map ? [...${x}] : Array.isArray(${x}) ? ${x} : Object.entries(${x} ?? {}))`,
    );
  }

  /**
   * Splat / multiple assignment's array conversion (vm_insnhelper.c
   * vm_expandarray): nil is empty, an Array (or `to_ary`) itself, else `[x]`.
   */
  aryEnsure(value: string, ctx: Ctx): string {
    const check = this.rc(ctx, "rbCheckArrayType");
    return this.withOnce(
      value,
      (x) => `(${x} == null ? [] : ((${check}(${x}) as unknown[] | null) ?? [${x}]))`,
    );
  }

  iter(node: N, ctx: Ctx, pre?: string): string {
    const e = pre ?? this.expr(node, ctx);
    if (node.k === "array" || node.k === "range") return e;
    return this.nonNullRecv(node, e, ctx);
  }

  /**
   * An ivar or call receiver typed `T | null`, asserted non-null: Ruby raises
   * NoMethodError for a method sent to nil, which the JS TypeError of a null
   * receiver stands for.
   */
  nonNullRecv(node: N | null, e: string, ctx: Ctx): string {
    if ((node?.k !== "ivar" && node?.k !== "call") || node.safe || e.endsWith("!")) return e;
    const t = this.typeOf(node, ctx);
    return t && "nullable" in t && t.nullable ? `${e}!` : e;
  }

  raise(n: N, ctx: Ctx): string {
    const a = n.args;
    if (a.length === 0)
      return ctx.rescued ? `throw ${ctx.rescued};` : `throw ${this.rc(ctx, "rbErrinfo")}();`;
    if (a.length === 1 && (a[0].k === "str" || a[0].k === "dstr"))
      return `throw new ${this.rc(ctx, "RuntimeError")}(${this.expr(a[0], ctx)});`;
    if (a[0].k === "const") {
      const rest = a.slice(1).map((x: N) => this.argExpr(x, ctx));
      if (ctx.rescued) {
        // Inside a rescue `$!` is the rescued error: a constructor reading it
        // takes it as `errinfo`, and `raise` records it as the new error's `cause`.
        const hit = this.index.resolveConst(a[0].path, ctx.nesting);
        if (hit?.kind === "scope" && this.index.errinfoCtors.has(hit.fqn)) rest.push(ctx.rescued);
        return `throw ${this.rc(ctx, "excSetupMessage")}(new ${this.expr(a[0], ctx)}(${rest.join(", ")}), ${ctx.rescued});`;
      }
      return `throw new ${this.expr(a[0], ctx)}(${rest.join(", ")});`;
    }
    if (a[0].k === "call" && a[0].name === "new") return `throw ${this.expr(a[0], ctx)};`;
    // `raise x` with x untyped (`raise raising.constantize`): a class is
    // instantiated, an instance raised as is (eval.c `rb_make_exception`).
    if (a[0].k === "lvar" && ctx.rescued === jsIdent(a[0].name))
      return `throw ${this.expr(a[0], ctx)};`;
    // eval.c rb_make_exception: a String is a RuntimeError's message, a class is
    // instantiated (Exception.exception is `new`), an instance is raised as is.
    const xs = a.map((x: N) => this.argExpr(x, ctx));
    const rest = xs.slice(1).join(", ");
    const RuntimeError = this.rc(ctx, "RuntimeError");
    return `throw ${this.withOnce(xs[0], (x) => `(typeof ${x} === "string" ? new ${RuntimeError}(${x}) : typeof ${x} === "function" ? new ${x}(${rest}) : ${rest ? `${x}.exception(${rest})` : x})`)};`;
  }

  // ───────────────────────────── expressions ─────────────────────────────

  cond(n: N, ctx: Ctx): string {
    if (this.isBoolean(n)) return this.expr(n, ctx);
    // A Ruby predicate (`foo?`) in a condition: its value is a boolean in
    // practice, and as a condition JS truthiness only differs for 0 / "".
    if (n.k === "call" && /\?$/.test(n.name)) {
      this.stat(ctx, "cond-predicate");
      return this.expr(n, ctx);
    }
    if (n.k !== "not" && n.k !== "and" && n.k !== "or") {
      const t = this.typeOf(n, ctx);
      if (isBool(t)) {
        this.stat(ctx, "cond-typed-bool");
        return this.expr(n, ctx);
      }
      if (isObjectLike(t) || (t?.k === "prim" && t.name !== "boolean")) {
        this.stat(ctx, "cond-typed-object");
        const e = this.expr(n, ctx);
        return `${needsParens(e) ? `(${e})` : e} != null`;
      }
    }
    if (n.k === "not")
      return `!${this.cond(n.value, ctx).startsWith("(") ? "" : ""}(${this.cond(n.value, ctx)})`;
    if (n.k === "and") return `${this.condP(n.left, ctx)} && ${this.condP(n.right, ctx)}`;
    if (n.k === "or") return `${this.condP(n.left, ctx)} || ${this.condP(n.right, ctx)}`;
    if (n.k === "call" && n.name === "!" && n.recv) return `!(${this.cond(n.recv, ctx)})`;
    if (n.k === "defined") {
      const e = this.expr(n, ctx);
      return `${needsParens(e) ? `(${e})` : e} != null`;
    }
    return this.truthy(this.expr(n, ctx));
  }

  /**
   * One `#{x}` of a Ruby string, natively: a primitive as itself, an unknown value
   * with `nil` read as `""` (string.c rb_obj_as_string, NilClass#to_s). A constant
   * or a value known to be a class keeps its Ruby `to_s`, the class name, which a
   * JS template would print as the class's source.
   */
  interpolate(p: N, ctx: Ctx): string {
    const e = this.expr(p, ctx);
    const t = this.typeOf(p, ctx);
    if (["str", "dstr", "int", "float"].includes(p.k) || t?.k === "prim") return "${" + e + "}";
    if (p.k === "const" || (t?.k === "class" && t.static) || t?.k === "gemClass")
      return "${" + `${this.rc(ctx, "rbObjAsString")}(${e})` + "}";
    return "${" + `${needsParens(e) ? `(${e})` : e} ?? ""` + "}";
  }

  /**
   * Ruby truthiness (`RTEST`, ruby.h: anything but `nil` and `false`) as a native
   * JS test: `x != null && x !== false` for a plain read, which is evaluated twice,
   * else `(e ?? false) !== false`, which evaluates `e` once. `wrap` parenthesizes
   * the first form for use under `!` or a `?:`.
   */
  truthy(e: string, wrap = false): string {
    if (isBoolExpr(e)) return wrap && !/^[!(]/.test(e) ? `(${e})` : e;
    const t = /^[\w$]+(\.[\w$]+)*$/.test(e)
      ? `${e} != null && ${e} !== false`
      : `(${e} ?? false) !== false`;
    return wrap ? `(${t})` : t;
  }

  condP(n: N, ctx: Ctx): string {
    const c = this.cond(n, ctx);
    return n.k === "and" || n.k === "or" ? `(${c})` : c;
  }

  /** Statically boolean: comparisons, predicates we lower to booleans, literals. */
  isBoolean(n: N): boolean {
    if (n.k === "true" || n.k === "false") return true;
    if (n.k === "not") return true;
    if (n.k === "defined") return false;
    if (n.k === "and" || n.k === "or") return this.isBoolean(n.left) && this.isBoolean(n.right);
    if (n.k === "call") {
      if (
        [
          "==",
          "!=",
          "<",
          ">",
          "<=",
          ">=",
          "===",
          "!",
          "is_a?",
          "kind_of?",
          "instance_of?",
          "nil?",
          "respond_to?",
          "present?",
          "blank?",
          "block_given?",
          "empty?",
          "any?",
          "all?",
          "none?",
          "include?",
          "key?",
          "has_key?",
          "start_with?",
          "end_with?",
          "frozen?",
          "equal?",
          "eql?",
          "match?",
          "member?",
          "zero?",
        ].includes(n.name)
      )
        return true;
    }
    return false;
  }

  argExpr(a: N, ctx: Ctx): string {
    if (a.k === "splat") {
      const t = this.typeOf(a.value, ctx);
      if (t?.k === "array") return `...${this.expr(a.value, ctx)}`;
      return `...${this.aryEnsure(this.expr(a.value, ctx), ctx)}`;
    }
    if (a.k === "kwargs") return this.kwargs(a.pairs, ctx);
    if (a.k === "fwdargs") return `...args`;
    if (a.k === "blockpass" || a.k === "symproc") return this.blockArg(a, ctx);
    return this.expr(a, ctx);
  }

  kwargs(pairs: any[], ctx: Ctx): string {
    const parts = pairs.map((p) => {
      if (p.splat) return `...${this.expr(p.splat, ctx)}`;
      if (p.key.k === "sym")
        return `${propKey(jsIdent(p.key.value).replace(/_$/, ""))}: ${this.expr(p.value, ctx)}`;
      // A String key (`super("value" => v)`) is a plain property key.
      if (p.key.k === "str") return `${propKey(p.key.value)}: ${this.expr(p.value, ctx)}`;
      return `[${this.expr(p.key, ctx)}]: ${this.expr(p.value, ctx)}`;
    });
    return `{ ${parts.join(", ")} }`;
  }

  /** `camelKeys`: an option hash, whose Symbol keys are camelCase (CLAUDE.md, the option-key rule). */
  hashLit(pairs: any[], ctx: Ctx, camelKeys = false): string {
    if (!pairs.length) return "{}";
    // An Integer key (`{ 1 => 2 }`) does not survive as a JS object key, which
    // is always a string: the literal is a ruby-compat `Hash` (a Map).
    if (
      pairs.some((p) => p.key && (p.key.k === "int" || p.key.k === "float")) &&
      !pairs.some((p) => p.splat)
    )
      return `new ${this.rc(ctx, "Hash")}()${pairs.map((p) => `.set(${p.key.k === "sym" ? JSON.stringify(p.key.value) : this.expr(p.key, ctx)}, ${this.expr(p.value, ctx)})`).join("")}`;
    const parts = pairs.map((p) => {
      if (p.splat) return `...${this.expr(p.splat, ctx)}`;
      if (p.key.k === "sym")
        return symColonHere(ctx)
          ? `${JSON.stringify(":" + p.key.value)}: ${this.expr(p.value, ctx)}`
          : `${propKey(camelKeys && /^[a-z_][a-z0-9_]*$/.test(p.key.value) ? propName(p.key.value) : p.key.value)}: ${this.expr(p.value, ctx)}`;
      if (p.key.k === "str") return `${propKey(p.key.value)}: ${this.expr(p.value, ctx)}`;
      return `[${this.expr(p.key, ctx)}]: ${this.expr(p.value, ctx)}`;
    });
    return `{ ${parts.join(", ")} }`;
  }

  blockArg(b: N, ctx: Ctx): string {
    if (b.k === "symproc") {
      const name = b.name as string;
      // `&:to_s` / `&:to_sym` go through the call lowering (Symbol convention).
      if (name === "to_s" || name === "to_sym" || name === "class") {
        const inner = this.child(ctx, { scope: { locals: new Set(["x"]), parent: ctx.scope } });
        const call: N = {
          k: "call",
          recv: { k: "lvar", name: "x" },
          name,
          args: [],
          block: null,
          safe: false,
        };
        return `(x: any) => ${this.expr(call, inner)}`;
      }
      return `(x: any) => x.${this.callName(name)}${this.isAttrLike(name) ? "" : "()"}`;
    }
    if (b.k === "blockpass") {
      if (b.value.k === "fwdblock") return ctx.blockVar ?? "block";
      return this.expr(b.value, ctx);
    }
    if (b.k === "iexec")
      return this.selfFunction(
        b.params,
        b.body,
        b.libBlock ? this.child(ctx, { testMode: false }) : ctx,
      );
    return this.arrow(b.params, b.body, ctx);
  }

  arrow(params: Param[], body: N, ctx: Ctx): string {
    const scope: Scope = { locals: new Set(), parent: ctx.scope, body };
    const inner = this.child(ctx, {
      scope,
      paramTypes: undefined,
      fnScope: scope,
      inBlock: true,
      inLoop: false,
      nested: false,
      asyncBox: { awaits: false },
    });
    // The enclosing method's prologue is its own, not this block's.
    inner.prologue = undefined;
    const ps = this.paramList(params, inner, true);
    const stmts = [...(inner.prologue ?? []), ...this.block(this.seqBody(body), inner, true)];
    inner.prologue = undefined;
    const hz: Set<string> | undefined = scope.hoisted;
    if (hz?.size) stmts.unshift(`let ${[...hz].map((h) => `${jsIdent(h)}: any`).join(", ")};`);
    const asy = inner.asyncBox!.awaits ? "async " : "";
    if (stmts.length === 1 && stmts[0].startsWith("return ") && !stmts[0].includes("\n")) {
      const e = stmts[0].slice(7, -1);
      return `${asy}(${ps}) => ${e.startsWith("{") ? `(${e})` : e}`;
    }
    return `${asy}(${ps}) => {\n${indent(stmts).join("\n")}\n}`;
  }

  /**
   * A block Ruby `instance_exec`s on another object (a callback macro's block
   * runs with `self` the record / job): a `function` whose `this` is that
   * object, not an arrow closing over the defining scope's `self`.
   */
  selfFunction(params: Param[], body: N, ctx: Ctx, over: Partial<Ctx> = {}): string {
    const scope: Scope = { locals: new Set(), parent: ctx.scope, body };
    const inner = this.child(ctx, {
      ...over,
      scope,
      paramTypes: undefined,
      fnScope: scope,
      inBlock: true,
      inLoop: false,
      nested: false,
      selfKind: "instance",
      selfExpr: "this",
      thisAny: true,
      asyncBox: { awaits: false },
    });
    inner.prologue = undefined;
    const ps = this.paramList(params, inner, true);
    const stmts = [...(inner.prologue ?? []), ...this.block(this.seqBody(body), inner, true)];
    const hz: Set<string> | undefined = scope.hoisted;
    if (hz?.size) stmts.unshift(`let ${[...hz].map((h) => `${jsIdent(h)}: any`).join(", ")};`);
    const asy = inner.asyncBox!.awaits ? "async " : "";
    return `${asy}function (${["this: any", ps].filter(Boolean).join(", ")}) {\n${indent(stmts).join("\n")}\n}`;
  }

  /** The gem scope whose `def` a writer call resolves to (self or a constant receiver). */
  writerOwner(name: string, recvNode: N, ctx: Ctx): ScopeInfo | undefined {
    const scopes =
      recvNode.k === "self"
        ? ctx.owner
          ? this.index.ancestors(ctx.owner)
          : []
        : recvNode.k === "const"
          ? (() => {
              const hit = this.index.resolveConst(recvNode.path, ctx.nesting);
              return hit?.kind === "scope" ? this.index.ancestors(hit.fqn) : [];
            })()
          : // A local holding `Class.new(ActiveJob::Base)` is a subclass of that gem class.
            recvNode.k === "lvar"
            ? this.index.ancestors(this.gemClassFqn(this.localType(ctx, recvNode.name)) ?? "")
            : [];
    const own = scopes.find(
      (sc) => sc.defs.has(name) || sc.sdefs.has(name) || sc.sclassAttrs.has(name.replace(/=$/, "")),
    );
    if (own || (recvNode.k !== "const" && !scopes.length)) return own;
    // `ActiveJob::Base.queue_adapter = :inline`: the writer is on an included
    // concern's `ClassMethods`, which `append_features` extends the class with.
    return scopes
      .map((sc) => this.index.scopes.get(`${sc.fqn}::ClassMethods`))
      .find((cm) => cm?.defs.has(name));
  }

  containsAwait(lines: string[]): boolean {
    return lines.some((l) => /\bawait\b/.test(l.replace(/\(.*=>.*/, "")));
  }

  /**
   * Ruby parameter list → TS. Ruby allows required params, kwargs and a block
   * after `*rest`; TS needs the rest last, so those are popped off the rest
   * array in a prologue (left on `ctx.prologue` for the caller to emit).
   */
  paramList(params0: Param[], ctx: Ctx, isBlock: boolean): string {
    // Ruby allows `_` (and `_x`) more than once in a parameter list; JS does not.
    const seenP = new Set<string>();
    const params = params0.map((p) => {
      if (!p.name || !p.name.startsWith("_")) return p;
      let nm = p.name;
      for (let i = 2; seenP.has(nm); i++) nm = `${p.name}${i}`;
      seenP.add(nm);
      return nm === p.name ? p : { ...p, name: nm };
    });
    const restIdx = params.findIndex((p) => p.kind === "rest" || p.kind === "fwd");
    const after = restIdx >= 0 ? params.slice(restIdx + 1) : [];
    if (restIdx >= 0 && after.length) {
      const rest = params[restIdx];
      const restName = rest.kind === "fwd" ? "args" : jsIdent(rest.name ?? "rest");
      const head = this.paramList(params.slice(0, restIdx + 1), ctx, isBlock);
      const pro: string[] = [];
      const blk = after.find((p) => p.kind === "block");
      if (blk) {
        ctx.scope.locals.add(blk.name ?? "block");
        pro.push(
          `const ${jsIdent(blk.name ?? "block")} = ${this.rc(ctx, "rbBlockGivenP")}(${restName}[${restName}.length - 1]) ? ${restName}.pop() : undefined;`,
        );
      }
      const kws = after.filter(
        (p) => p.kind === "key" || p.kind === "keyreq" || p.kind === "keyrest",
      );
      if (kws.length) {
        const parts = kws.map((p) => {
          if (p.name) ctx.scope.locals.add(p.name);
          if (p.kind === "keyrest") return `...${jsIdent(p.name ?? "kwrest")}`;
          if (p.kind === "key") return `${jsIdent(p.name!)} = ${this.expr(p.default!, ctx)}`;
          return jsIdent(p.name!);
        });
        pro.push(
          `const { ${parts.join(", ")} }: any = Object.getPrototypeOf(${restName}.at(-1) ?? 0) === Object.prototype ? ${restName}.pop() : {};`,
        );
      }
      const posts = after.filter((p) => p.kind === "req");
      for (const p of posts.reverse()) {
        if (p.name) ctx.scope.locals.add(p.name);
        pro.unshift(`const ${jsIdent(p.name ?? "_")} = ${restName}.pop();`);
      }
      this.stat(ctx, "params-after-rest");
      ctx.prologue = [...(ctx.prologue ?? []), ...pro];
      return head;
    }
    const out: string[] = [];
    const kw: string[] = [];
    let kwRequired = false;
    let position = 0;
    const positionalType = () => (isBlock ? null : ctx.paramTypes?.[position++]) ?? "any";
    for (const p of params) {
      const nm = p.name ? jsIdent(p.name) : null;
      if (p.name) ctx.scope.locals.add(p.name);
      switch (p.kind) {
        case "req":
          if (p.destructure) {
            p.destructure.forEach((d) => d && ctx.scope.locals.add(d));
            out.push(`[${p.destructure.map((d) => (d ? jsIdent(d) : "")).join(", ")}]: any`);
          } else out.push(`${nm}${isBlock ? "?" : ""}: ${positionalType()}`);
          break;
        case "opt":
          out.push(`${nm}: ${positionalType()} = ${this.expr(p.default!, ctx)}`);
          this.noteParamType(ctx, p.name!, p.default!);
          break;
        case "rest":
          out.push(`...${nm ?? "rest"}: any[]`);
          (ctx.scope.types ??= new Map()).set(p.name ?? "rest", { k: "array", el: null });
          if (!p.name) ctx.scope.locals.add("rest");
          break;
        case "key":
          kw.push(`${jsIdent(p.name!)} = ${this.expr(p.default!, ctx)}`);
          this.noteParamType(ctx, p.name!, p.default!);
          break;
        case "keyreq":
          kw.push(jsIdent(p.name!));
          kwRequired = true;
          break;
        case "keyrest":
          kw.push(`...${nm ?? "kwrest"}`);
          if (!p.name) ctx.scope.locals.add("kwrest");
          break;
        case "fwd":
          out.push(`...args: any[]`);
          ctx.scope.locals.add("args");
          break;
        case "block":
          if (p.name) (ctx.scope.types ??= new Map()).set(p.name, { k: "fn" });
          break;
      }
    }
    if (kw.length) out.push(`{ ${kw.join(", ")} }: any = {}`);
    void kwRequired;
    const blk = params.find((p) => p.kind === "block");
    // A Ruby `&block` is a Proc or nil: a function, optional.
    if (blk) out.push(`${jsIdent(blk.name ?? "block")}?: (...args: unknown[]) => unknown`);
    return out.join(", ");
  }

  /**
   * A parameter's type from its default: a literal `false` / `true`, a String,
   * a number, an Array or Hash. `nil` says nothing about what a caller passes.
   */
  noteParamType(ctx: Ctx, name: string, def: N): void {
    const t = this.typeOf(def, ctx);
    if (t?.k === "prim" || t?.k === "array" || t?.k === "hash")
      (ctx.scope.types ??= new Map()).set(name, t);
  }

  expr(n: N, ctx: Ctx): string {
    switch (n.k) {
      case "nil":
        return "null";
      case "true":
        return "true";
      case "false":
        return "false";
      case "self":
        return ctx.selfExpr;
      case "int":
        return n.value.length > 15 ? `${n.value}n` : n.value;
      case "float":
        // In a ported test an integral Float literal (`1.0`) stays a Float: ruby-compat
        // reads a boxed Number as one (`rbObjClass`), a primitive integral as Integer.
        if (ctx.f.rubyFile.startsWith("test/") && Number.isInteger(n.value))
          return `new Number(${n.value.toFixed(1)})`;
        return String(n.value);
      // `2.123456789r` (Prism RationalNode): ruby-compat `rational(num, den)`.
      case "rational":
        return `${this.rc(ctx, "rational")}(${n.num}n, ${n.den}n)`;
      case "str":
        return JSON.stringify(n.value);
      case "sym":
        return JSON.stringify(symColonHere(ctx) ? ":" + n.value : n.value);
      case "dstr":
      case "dsym":
        return (
          "`" +
          n.parts
            .map((p: N) =>
              p.k === "str"
                ? escTpl(p.value)
                : // `"#{ {...} }"` is Hash#to_s, which is `inspect` (hash.c rb_hash_inspect).
                  p.k === "hash" || p.k === "array"
                  ? "${" + `${this.rc(ctx, "rbInspect")}(${this.expr(p, ctx)})` + "}"
                  : // `"#{x.class}"` interpolates the Ruby class name (`NilClass`).
                    p.k === "call" &&
                      p.name === "class" &&
                      p.args.length === 0 &&
                      p.recv &&
                      p.recv.k !== "self"
                    ? "${" + `${this.rc(ctx, "rbObjClassname")}(${this.expr(p.recv, ctx)})` + "}"
                    : this.interpolate(p, ctx),
            )
            .join("") +
          "`"
        );
      case "regex": {
        const lit = regexLit(n.source, n.flags);
        try {
          const m = lit.match(/^\/(.*)\/([a-z]*)$/s)!;
          new RegExp(m[1], m[2]);
        } catch {
          return this.decline(ctx, "regex-unsupported", n, `/${n.source}/${n.flags}`);
        }
        return lit;
      }
      case "dregex":
        return `new RegExp(${"`" + n.parts.map((p: N) => (p.k === "str" ? escTpl(p.value) : "${" + this.expr(p, ctx) + "}")).join("") + "`"}, ${JSON.stringify(jsFlags(n.flags))})`;
      case "array":
        return `[${n.elems.map((e: N) => (e.k === "splat" ? `...${this.expr(e.value, ctx)}` : this.expr(e, ctx))).join(", ")}]`;
      case "hash":
        return this.hashLit(n.pairs, ctx);
      case "range":
        return `new ${this.rc(ctx, "Range")}(${n.from ? this.expr(n.from, ctx) : "null"}, ${n.to ? this.expr(n.to, ctx) : "null"}, ${n.exclusive})`;
      case "lvar":
        if (!this.isLocal(ctx, n.name)) return `${ctx.selfExpr}.${this.callName(n.name)}()`;
        return jsIdent(n.name);
      case "lasgn": {
        this.letFor(this.nest(ctx), n.name);
        return `(${jsIdent(n.name)} = ${this.expr(n.value, ctx)})`;
      }
      case "ivar":
        return this.ivar(n.name, ctx);
      case "iasgn":
        return `(${this.ivar(n.name, ctx)} = ${this.expr(n.value, ctx)})`;
      case "cvar":
        return this.cvar(n.name, ctx);
      case "cvasgn":
        return `(${this.cvar(n.name, ctx)} = ${this.expr(n.value, ctx)})`;
      case "nthref":
        return `${this.rc(ctx, "rbBackrefNth")}(${n.n})`;
      case "gvar":
        if (n.name === "$&") return `${this.rc(ctx, "lastMatchGetter")}()`;
        if (n.name === "$~") return `${this.rc(ctx, "rbBackref")}()`;
        if (n.name === "$!")
          return ctx.rescued ?? ctx.errinfoParam ?? `${this.rc(ctx, "rbErrinfo")}()`;
        return this.decline(ctx, "gvar", n, n.name);
      case "gasgn":
        return this.decline(ctx, "gvar", n, n.name ?? `$${n.n}`);
      case "const":
        // In a colon-Symbol file, the class `Symbol` / `String` as a value (a
        // serializer's `klass`) is ruby-compat's, which `rbIsA` tells apart.
        if (
          ctx.f.symbolColon &&
          GEM.gem === "activejob" &&
          n.path.filter((x: string) => x).length === 1 &&
          ["Symbol", "String"].includes(n.path.filter((x: string) => x)[0]) &&
          !this.index.resolveConst(n.path, ctx.nesting)
        )
          return this.rc(
            ctx,
            n.path.filter((x: string) => x)[0] === "Symbol" ? "rbCSymbol" : "rbCString",
          );
        return this.constRef(n, ctx);
      case "constscope":
        return `${this.expr(n.scope, ctx)}.${n.name}`;
      case "casgn":
        if (!n.path) return this.decline(ctx, "unhandled-node", n, "dynamic constant assignment");
        return `(${this.constRef({ k: "const", path: n.path }, ctx)} = ${this.expr(n.value, ctx)})`;
      case "and":
        return this.andExpr(n, ctx);
      case "or":
        return this.orExpr(n, ctx);
      case "not":
        return `!${this.wrapCond(n.value, ctx)}`;
      case "defined":
        return this.definedExpr(n, ctx);
      case "if": {
        const t = this.seqBody(n.then);
        const e = this.seqBody(n.else);
        if (t.length <= 1 && e.length <= 1 && this.isSimple(t[0]) && this.isSimple(e[0]))
          return `(${this.cond(n.cond, ctx)} ? ${t[0] ? this.expr(t[0], ctx) : "null"} : ${e[0] ? this.expr(e[0], ctx) : "null"})`;
        return this.iife(n, ctx);
      }
      case "seq":
        if (n.body.length === 1) return this.expr(n.body[0], ctx);
        if (n.body.length === 0) return "null";
        return this.iife(n, ctx);
      case "case":
      case "begin":
      case "while":
      case "masgn":
      case "opasgn":
      case "return":
      case "next":
      case "break":
      case "for":
        if (n.k === "opasgn" && n.target.k !== "lvar") return this.opasgnExpr(n, ctx);
        return this.iife(n, ctx);
      case "call":
        return this.call(n, ctx);
      case "super":
        return this.superCall(n, ctx);
      case "yield": {
        const y = `${ctx.blockVar ?? "block"}(${n.args.map((a: N) => this.argExpr(a, ctx)).join(", ")})`;
        // In an async method the block may itself be async; await it so a
        // surrounding `ensure` runs after the block, as Ruby's does.
        if (
          ctx.asyncBox &&
          ((ctx.defAsync && !ctx.inBlock) ||
            (ctx.defName && this.resolver.asyncYielders.has(ctx.defName)))
        ) {
          ctx.asyncBox.awaits = true;
          return `(await ${y})`;
        }
        return y;
      }
      case "lambda":
        if (n.libLambda) return this.arrow(n.params, n.body, this.child(ctx, { testMode: false }));
        return this.arrow(n.params, n.body, ctx);
      case "block":
        return this.arrow(n.params, n.body, ctx);
      case "symproc":
      case "blockpass":
        return this.blockArg(n, ctx);
      case "splat":
        return `...${this.expr(n.value, ctx)}`;
      case "kwargs":
        return this.kwargs(n.pairs, ctx);
      case "fwdargs":
        return "...args";
      case "def":
        return this.decline(ctx, "unhandled-node", n, `def ${n.name} in expression`);
      default:
        return this.decline(ctx, "unhandled-node", n, n.src ?? n.k);
    }
  }

  hoist(ctx: Ctx, name: string): void {
    this.stat(ctx, "hoisted-local");
    ctx.scope.hoisted ??= new Set();
    ctx.scope.hoisted.add(name);
  }

  isSimple(n: N | undefined): boolean {
    if (!n) return true;
    return (
      !["if", "case", "begin", "while", "masgn", "return", "next", "break", "seq", "for"].includes(
        n.k,
      ) && !(n.k === "opasgn")
    );
  }

  wrapCond(n: N, ctx: Ctx): string {
    const c = this.cond(n, ctx);
    return /^[\w.$]+(\(.*\))?$/.test(c) && !c.includes(" ") ? c : `(${c})`;
  }

  iife(n: N, ctx: Ctx): string {
    this.stat(ctx, "iife");
    const inner = this.child(ctx, {
      inBlock: true,
      inLoop: false,
      nested: true,
      asyncBox: { awaits: false },
    });
    const body = this.stmt(n, inner, true);
    const asy = inner.asyncBox!.awaits ? "async " : "";
    if (asy && ctx.asyncBox) ctx.asyncBox.awaits = true;
    const call = `(${asy}() => {\n${indent(body).join("\n")}\n})()`;
    return asy ? `(await ${call})` : call;
  }

  opasgnExpr(n: N, ctx: Ctx): string {
    const lhs = this.lvalue(n.target, ctx);
    const v = this.expr(n.value, ctx);
    if (n.op === "||") return `(${this.truthy(lhs, true)} ? ${lhs} : (${lhs} = ${v}))`;
    if (n.op === "&&") return `(${this.truthy(lhs, true)} ? (${lhs} = ${v}) : ${lhs})`;
    return `(${lhs} = ${this.operator({ k: "call", recv: n.target, name: n.op, args: [n.value], l: n.l }, lhs, ctx)})`;
  }

  /**
   * Value-position `a || b` / `a && b` (Ruby truthiness, value of the deciding
   * operand). A boolean left side uses JS `||`/`&&`; a left side that is an
   * object or never `false` uses `??` / `!= null`; anything else tests a temp
   * for Ruby truthiness so the left side is evaluated once and the right side stays
   * lazy (and may `await`).
   */
  orExpr(n: N, ctx: Ctx): string {
    const l = this.expr(n.left, ctx);
    const r = wrapArrow(this.expr(n.right, ctx));
    const lt = this.typeOf(n.left, ctx);
    if (this.isBoolean(n.left) || isBool(lt)) return `(${l} || ${r})`;
    if (isObjectLike(lt) || this.neverFalse(n.left)) return `(${l} ?? ${r})`;
    const [t, init] = this.once(l, n.left, ctx);
    return `(${this.truthy(init, true)} ? ${t} : ${r})`;
  }

  /**
   * `x.is_a?(K)` / `kind_of?` / `instance_of?` / `K === x` on a local: the local
   * and the instance type it is narrowed to on the true branch, as TypeScript
   * narrows `x instanceof K`.
   */
  narrowing(c: N, ctx: Ctx): [string, TypeRef] | null {
    if (c?.k === "and") return this.narrowing(c.left, ctx) ?? this.narrowing(c.right, ctx);
    if (c?.k !== "call") return null;
    let local: N | undefined, klass: N | undefined;
    if (["is_a?", "kind_of?", "instance_of?"].includes(c.name) && c.args.length === 1)
      [local, klass] = [c.recv, c.args[0]];
    else if (c.name === "===" && c.recv?.k === "const" && c.args.length === 1)
      [local, klass] = [c.args[0], c.recv];
    if (local?.k !== "lvar" || !klass) return null;
    let t: TypeRef = null;
    if (klass.k === "const") {
      const st = this.resolver.constType(klass.path, ctx.nesting);
      if (st?.k === "class") t = { k: "class", key: st.key };
      else {
        const hit = this.index.resolveConst(klass.path, ctx.nesting);
        if (hit?.kind === "scope") t = { k: "gemClass", fqn: hit.fqn };
      }
    } else if (klass.k === "call" && klass.name === "class" && klass.recv?.k === "self")
      t = this.selfType(ctx);
    return t ? [local.name, t] : null;
  }

  /** Lower `f()` with local `name` typed `t`, restoring its type afterwards. */
  withNarrowed<T>(ctx: Ctx, nar: [string, TypeRef] | null, f: () => T): T {
    if (!nar) return f();
    let s: Scope | undefined = ctx.scope;
    while (s && !s.locals.has(nar[0])) s = s.parent;
    if (!s) return f();
    s.types ??= new Map();
    const had = s.types.has(nar[0]);
    const prev = s.types.get(nar[0]);
    s.types.set(nar[0], nar[1]);
    try {
      return f();
    } finally {
      if (had) s.types.set(nar[0], prev ?? null);
      else s.types.delete(nar[0]);
    }
  }

  andExpr(n: N, ctx: Ctx): string {
    const l = this.expr(n.left, ctx);
    const r = wrapArrow(
      this.withNarrowed(ctx, this.narrowing(n.left, ctx), () => this.expr(n.right, ctx)),
    );
    const lt = this.typeOf(n.left, ctx);
    if (this.isBoolean(n.left) || isBool(lt)) return `(${l} && ${r})`;
    const [t, init] = this.once(l, n.left, ctx);
    if (isObjectLike(lt)) return `(${init} != null ? ${r} : ${t})`;
    return `(${this.truthy(init, true)} ? ${r} : ${t})`;
  }

  /**
   * `a == b` is JS `===` where Ruby's `==` is a primitive's: the receiver is
   * typed a String, Number, Boolean or nil (`String#==`, `Integer#==`), or the
   * argument is `nil` (`BasicObject#==` identity; a nil answers `==` only to nil).
   */
  primEq(n: N, rt: TypeRef, ctx: Ctx): boolean {
    if (n.args.length !== 1) return false;
    if (n.args[0].k === "nil") return true;
    const at = this.typeOf(n.args[0], ctx);
    return rt?.k === "prim" && (at?.k === "prim" || at === null);
  }

  /** Evaluate `e` once: a plain read is reused; anything else goes through a hoisted temp. */
  once(e: string, n: N, ctx: Ctx): [string, string] {
    if (["lvar", "ivar", "self", "const", "nil", "true", "false"].includes(n.k)) return [e, e];
    const t = this.tmp(ctx, "_t");
    const target = ctx.fnScope ?? ctx.scope;
    (target.hoisted ??= new Set()).add(t);
    return [t, `(${t} = ${e})`];
  }

  /** Ruby value that is never literally `false` (so `||` ≡ `??`). */
  neverFalse(n: N): boolean {
    if (
      n.k === "call" &&
      ["[]", "fetch", "first", "last", "find", "detect", "dup", "new", "to_s", "name"].includes(
        n.name,
      )
    )
      return true;
    return false;
  }

  definedExpr(n: N, ctx: Ctx): string {
    const v: N = n.value;
    if (v.k === "const") return `(typeof ${this.constRef(v, ctx)} !== "undefined")`;
    if (v.k === "ivar") return `(${this.ivar(v.name, ctx)} !== undefined)`;
    if (v.k === "call" && v.recv === null)
      return `(typeof ${ctx.selfExpr}.${this.callName(v.name)} !== "undefined")`;
    if (v.k === "lvar") return "true";
    if (v.k === "call" && v.recv && v.args.length === 0) {
      // `defined?(Rails.env)`: the receiver resolves and answers the member.
      const recv =
        v.recv.k === "const"
          ? this.constRef(v.recv, ctx).replace(/!$/, "")
          : this.expr(v.recv, ctx);
      return `(${recv}?.${this.callName(v.name)} !== undefined)`;
    }
    if (v.k === "yield") return `(${ctx.blockVar ?? "block"} != null)`;
    if (v.k === "super") return "true";
    return this.decline(ctx, "defined", n, n.src);
  }

  ivar(name: string, ctx: Ctx): string {
    return `${ctx.selfExpr}._${propName(name.slice(1)).replace(/^_/, "")}`;
  }

  cvar(name: string, ctx: Ctx): string {
    this.stat(ctx, "cvar");
    const owner = ctx.owner ? this.scopeRef(ctx.owner, ctx) : "this";
    return `${owner}._${jsIdent(name.slice(2)).replace(/^_/, "")}`;
  }

  attrName(rubyName: string): string {
    return propName(rubyName.replace(/[?!]$/, ""));
  }

  /** Name for a call of Ruby method `name`. */
  callName(name: string): string {
    return tsMethodName(name);
  }

  /**
   * The getter a gem class inherits from a dependency superclass under Ruby name
   * `rubyName` (`ActiveSupport::LogSubscriber#logger`), from the type oracle.
   */
  inheritedDepGetter(fqn: string | undefined, rubyName: string, isStatic: boolean) {
    const sc = fqn ? this.index.scopes.get(fqn) : undefined;
    const p = sc?.superclassPath?.filter((x: string) => x) ?? [];
    const key =
      (fqn && this.resolver.oracleKey(fqn)) ??
      (p.length && !sc!.superclassFqn ? this.resolver.types.depClass(p) : undefined);
    const m = key ? this.resolver.types.member(key, rubyName, isStatic) : undefined;
    return m?.info.kind === "get" && m.owner.startsWith("@") ? m : undefined;
  }

  /**
   * The TS spelling of an oracle type, for a generated signature. A class is
   * imported from the package or generated file that exports it at run time; one
   * nothing exports, and an unknown type, are `any`.
   */
  tsType(t: TypeRef | undefined, ctx?: Ctx): string {
    if (!t) return "any";
    if ("nullable" in t && t.nullable) {
      const base = this.tsType({ ...t, nullable: false } as TypeRef, ctx);
      return base === "any" ? base : `${base} | null`;
    }
    switch (t.k) {
      case "class": {
        const name = ctx ? this.classTypeRef(t.key, ctx) : null;
        return name ? (t.static ? `typeof ${name}` : name) : "any";
      }
      case "prim":
        return t.name;
      case "array": {
        const el0 = t.el ? this.tsType(t.el, ctx) : "unknown";
        const el = el0 === "any" ? "unknown" : el0;
        return /\s/.test(el) ? `(${el})[]` : `${el}[]`;
      }
      case "fn":
        return "(...args: unknown[]) => unknown";
      // A Ruby Hash is a plain object unless the hand twin says it may be a Map.
      case "hash":
        return t.map ? "Map<unknown, unknown>" : "Record<string, unknown>";
      default:
        return "any";
    }
  }

  /** The local name a class from an oracle key is imported as, or null. */
  classTypeRef(key: string, ctx: Ctx): string | null {
    const hash = key.indexOf("#");
    if (hash < 0) return null;
    const file = key.slice(0, hash);
    const name = key.slice(hash + 1);
    if (!/^[A-Z][\w$]*$/.test(name)) return null;
    if (file.startsWith("@")) {
      const spec = `@blazetrails/${file.slice(1).split("/")[0]}`;
      return this.resolver.pkgExports(spec).has(name) ? this.imp(ctx, spec, name) : null;
    }
    for (const e of this.resolver.exportNames.values())
      if (e.tsFile === file && e.name === name)
        return file === ctx.f.tsFile
          ? name
          : this.imp(ctx, `@root/${file.replace(/\.ts$/, ".js")}`, name);
    return null;
  }

  /** Is `name` known in the gem only as an attr reader (→ property access)? */
  /**
   * Whether a zero-argument call on a receiver of unknown type reads a
   * property. In the gem: an attr, and no `def` of that name a zero-argument
   * call can reach (`LogSubscriber#scheduled_at(event)` does not make
   * `job.scheduled_at` a method). Outside it: the type oracle declares the
   * name only as a getter or property on the dependency classes it knows.
   */
  isAttrLike(name: string, otherRecv = false): boolean {
    // A reader `def x` whose writer a gem scope declares (`attr_writer :priority`)
    // is one accessor (the module getter half), read as a property.
    if (this.index.instanceWriters.has(name)) return true;
    // The hand port reads the name as a property wherever it declares it
    // (`SqlTypeMetadata#sql_type`, `Persistence#id_in_database`).
    if (this.resolver.types.onlyProperty(propName(name))) return true;
    const m = this.index.methodNames.get(name);
    // A test helper's `def` is sent to a test only, never to another receiver.
    if (m) return m.attr > 0 && m.zeroArity - (otherRecv ? (m.testZero ?? 0) : 0) === 0;
    return this.resolver.isProperty(name);
  }

  constRef(n: N, ctx: Ctx): string {
    return this.resolver.constRef(n.path, ctx.nesting, ctx, this);
  }

  scopeRef(fqn: string, ctx: Ctx): string {
    return this.resolver.fqnRef(fqn, ctx, this);
  }

  /**
   * A constructor's statement `super` whose next stop in Ruby's ancestor chain
   * is a module `initialize`: that body is written in place, its parameters
   * bound to the call's arguments, and its own `super` continues down the chain
   * (CLAUDE.md, "A module's `initialize` is inlined into the constructor").
   * Null when there is nothing to inline or the arguments cannot be bound by
   * position (a splat), which leaves the ordinary `super` lowering.
   */
  inlineSuper(n: N, ctx: Ctx): string[] | null {
    if (!ctx.isCtor || !ctx.inlineChain) return null;
    if (!ctx.inlineChain.length) {
      // The end of the chain on a class with no superclass is `Object#initialize`,
      // which does nothing, unless a module the gem cannot see (a dependency's)
      // still sits in the ancestors.
      const sc = ctx.owner ? this.index.scopes.get(ctx.owner) : undefined;
      if (sc && !sc.hasSuperclass && !this.hasExternalInclude(sc.fqn)) return [];
      return null;
    }
    const [hook, ...rest] = ctx.inlineChain;
    const params: Param[] = hook.def.params;
    // The call's arguments: positional, a keyword object, a block.
    let positional: string[];
    let kw: string | null = null;
    let blk: string | null = null;
    if (n.zsuper) {
      const dp = ctx.defParams ?? [];
      positional = [];
      for (const p of dp) {
        if (p.kind === "req" || p.kind === "opt") positional.push(jsIdent(p.name!));
        else if (p.kind === "rest" || p.kind === "fwd") {
          // A `*rest` / `(...)` the inliner bound forwards the arguments it took;
          // one the constructor itself declares cannot be split by position.
          if (!ctx.forwarded) return null;
          positional.push(...ctx.forwarded.rest);
          if (p.kind === "fwd") {
            kw = ctx.forwarded.kw;
            blk = ctx.forwarded.blk;
          }
        }
      }
      const kws = dp.filter((p) => ["key", "keyreq", "keyrest"].includes(p.kind));
      if (kws.length)
        kw = `{ ${kws.map((p) => (p.kind === "keyrest" ? `...${jsIdent(p.name ?? "kwrest")}` : jsIdent(p.name!))).join(", ")} }`;
      const b = dp.find((p) => p.kind === "block");
      if (b && !n.block) blk = jsIdent(b.name ?? ctx.blockVar ?? "block");
    } else {
      positional = [];
      for (const a of n.args as N[]) {
        if (a.k === "splat" || a.k === "fwdargs" || a.k === "blockpass") return null;
        if (a.k === "kwargs") kw = this.expr(a, ctx);
        else positional.push(this.argExpr(a, ctx));
      }
    }
    if (n.block) blk = this.blockArg(n.block, ctx);
    if (params.some((p) => p.destructure)) return null;
    const restP = params.find((p) => p.kind === "rest" || p.kind === "fwd");

    const out: string[] = [];
    const binds: string[] = [];
    (ctx.inlined ??= []).push(hook);
    const inner = this.child(ctx, {
      scope: { locals: new Set(), parent: ctx.scope },
      defParams: params,
      inlineChain: rest,
      nested: true,
    });
    const bind = (name: string, value: string) => {
      inner.scope.locals.add(name);
      const js = jsIdent(name);
      if (value === js) return;
      // Evaluate the argument outside the inlined block, so a parameter named
      // like the expression it is bound to does not read itself (TDZ).
      const t = this.tmp(ctx, `_${js}`);
      out.push(`const ${t} = ${value};`);
      binds.push(`let ${js}: any = ${t};`);
    };
    let i = 0;
    for (const p of params) {
      if (p.kind === "req") bind(p.name!, positional[i++] ?? "null");
      else if (p.kind === "opt")
        bind(p.name!, positional[i] !== undefined ? positional[i++] : this.expr(p.default!, inner));
      else if (p.kind === "rest" && p.name) bind(p.name, `[${positional.slice(i).join(", ")}]`);
    }
    if (restP)
      inner.forwarded = {
        rest: positional.slice(i),
        kw: restP.kind === "fwd" ? kw : null,
        blk: restP.kind === "fwd" ? blk : null,
      };
    const kwps = params.filter((p) => ["key", "keyreq", "keyrest"].includes(p.kind));
    if (kwps.length) {
      const t = this.tmp(ctx, "_kwargs");
      out.push(`const ${t}: any = ${kw ?? "{}"};`);
      const parts = kwps.map((p) => {
        inner.scope.locals.add(p.name ?? "kwrest");
        if (p.kind === "keyrest") return `...${jsIdent(p.name ?? "kwrest")}`;
        const d = p.kind === "key" && p.default ? ` = ${this.expr(p.default, inner)}` : "";
        return `${jsIdent(p.name!)}${d}`;
      });
      binds.push(`let { ${parts.join(", ")} } = ${t};`);
    }
    const bp = params.find((p) => p.kind === "block");
    if (bp) bind(bp.name ?? "block", blk ?? "null");
    if (bp) inner.blockVar = jsIdent(bp.name ?? "block");
    const body = this.block(this.seqBody(hook.def.body), inner, false);
    this.stat(ctx, "inlined-initialize");
    // A block keeps the module's locals apart from the constructor's.
    return [...out, "{", ...indent([...binds, ...body]), "}"];
  }

  /** Whether `fqn` (or a module it includes) includes a module outside the gem. */
  hasExternalInclude(fqn: string, seen = new Set<string>()): boolean {
    if (seen.has(fqn)) return false;
    seen.add(fqn);
    const sc = this.index.scopes.get(fqn);
    if (!sc) return false;
    const chain = lexicalChain(this.index, sc.lexicalParent);
    for (const inc of sc.includes) {
      const hit = this.index.resolveConst(inc, [...chain, fqn]);
      if (!hit || hit.kind !== "scope") {
        // A dependency module the Rails manifest records with no `initialize`
        // is transparent to `super`; an inlinable one is part of the chain.
        if (this.index.depInits.has(inc.filter((x) => x).join("::"))) continue;
        return true;
      }
      if (this.hasExternalInclude(hit.fqn, seen)) return true;
    }
    return false;
  }

  superCall(n: N, ctx: Ctx): string {
    if (ctx.superIsSelf) return "this";
    let args: string;
    if (n.zsuper) {
      // Inside an inlined `initialize`, a `*rest` / `(...)` stands for the
      // arguments the inliner bound to it (`ctx.forwarded`).
      const fw = ctx.forwarded;
      args = (ctx.defParams ?? [])
        .map((p) => {
          if (p.kind === "req" || p.kind === "opt") return jsIdent(p.name!);
          if (p.kind === "rest")
            return fw ? fw.rest.join(", ") || null : `...${jsIdent(p.name ?? "rest")}`;
          if (p.kind === "fwd")
            return fw
              ? [...fw.rest, fw.kw, n.block ? null : fw.blk].filter(Boolean).join(", ") || null
              : "...args";
          return null;
        })
        .filter(Boolean)
        .join(", ");
      const kws = (ctx.defParams ?? []).filter(
        (p) => p.kind === "key" || p.kind === "keyreq" || p.kind === "keyrest",
      );
      if (kws.length) {
        const parts = kws.map((p) =>
          p.kind === "keyrest" ? `...${jsIdent(p.name ?? "kwrest")}` : jsIdent(p.name!),
        );
        args = [args, `{ ${parts.join(", ")} }`].filter(Boolean).join(", ");
      }
      // A literal block on `super` replaces the method's own (Ruby passes one
      // block): forward the method's block only when `super` has none.
      const blk = n.block ? undefined : (ctx.defParams ?? []).find((p) => p.kind === "block");
      if (blk)
        args = [args, jsIdent(blk?.name ?? ctx.blockVar ?? "block")].filter(Boolean).join(", ");
    } else {
      args = n.args.map((a: N) => this.argExpr(a, ctx)).join(", ");
    }
    if (n.block) args = [args, this.blockArg(n.block, ctx)].filter(Boolean).join(", ");
    const derived = !!ctx.owner && !!this.index.scopes.get(ctx.owner)?.hasSuperclass;
    // `Kernel#respond_to?` is ruby-compat's `basicObjRespondTo(obj, mid, pub)`
    // (CLAUDE.md "Method visibility is compile-time only").
    if (ctx.objSingletonSuper && ctx.defName === "respond_to?") {
      const [m, priv] = (ctx.defParams ?? []).map((p) => jsIdent(p.name!));
      return `${this.rc(ctx, "basicObjRespondTo")}(this, ${m}${priv ? `, !${this.truthy(priv, true)}` : ""})`;
    }
    if (ctx.objSingletonSuper)
      return `Object.getPrototypeOf(this).${this.defTsName(ctx)}.call(${["this", args].filter(Boolean).join(", ")})`;
    if (ctx.isCtor) {
      if (derived) {
        const sup = this.index.scopes.get(ctx.owner!)?.superclassPath;
        const parent = sup ? this.constRef({ k: "const", path: sup }, ctx) : null;
        return `super(${parent && /^[\w$.]+$/.test(parent) ? typedSplat(args, `ConstructorParameters<typeof ${parent}>`) : args})`;
      }
      this.stat(ctx, "ctor-super-into-module");
      return `${this.rc(ctx, "rbCallSuper")}(this, "initialize", ${JSON.stringify(ctx.owner)}${args ? ", " + args : ""})`;
    }
    if (ctx.isModule && ctx.owner) {
      // A module's `super` is resolved here, as a constructor's `@inlinedFrom`
      // chain is: across every class of the gem that includes the module, the
      // next definition after it in Ruby's ancestors. When they agree, `super`
      // is a direct call of that definition: the next module's function, or the
      // class's prototype method.
      const next = this.moduleSuperTarget(ctx.owner, ctx.defName ?? "");
      if (next) {
        this.stat(ctx, "module-super-static");
        const fn = tsMethodName(ctx.defName ?? "", next.owner);
        let callee: string;
        const nextExp = this.resolver.exportNames.get(next.owner);
        if (next.kind === "module" && nextExp && this.resolver.isClassModule(next.owner)) {
          // The next module is a class: its method on the prototype, or a
          // `ClassMethods` method on the class itself.
          const ref = this.resolver.importFrom(nextExp.tsFile, nextExp.name, ctx, this);
          callee = next.owner.endsWith("::ClassMethods")
            ? `${ref}.${fn}`
            : `${ref}.prototype.${fn}`;
        } else if (next.kind === "module") {
          callee = this.resolver.importFrom(this.resolver.tsFileOf(next.file), fn, ctx, this);
        } else {
          const exp = this.resolver.exportNames.get(next.owner)!;
          callee = `${this.resolver.importFrom(exp.tsFile, exp.name, ctx, this)}.prototype.${fn}`;
        }
        const call = `${callee}.call(${["this", args].filter(Boolean).join(", ")})`;
        if (ctx.defAsync && ctx.asyncBox) {
          ctx.asyncBox.awaits = true;
          return `(await ${call})`;
        }
        return call;
      }
      // A module that is a class has no run-time link to search from: `include()`
      // copied its methods onto the includer. Its `super` past the gem is
      // resolved here too (externalSuperTarget).
      if (this.resolver.isClassModule(ctx.owner)) {
        const ext =
          this.classMethodsSuperTarget(ctx.owner, ctx.defName ?? "", ctx) ??
          this.externalSuperTarget(ctx.owner, ctx.defName ?? "", ctx);
        if (ext) {
          this.stat(ctx, "module-super-external");
          const call = ext(args);
          if (ctx.defAsync && ctx.asyncBox) {
            ctx.asyncBox.awaits = true;
            return `(await ${call})`;
          }
          return call;
        }
        return this.decline(ctx, "unhandled-node", { k: "super" } as N, `super past ${ctx.owner}`);
      }
      // ruby-compat Module#superMethod: resume the lookup past this module's
      // link in the receiver's ancestry (vm_search_super_method).
      const exp = this.resolver.exportNames.get(ctx.owner);
      if (exp) {
        this.stat(ctx, "module-super");
        const mod = this.resolver.importFrom(exp.tsFile, exp.name, ctx, this);
        const call = `${mod}.superMethod(this, ${JSON.stringify(this.defTsName(ctx))})!(${args})`;
        if (ctx.defAsync && ctx.asyncBox) {
          ctx.asyncBox.awaits = true;
          return `(await ${call})`;
        }
        return call;
      }
    }
    if (ctx.isModule || !derived) {
      this.stat(ctx, "super-unresolved");
      const name = this.defTsName(ctx);
      return `${this.rc(ctx, "rbCallSuper")}(this, ${JSON.stringify(name)}, ${JSON.stringify(ctx.owner)}${args ? ", " + args : ""})`;
    }
    return `super.${this.defTsName(ctx)}(${args})`;
  }

  /**
   * `super` from a Concern's `ClassMethods#name`: the next `ClassMethods` that
   * defines it among the concerns after it in an includer's Ruby ancestors
   * (`extend()` copied each onto the class, so the later one replaced the
   * earlier), or a superclass's own singleton method; called directly.
   */
  classMethodsSuperTarget(
    owner: string,
    name: string,
    ctx: Ctx,
  ): ((args: string) => string) | undefined {
    if (!owner.endsWith("::ClassMethods")) return undefined;
    const concern = owner.slice(0, -"::ClassMethods".length);
    const fn = this.defTsName(ctx);
    for (const sc of this.index.scopes.values()) {
      if (sc.kind !== "class") continue;
      const anc = rubyAncestors(this.index, sc.fqn);
      const at = anc.indexOf(concern);
      if (at < 0) continue;
      for (const f of anc.slice(at + 1)) {
        const s = this.index.scopes.get(f)!;
        const cm = this.index.scopes.get(`${f}::ClassMethods`);
        const target = cm?.defs.has(name)
          ? cm.fqn
          : s.kind === "class" && s.sdefs.has(name)
            ? f
            : null;
        if (!target) continue;
        const e = this.resolver.exportNames.get(target);
        if (!e) return undefined;
        const ref = this.resolver.importFrom(e.tsFile, e.name, ctx, this);
        return (args) => `${ref}.${fn}.call(${["this", args].filter(Boolean).join(", ")})`;
      }
      return undefined;
    }
    return undefined;
  }

  /**
   * `super` from `mod#name` where the next definition is outside the gem, in
   * the first library class that includes `mod`: Ruby's ancestors after `mod`
   * reach a dependency module (an `include` the Rails manifest says defines
   * `name`), called through ruby-compat `Module#instanceMethod`, or else the
   * class's dependency superclass, whose prototype answers it (Minitest's
   * `before_setup` through `ActiveSupport::TestCase`). A call builder, or
   * undefined.
   */
  externalSuperTarget(mod: string, name: string, ctx: Ctx): ((args: string) => string) | undefined {
    const fn = this.defTsName(ctx);
    for (const sc of this.index.scopes.values()) {
      if (sc.kind !== "class") continue;
      const anc = rubyAncestors(this.index, sc.fqn);
      const at = anc.indexOf(mod);
      if (at < 0) continue;
      if (sc.superclassFqn && rubyAncestors(this.index, sc.superclassFqn).includes(mod)) continue;
      for (const f of anc.slice(at)) {
        const s = this.index.scopes.get(f)!;
        const chain = [...lexicalChain(this.index, s.lexicalParent), s.fqn];
        for (const inc of [...s.includes].reverse()) {
          if (this.index.resolveConst(inc, chain)) continue;
          const written = inc.filter((x: string) => x).join("::");
          if (!this.index.depMethods.get(written)?.has(name)) continue;
          const ref = this.constRef({ k: "const", path: inc } as N, ctx);
          return (args) =>
            `${ref}.instanceMethod(${JSON.stringify(fn)})!.value.call(${["this", args].filter(Boolean).join(", ")})`;
        }
      }
      // The first class in the chain with a superclass outside the gem (or one
      // a test support file only reopens, `ActiveSupport::TestCase`).
      for (const f of anc) {
        const s = this.index.scopes.get(f)!;
        if (s.kind !== "class" || !s.superclassPath) continue;
        const sup = s.superclassFqn ? this.index.scopes.get(s.superclassFqn) : undefined;
        if (sup && ![...sup.files].every((x) => x.startsWith("test/"))) continue;
        const ref = this.constRef({ k: "const", path: s.superclassPath } as N, ctx);
        return (args) =>
          `${ref}.prototype.${fn}.call(${["this", args].filter(Boolean).join(", ")})`;
      }
      return undefined;
    }
    return undefined;
  }

  /**
   * The definition `super` reaches from `mod#name`, when every gem class that
   * includes `mod` reaches the same one; undefined when they differ, when none
   * includes it, or when the next definition is outside the gem.
   */
  moduleSuperTarget(
    mod: string,
    name: string,
  ): { owner: string; kind: "class" | "module"; file: string } | undefined {
    const owners = new Map<string, { owner: string; kind: "class" | "module"; file: string }>();
    let includers = 0;
    for (const sc of this.index.scopes.values()) {
      if (sc.kind !== "class") continue;
      const anc = rubyAncestors(this.index, sc.fqn);
      const at = anc.indexOf(mod);
      if (at < 0) continue;
      includers++;
      const hit = anc.slice(at + 1).find((f) => {
        const o = this.index.scopes.get(f)!;
        return o.defs.get(name)?.singleton === false || o.attrs.has(name);
      });
      if (!hit) return undefined;
      const o = this.index.scopes.get(hit)!;
      const d = o.defs.get(name);
      if (!d || d.singleton) return undefined;
      if (o.kind === "class" && !this.resolver.exportNames.has(hit)) return undefined;
      owners.set(hit, { owner: hit, kind: o.kind, file: d.file });
    }
    if (!includers || owners.size !== 1) return undefined;
    return [...owners.values()][0];
  }

  defTsName(ctx: Ctx): string {
    return tsMethodName(ctx.defName ?? "", ctx.owner, ctx.singleton);
  }

  // ───────────────────────────── calls ─────────────────────────────

  call(n0: N, ctx: Ctx): string {
    let n = callbackFilterSymbols(n0);
    // A Minitest / ActiveSupport assertion outside a test body (a test helper
    // module's `assert_equal`) is activesupport's flat assertion function
    // (testing/assertions.ts), where the gem defines no method of that name.
    if (
      n.recv === null &&
      !ctx.testMode &&
      /^_?(assert|refute)/.test(n.name) &&
      (!n.block || n.block.k === "blockpass") &&
      !this.index.methodNames.has(n.name)
    ) {
      const fname = tsMethodName(n.name);
      if (this.resolver.pkgExports("@blazetrails/activesupport").has(fname)) {
        const argv = n.args.map((x: N) => this.argExpr(x, ctx));
        if (n.block) argv.push(this.blockArg(n.block, ctx));
        const call = `${this.as(ctx, fname)}(${argv.join(", ")})`;
        // Awaited where the method form would have been (an async assertion).
        return this.callInner(n, this.child(ctx, {})).startsWith("(await ")
          ? `(await ${call})`
          : call;
      }
    }
    // `errors.add(attr, :taken)`: the Symbol is a message key ActiveModel looks
    // up, against a String used literally, so it keeps its colon (CLAUDE.md, "A
    // Ruby Symbol is a JS string": `Errors#add`'s `type`).
    if (
      (n.name === "add" || n.name === "added?" || n.name === "of_kind?") &&
      n.recv?.k === "call" &&
      n.recv.name === "errors" &&
      n.args[1]?.k === "sym"
    )
      n = {
        ...n,
        args: [n.args[0], { k: "str", value: `:${n.args[1].value}` }, ...n.args.slice(2)],
      };
    // activesupport's `run_callbacks` answers a promise when any callback or the
    // block is async (callbacks.ts `runCallbacks`), and Ruby code after it needs
    // its result: await it, which makes the enclosing method async.
    if (n.name === "run_callbacks" && !ctx.testMode && ctx.asyncBox) {
      ctx.asyncBox.awaits = true;
      return `(await ${this.callInner(n, ctx)})`;
    }
    // `recv.instance_exec(*args, &blk)` runs the block with `self` the
    // receiver: the JS spelling is `blk.call(recv, ...args)`.
    if (
      n.name === "instance_exec" &&
      n.block?.k === "blockpass" &&
      n.block.value &&
      n.block.value.k !== "fwdblock" &&
      !n.args.some((a: N) => a.k === "splat" || a.k === "kwargs")
    ) {
      const self = n.recv ? this.expr(n.recv, ctx) : ctx.selfExpr;
      const blk = this.expr(n.block.value, ctx);
      const args = n.args.map((x: N) => this.argExpr(x, ctx));
      return `${needsParens(blk) ? `(${blk})` : blk}.call(${[self, ...args].join(", ")})`;
    }
    // `Proc#arity` of a block or lambda is the function's `length`.
    if (
      n.name === "arity" &&
      n.recv &&
      !n.args.length &&
      !n.block &&
      !this.index.methodNames.get("arity")?.def
    ) {
      const r = this.expr(n.recv, ctx);
      return `${needsParens(r) ? `(${r})` : r}.length`;
    }
    // A top-level `def` of a test support file (helper.rb's `adapter_is?`) is
    // its exported function.
    const topFile = n.recv === null ? this.index.topDefs.get(n.name) : undefined;
    if (topFile) {
      const fn = this.imp(ctx, `@root/${topFile.replace(/\.ts$/, ".js")}`, tsMethodName(n.name));
      return `${fn}(${n.args.map((x: N) => this.argExpr(x, ctx)).join(", ")})`;
    }
    if (!ctx.testMode) return this.callInner(n, ctx);
    // A lambda a test passes as a keyword value (`only: ->(job) { … }`) is a
    // filter the gem calls synchronously (`filter_as_proc(only).call(job)`):
    // library code, not test code awaiting every call.
    if (
      n.args.some((a: N) => a.k === "kwargs" && a.pairs.some((p: any) => p.value?.k === "lambda"))
    )
      n = {
        ...n,
        args: n.args.map((a: N) =>
          a.k === "kwargs"
            ? {
                ...a,
                pairs: a.pairs.map((p: any) =>
                  p.value?.k === "lambda" ? { ...p, value: { ...p.value, libLambda: true } } : p,
                ),
              }
            : a,
        ),
      };
    // A block a test hands to a gem method is kept and run by it, usually on a
    // job (`queue_with_priority { arguments.first … }` is `instance_exec`ed by
    // `QueuePriority#priority`): a `this`-bound function, not an arrow whose
    // `self` is the test case.
    if (
      n.block?.k === "block" &&
      n.recv?.k === "const" &&
      this.index.resolveConst(n.recv.path, ctx.nesting) &&
      // A method that `yield`s runs the block with the test as `self`
      // (`perform_later { |job| assert ... }`); one that keeps it is the case above.
      !(() => {
        const own = this.writerOwner(n.name, n.recv, ctx);
        const d = own?.defs.get(n.name) ?? own?.sdefs.get(n.name);
        return !!d && /"k":"yield"/.test(JSON.stringify(d.node?.body ?? null));
      })()
    )
      // The library runs the block (synchronously, as Ruby's instance_exec does):
      // its body is library code, not test code awaiting every call.
      return this.call(
        { ...n, block: { ...n.block, k: "iexec", libBlock: true } },
        this.child(ctx, {}),
      );
    if (n.recv === null) {
      const a = this.assertion(n, ctx);
      if (a !== null) {
        this.imp(ctx, "vitest", "expect");
        return a;
      }
    }
    const out = this.callInner(n, ctx);
    // Construction is synchronous in trails (a JS constructor cannot await).
    if (n.name === "new") return out;
    if (["lambda", "proc", "raise", "fail", "throw"].includes(n.name) && n.recv === null)
      return out;
    if (isAwaited(out) || ["[]", "==", "!=", "!", "<", ">", "<=", ">="].includes(n.name))
      return out;
    if (ctx.asyncBox) ctx.asyncBox.awaits = true;
    return `(await ${out})`;
  }

  /**
   * A minitest assertion in a ported test as the `expect` form test-compare
   * scores back to it (scripts/test-compare/assertion-kinds.ts): `assert_equal
   * exp, act` is `expect(act).toEqual(exp)`, `assert_nil x` is
   * `expect(x ?? null).toBeNull()` (a Ruby nil may read `undefined`), and so on.
   * Null for a call that is not an assertion.
   */
  assertion(n: N, ctx: Ctx): string | null {
    const a = (i: number) => this.expr(n.args[i], ctx);
    const blockFn = () =>
      n.block?.k === "block"
        ? this.arrow([], n.block.body, this.child(ctx, { testMode: true }))
        : null;
    switch (n.name) {
      case "assert":
        return n.args.length >= 1 ? `expect(${a(0)}).toBeTruthy()` : null;
      case "assert_not":
      case "refute":
        return n.args.length >= 1 ? `expect(${a(0)}).toBeFalsy()` : null;
      case "assert_equal":
        if (n.args.length < 2) return null;
        // A Hash literal is `==` to any Hash with the same pairs (hash.c
        // rb_hash_equal), a Map-backed one included, which `toEqual` is not:
        // the actual value passes as the literal when Ruby's `==` holds, and
        // fails with its own diff when it does not.
        if (n.args[0].k === "hash") {
          const t = `__act`;
          return `expect(((${t}: any) => (${this.rc(ctx, "rbEqual")}(${t}, ${a(0)}) ? ${a(0)} : ${t}))(${a(1)})).toEqual(${a(0)})`;
        }
        return `expect(${a(1)}).toEqual(${a(0)})`;
      // Ruby's `!=` (an object's `==`, identity by default): vitest's `toEqual`
      // ignores classes, so two empty instances of different classes compare equal.
      case "assert_not_equal":
      case "refute_equal":
        return n.args.length >= 2
          ? `expect(${this.rc(ctx, "rbEqual")}(${a(1)}, ${a(0)})).toBe(false)`
          : null;
      // `assert_predicate obj, :sym?` sends the predicate (minitest assertions.rb),
      // so it is lowered as the call `obj.sym?` and dispatches to its TS member.
      case "assert_predicate":
      case "assert_not_predicate":
      case "refute_predicate": {
        if (n.args.length < 2 || n.args[1].k !== "sym") return null;
        const v = this.expr(
          { k: "call", recv: n.args[0], name: n.args[1].value, args: [], l: n.l },
          ctx,
        );
        return `expect(${this.truthy(v)}).toBe(${n.name === "assert_predicate"})`;
      }
      case "assert_nil":
        return n.args.length >= 1 ? `expect(${a(0)} ?? null).toBeNull()` : null;
      case "assert_not_nil":
      case "refute_nil":
        return n.args.length >= 1 ? `expect(${a(0)} ?? null).not.toBeNull()` : null;
      case "assert_same":
        return n.args.length >= 2 ? `expect(${a(1)}).toBe(${a(0)})` : null;
      case "assert_match":
        return n.args.length >= 2 ? `expect(${a(1)}).toMatch(${a(0)})` : null;
      case "assert_no_match":
        return n.args.length >= 2 ? `expect(${a(1)}).not.toMatch(${a(0)})` : null;
      case "assert_includes":
        return n.args.length >= 2 ? `expect(${a(0)}).toContain(${a(1)})` : null;
      case "assert_not_includes":
      case "refute_includes":
        return n.args.length >= 2 ? `expect(${a(0)}).not.toContain(${a(1)})` : null;
      // `assert_kind_of String, x`: a JS string primitive is no `instanceof String`;
      // ruby-compat's `rbObjIsKindOf` answers Ruby's `kind_of?` for it.
      case "assert_kind_of":
        if (n.args.length < 2) return null;
        {
          // Ruby's core classes are ruby-compat's `rbC*` (`rbObjClass("x")` is `rbCString`).
          const c0 = n.args[0];
          const core =
            c0.k === "const" && c0.path.filter((x: string) => x).length === 1
              ? RB_CORE_CLASSES[c0.path.filter((x: string) => x)[0]]
              : undefined;
          const k = core ? this.imp(ctx, "@blazetrails/ruby-compat", core) : a(0);
          return `expect(${this.rc(ctx, "rbObjIsKindOf")}(${a(1)}, ${k})).toBe(true)`;
        }
      case "assert_not_instance_of":
        return n.args.length >= 2 ? `expect(${a(1)}).not.toBeInstanceOf(${a(0)})` : null;
      case "assert_instance_of":
        return n.args.length >= 2 ? `expect(${a(1)}).toBeInstanceOf(${a(0)})` : null;
      case "assert_empty":
        return n.args.length >= 1 ? `expect(${this.rc(ctx, "isEmpty")}(${a(0)})).toBe(true)` : null;
      case "assert_raises":
      case "assert_raise": {
        const f = blockFn();
        if (!f) return null;
        if (ctx.asyncBox) ctx.asyncBox.awaits = true;
        // ActiveSupport's `assertRaises` answers the raised error, as Minitest's
        // `assert_raises` does (`err = assert_raises(...) { }`).
        const classes = n.args.filter((x: N) => x.k !== "kwargs").map((x: N) => this.expr(x, ctx));
        return `(await ${this.imp(ctx, "@blazetrails/activesupport", "assertRaises")}([${classes.join(", ")}], {}, ${f}))`;
      }
      // `assert_difference(expression, difference = 1, message = nil, &block)` and
      // `assert_no_difference(expression, message = nil, &block)`
      // (active_support/testing/assertions.rb): a skipped optional is `undefined`.
      case "assert_difference":
      case "assert_no_difference": {
        const f = blockFn();
        if (!f || n.args.some((x: N) => x.k === "splat" || x.k === "kwargs")) return null;
        const slots = n.name === "assert_difference" ? 3 : 2;
        const given = n.args.map((x: N) => this.argExpr(x, ctx));
        while (given.length < slots) given.push("undefined");
        if (ctx.asyncBox) ctx.asyncBox.awaits = true;
        return `(await ${this.imp(ctx, "@blazetrails/activesupport", snakeToCamel(n.name))}(${[...given, f].join(", ")}))`;
      }
      // `stub_const(mod, constant, new_value, exists: true, &block)`
      // (active_support/testing/constant_stubbing.rb) is activesupport's
      // `stubConst(mod, constant, newValue, block, { exists })`. Ruby's
      // top-level `Object` is `TopLevel` (CLAUDE.md, "Call-time constant resolution").
      case "stub_const": {
        const f = blockFn();
        const pos = n.args.filter((x: N) => x.k !== "kwargs");
        const kw = n.args.find((x: N) => x.k === "kwargs");
        if (!f || pos.length !== 3) return null;
        const m0 = pos[0];
        const mod =
          m0.k === "const" && m0.path.filter((x: string) => x).join("::") === "Object"
            ? this.imp(ctx, "@blazetrails/activesupport", "TopLevel")
            : this.expr(m0, ctx);
        const rest = [this.expr(pos[1], ctx), this.expr(pos[2], ctx), f];
        if (kw) rest.push(this.expr(kw, ctx));
        if (ctx.asyncBox) ctx.asyncBox.awaits = true;
        return `(await ${this.imp(ctx, "@blazetrails/activesupport/test-case", "TestCase", "AsTestCase")}.stubConst(${mod} as any, ${rest.join(", ")}))`;
      }
      case "assert_nothing_raised": {
        const f = blockFn();
        if (!f) return null;
        if (ctx.asyncBox) ctx.asyncBox.awaits = true;
        return `await expect((${f})()).resolves.not.toThrow()`;
      }
    }
    return null;
  }

  callInner(n: N, ctx: Ctx): string {
    const name: string = n.name;
    let r = n.recv ? this.expr(n.recv, ctx) : null;
    if (r !== null && !n.safe) r = this.nonNullRecv(n.recv, r, ctx);
    if (r !== null && (n.recv.k === "int" || n.recv.k === "float")) r = `(${r})`;
    const recvNode: N | null = n.recv;
    const args = (): string[] => {
      const a = n.args.map((x: N) => this.argExpr(x, ctx));
      if (n.block) {
        // Behind a splat the callee cannot tell the block from one more
        // positional (`set_callback(:enqueue, :around, *filters, &blk)`): brand it
        // with ruby-compat `block()`, which `rbBlockGivenP` reads
        // (`rb_block_given_p`). A `&blk` that is nil passes no block at all.
        if (
          n.args.some((x: N) => x.k === "splat") ||
          (this.index.depRestBlock.has(name) && !this.index.methodNames.has(name)) ||
          this.index.gemRestBlock.has(name)
        ) {
          const b = this.blockArg(n.block, ctx);
          // Imported as `rbBlock`: a method's own block parameter is usually
          // named `block`, and would shadow the brand (`block(block)`).
          const brand = this.imp(ctx, "@blazetrails/ruby-compat", "block", "rbBlock");
          a.push(
            n.block.k === "blockpass" && /^[A-Za-z_$][\w$]*$/.test(b)
              ? `...(${b} != null ? [${brand}(${b})] : [])`
              : `${brand}(${b})`,
          );
        } else a.push(this.blockArg(n.block, ctx));
      }
      return a;
    };
    const argList = () => args().join(", ");
    const nav = n.safe ? "?." : ".";
    // A writer in value position (`a.x = b.y = nil`): the statement form's
    // assignment or `setX` call, answering the assigned value as Ruby's does.
    if (/^[a-z_]\w*=$/.test(name) && n.recv && n.args.length === 1 && !n.block) {
      const lines = this.callStmt(n, ctx, false);
      if (lines?.length === 1 && lines[0].endsWith(";")) {
        const body = lines[0].slice(0, -1);
        return /^[^=]*[^=!<>]=[^=]/.test(body)
          ? `(${body})`
          : `(${body}, ${this.expr(n.args[0], ctx)})`;
      }
    }
    // ── `KEYS.zip(values).to_h` with KEYS a literal array constant of strings
    // (`%w[begin end exclude_end]`): a string-keyed Hash, which trails keeps as a
    // plain object (CLAUDE.md "A Ruby Hash is a plain object").
    if (
      name === "to_h" &&
      n.args.length === 0 &&
      !n.block &&
      recvNode?.k === "call" &&
      recvNode.name === "zip" &&
      recvNode.recv?.k === "const"
    ) {
      const hit = this.index.resolveConst(recvNode.recv.path, ctx.nesting);
      if (hit && hit.kind !== "scope" && this.index.consts.get(hit.fqn)?.literal === "array")
        return `Object.fromEntries(${r})`;
    }

    // ── activejob: `name` on an untyped value, where the gem defines no `name` of
    // its own, is `Module#name` (`adapter_class.name` in `ActiveJob.adapter_name`).
    if (
      GEM.gem === "activejob" &&
      name === "name" &&
      n.args.length === 0 &&
      !n.block &&
      recvNode &&
      recvNode.k !== "self" &&
      !this.index.methodNames.has("name") &&
      !this.typeOf(recvNode, ctx)
    )
      return `${this.rc(ctx, "rbModName")}(${r})`;
    // ── `Module#name` on a module value is its Ruby constant path (`rbModName`),
    // not a JS class's short `name`.
    if (
      name === "name" &&
      n.args.length === 0 &&
      recvNode &&
      this.classKey(this.typeOf(recvNode, ctx)) === "@ruby-compat/include.ts#Module"
    )
      return `${this.rc(ctx, "rbModName")}(${r})`;

    const rc = (x: string) => this.rc(ctx, x);

    // ── module functions of a dependency namespace (`ActiveSupport::Inflector.underscore`,
    // `Array.wrap`) are package functions; decided before any receiver-helper
    // rule can pass the namespace object as the first argument.
    if (recvNode?.k === "const") {
      const fn = this.resolver.namespaceFunction(recvNode.path, name, ctx, this);
      if (fn) return `${fn}(${argList()})`;
    }

    // ── implicit-self intrinsics
    const ownDef =
      r === null &&
      !!ctx.owner &&
      this.index
        .ancestors(ctx.owner)
        .some((sc) => (ctx.selfKind === "static" ? sc.sdefs : sc.defs).has(name));
    if (r === null && !ownDef) {
      const macro = ATTR_MACROS[name];
      if (macro) {
        const a = n.args.map((x: N) =>
          x.k === "sym" ? JSON.stringify(jsIdent(x.value)) : this.argExpr(x, ctx),
        );
        return `${this.as(ctx, macro)}.call(${[ctx.selfExpr, ...a].join(", ")})`;
      }
      switch (name) {
        // A module or class body's `extend M` / `include M` (outside the class
        // emitter's own handling) is ruby-compat's `extend(self, M)` / `include(self, M)`.
        case "extend":
        case "include":
          // Minitest's and ActiveSupport's assertion modules are flat functions in
          // trails (activesupport testing/assertions.ts), carried by the test host
          // that stands in for `ActiveSupport::TestCase`; there is no module value.
          if (
            name === "include" &&
            n.args.length === 1 &&
            n.args[0].k === "const" &&
            FLAT_ASSERTION_MODULES.has(n.args[0].path.filter((x: string) => x).join("::"))
          ) {
            this.stat(ctx, "flat-assertion-module");
            return `void "include ${n.args[0].path.filter((x: string) => x).join("::")}: the test host's"`;
          }
          if (ctx.selfKind === "static" && n.args.length)
            return n.args
              .map((a: N) => `${rc(name)}(${ctx.selfExpr}, ${this.expr(a, ctx)})`)
              .join(", ");
          break;
        // `delegate :m, to: :t` run as a statement with `self` a class (`included
        // do`): activesupport `delegate` on the instance side, the hand port's
        // `delegate.call(base.prototype, "m", { to: "class" })` (activerecord core.ts).
        case "delegate":
          if (ctx.selfKind === "static" && n.args.some((a: N) => a.k === "sym")) {
            const names = n.args
              .filter((a: N) => a.k === "sym")
              .map((a: N) => JSON.stringify(tsMethodName(a.value)));
            const opts = n.args.filter((a: N) => a.k !== "sym").map((a: N) => this.argExpr(a, ctx));
            return `${this.as(ctx, "delegate")}.call(${ctx.selfExpr}.prototype, ${[...names, ...opts].join(", ")})`;
          }
          break;
        // `Kernel#DelegateClass(superclass)` is ruby-compat's `DelegateClass`.
        case "DelegateClass":
          return `${rc("DelegateClass")}(${argList()})`;
        case "raise":
        case "fail":
          return `${rc("rbRaise")}(${argList()})`;
        case "block_given?":
          return `(${ctx.blockVar ?? "block"} != null)`;
        // Kernel#BigDecimal(value, ndigits) (bigdecimal.c `f_BigDecimal`).
        case "BigDecimal":
          return `new ${this.rc(ctx, "BigDecimal")}(${argList()})`;
        case "lambda":
        case "proc":
          if (n.block?.k === "block") return this.arrow(n.block.params, n.block.body, ctx);
          break;
        case "require":
        case "require_relative":
          return "undefined";
        case "loop":
          if (n.block?.k === "block") return this.iife({ k: "seq", body: [n] }, ctx);
          break;
        case "binding":
        case "eval":
        case "instance_eval":
        case "class_eval":
        case "module_eval":
        case "instance_exec":
        case "class_exec":
        case "define_method":
          if (
            name === "define_method" ||
            name === "instance_exec" ||
            name === "instance_eval" ||
            name === "class_eval"
          )
            return `${rc(snakeToCamel("rb_" + name))}(${ctx.selfExpr}, ${argList()})`;
          return this.decline(ctx, "ruby-eval", n, name);
        case "puts":
        case "warn":
          return `console.warn(${argList()})`;
        case "format":
        case "sprintf":
          return `${rc("rbFormat")}(${argList()})`;
        case "Array":
          return `${rc("rbFArray")}(${argList()})`;
        case "Integer":
          return `${rc("rbInteger")}(${argList()})`;
        case "Float":
          return `${rc("rbFloat")}(${argList()})`;
        case "String":
          return `String(${argList()})`;
        case "freeze":
          return ctx.selfExpr;
        case "catch":
        case "throw": {
          // A Symbol tag keeps its colon (`kernelThrow(":abort")`, the hand
          // port's spelling, and what activesupport's callbacks catch): a catch
          // tag is matched by identity, so it follows the Symbol convention.
          const parts = args();
          if (n.args[0]?.k === "sym") parts[0] = JSON.stringify(`:${n.args[0].value}`);
          return `${rc("rbF" + name[0].toUpperCase() + name.slice(1))}(${parts.join(", ")})`;
        }
      }
      if (this.isLocal(ctx, name) && n.args.length === 0) return jsIdent(name);
    }

    // ── universal object protocol (receiver-agnostic)
    const R = r ?? ctx.selfExpr;
    switch (name) {
      // A Ruby Symbol is a JS string (CLAUDE.md), so `to_sym` on a String or
      // Symbol is the value itself, whatever the receiver's static type, unless
      // the gem defines its own `to_sym`.
      // ActiveSupport `Object#try` / `try!` (core_ext/object/try.rb): activesupport
      // `tryCall(x, "m", …)` / `tryBang`, the method name as its TS spelling (the
      // hand port's `tryCall(scope, "proxyAssociation")`); a block form is `tryWith`.
      case "try":
      case "try!":
        if (r !== null && !this.index.methodNames.has(name)) {
          if (n.args[0]?.k === "sym") {
            const rest = n.args.slice(1).map((x: N) => this.argExpr(x, ctx));
            const fn = this.as(ctx, name === "try" ? "tryCall" : "tryBang");
            return `${fn}(${[r, JSON.stringify(tsMethodName(n.args[0].value)), ...rest].join(", ")})`;
          }
          if (name === "try" && n.args.length === 0 && n.block)
            return `${this.as(ctx, "tryWith")}(${r}, ${this.blockArg(n.block, ctx)})`;
        }
        break;
      // `Module#const_get` / `const_defined?` / `const_set` (object.c
      // rb_mod_const_get …) are ruby-compat's, with the module as first argument.
      case "const_get":
      case "const_defined?":
      case "const_set":
        if (!this.index.methodNames.has(name)) {
          const fn: string = (
            {
              const_get: "rbModConstGet",
              "const_defined?": "rbModConstDefined",
              const_set: "rbModConstSet",
            } as Record<string, string>
          )[name];
          return `${rc(fn)}(${[R, ...args()].join(", ")})`;
        }
        break;
      case "to_sym":
        if (r !== null && n.args.length === 0 && !n.block && !this.index.methodNames.has("to_sym"))
          return ctx.f.symbolColon ? `${rc("stringToSym")}(${r})` : r;
        break;
      case "nil?":
        return `(${R} == null)`;
      case "is_a?":
      case "kind_of?":
      case "instance_of?":
        if (n.args.length === 1 && n.args[0].k === "const")
          return `(${this.typeTest(n.args[0], R, ctx)})`;
        return `${rc("rbObjIsKindOf")}(${R}, ${argList()})`;
      case "respond_to?":
        // The name asked about is the TS member's (`:permitted?` is `isPermitted`).
        if (n.args[0]?.k === "sym")
          return `${rc("rbObjRespondTo")}(${[R, JSON.stringify(tsMethodName(n.args[0].value)), ...n.args.slice(1).map((x: N) => this.argExpr(x, ctx))].join(", ")})`;
        // A Ruby method name known only at run time (`QUEUE_ADAPTER_METHODS`'s
        // `:enqueue_at`) is translated to the TS member name when asked.
        // docs/ruby-ts-conventions.md: snake_case is camelCase, `x?` is `isX`.
        {
          const tsName = `((s: string) => { const c = s.replace(/[?!]$/, "").replace(/_([a-z0-9])/g, (_m: string, x: string) => x.toUpperCase()); return s.endsWith("?") ? "is" + c[0].toUpperCase() + c.slice(1) : c; })(String(${this.argExpr(n.args[0], ctx)}))`;
          return `${rc("rbObjRespondTo")}(${[R, tsName, ...n.args.slice(1).map((x: N) => this.argExpr(x, ctx))].join(", ")})`;
        }
      // Class#descendants / #subclasses (core_ext/class/subclasses.rb) are
      // activesupport's DescendantsTracker functions on a constant receiver.
      case "descendants":
      case "subclasses":
        if (n.args.length === 0 && recvNode?.k === "const" && GEM.gem === "activejob")
          return `${this.as(ctx, name)}(${R})`;
        break;
      // Object#acts_like? (core_ext/object/acts_like.rb), on any receiver nil included.
      case "acts_like?":
        if (n.args.length === 1)
          return `${this.as(ctx, "actsLike")}.call(${R}, ${this.argExpr(n.args[0], ctx)})`;
        break;
      case "present?":
        return `${this.as(ctx, "isPresent")}(${R})`;
      case "blank?":
        return `${this.as(ctx, "isBlank")}(${R})`;
      case "presence":
        return `${this.as(ctx, "presence")}(${R})`;
      case "dup":
        return `${rc("rbObjDup")}(${R})`;
      case "clone":
        return `${rc("rbObjClone")}(${R})`;
      case "send":
      case "__send__":
        // A literal name is the TS member's (`:deserialize_arguments_if_needed`
        // is `deserializeArgumentsIfNeeded`), awaited when a gem def of it is async.
        if (n.args[0]?.k === "sym") {
          const sym: string = n.args[0].value;
          const call = `${rc("rbFSend")}(${[R, JSON.stringify(tsMethodName(sym)), ...n.args.slice(1).map((x: N) => this.argExpr(x, ctx))].join(", ")})`;
          if ([...this.resolver.asyncDefs].some((k) => k.endsWith(`#${sym}`))) {
            if (ctx.asyncBox) ctx.asyncBox.awaits = true;
            return `(await ${call})`;
          }
          return call;
        }
        return `${rc("rbFSend")}(${R}, ${argList()})`;
      // Ruby `Range#cover?` is ruby-compat Range's `cover`.
      case "cover?":
        if (n.args.length === 1) return `${R}${nav}cover(${this.argExpr(n.args[0], ctx)})`;
        break;
      case "public_send":
        return `${rc("rbFPublicSend")}(${R}, ${argList()})`;
      case "class":
        if (n.args.length === 0) {
          const own =
            (!recvNode || recvNode.k === "self") && ctx.selfKind === "instance" && ctx.owner
              ? this.resolver.exportNames.get(ctx.owner)
              : undefined;
          // `self.class` is ruby-compat's `rbObjClass` (the hand port's spelling,
          // activejob core.ts), typed as the class it is written in.
          if (own && this.index.scopes.get(ctx.owner!)?.kind === "class") {
            const ref = this.resolver.fqnRef(ctx.owner!, ctx, this);
            return `(${rc("rbObjClass")}(${R}) as unknown as typeof ${ref})`;
          }
          return `${rc("rbObjClass")}(${R})`;
        }
        break;
      case "freeze":
        if (n.args.length === 0)
          return recvNode?.k === "str" || recvNode?.k === "dstr" ? R : `Object.freeze(${R})`;
        break;
      case "frozen?":
        return `Object.isFrozen(${R})`;
      case "tap":
        if (n.block?.k === "block") {
          const p = n.block.params[0]?.name ?? "_";
          const scope: Scope = { locals: new Set([p]), parent: ctx.scope };
          const inner = this.child(ctx, {
            scope,
            fnScope: scope,
            inBlock: true,
            nested: false,
            asyncBox: { awaits: false },
          });
          const body = this.block(this.seqBody(n.block.body), inner, false);
          const hz: Set<string> | undefined = scope.hoisted;
          if (hz?.size) body.unshift(`let ${[...hz].map((h) => `${jsIdent(h)}: any`).join(", ")};`);
          const asy = inner.asyncBox!.awaits;
          if (asy && ctx.asyncBox) ctx.asyncBox.awaits = true;
          const fn = `(${asy ? "async " : ""}(${jsIdent(p)}) => {\n${indent([...body, `return ${jsIdent(p)};`]).join("\n")}\n})(${R})`;
          return asy ? `(await ${fn})` : fn;
        }
        break;
      case "then":
      case "yield_self":
        if (n.block?.k === "block")
          return `(${this.arrow(n.block.params, n.block.body, ctx)})(${R})`;
        break;
      case "instance_variable_get":
        return `${rc("rbIvarGet")}(${R}, ${argList()})`;
      case "instance_variable_set":
        return `${rc("rbIvarSet")}(${R}, ${argList()})`;
      case "instance_variable_defined?":
        return `${rc("rbIvarDefined")}(${R}, ${argList()})`;
      case "singleton_class":
        return `(${rc("rbObjSingletonClass")}(${R}) as any)`;
      // `Module#ancestors` on a class: ruby-compat walks the prototype chain and
      // the modules `include` spliced into it.
      case "ancestors":
        if (n.args.length === 0 && !this.index.methodNames.has("ancestors"))
          return `${rc("rbModAncestors")}(${R})`;
        break;
      // `klass.singleton_class.public_instance_methods(false)`: a JS class's
      // singleton class is its own statics (CLAUDE.md "singleton_class is a
      // per-object subclass"), so the class's own public static names, in Ruby
      // spelling for an `include?(:_queue_adapter)` test.
      case "public_instance_methods":
        if (
          n.recv?.k === "call" &&
          n.recv.name === "singleton_class" &&
          n.recv.args.length === 0 &&
          n.args.length === 1 &&
          n.args[0].k === "false"
        )
          // A class_attribute written on the class (its own `__class_attr_<name>`
          // storage, class_attribute.ts) is the singleton reader Ruby's setter defines.
          return `Object.getOwnPropertyNames(${this.expr(n.recv.recv, ctx)}).filter((n) => !["length", "name", "prototype"].includes(n)).map((n) => n.replace(/^__class_attr_/, "")).map((n) => ((u: string) => (n.startsWith("_") && !u.startsWith("_") ? "_" + u : u))(${this.as(ctx, "underscore")}(n)))`;
        break;
      // `3.seconds` on a numeric literal: activesupport's `Numeric#seconds`
      // (core_ext/numeric/time.rb) is `ActiveSupport::Duration.seconds(self)`.
      case "month":
      case "months":
      case "year":
      case "years":
      case "second":
      case "seconds":
      case "minute":
      case "minutes":
      case "hour":
      case "hours":
      case "day":
      case "days":
      case "week":
      case "weeks":
      case "fortnight":
      case "fortnights":
        if (n.args.length === 0 && (n.recv?.k === "int" || n.recv?.k === "float")) {
          const unit = name.endsWith("s") ? name : name + "s";
          return `${this.imp(ctx, "@blazetrails/activesupport", "Duration")}.${unit}(${this.expr(n.recv, ctx)})`;
        }
        // On a value that may be an Integer or a Duration (`options[:wait].seconds`):
        // Duration's `method_missing` reaches the Integer's (duration.rb), so either way
        // it is a Duration of that many units.
        // Plural units only: a singular `second` / `day` on an untyped value is as
        // likely `Array#second` (core_ext/array/access.rb).
        if (
          n.args.length === 0 &&
          r !== null &&
          name.endsWith("s") &&
          !this.index.methodNames.has(name) &&
          !this.typeOf(recvNode, ctx)
        ) {
          const unit = name.endsWith("s") ? name : name + "s";
          const D = this.as(ctx, "Duration");
          return `${D}.${unit}(${this.withOnce(r, (x) => `(${x} instanceof ${D} ? ${x}.value : ${x})`)})`;
        }
        break;
      // `"59.123456789".to_r` on a decimal literal: the Rational String#to_r
      // (rational.c `string_to_r`) answers, folded to its numerator and denominator.
      case "to_r":
        if (n.args.length === 0 && n.recv?.k === "str" && /^-?\d+(\.\d+)?$/.test(n.recv.value)) {
          const [i, fr = ""] = n.recv.value.split(".");
          return `${this.rc(ctx, "rational")}(${BigInt(i + fr)}n, ${10n ** BigInt(fr.length)}n)`;
        }
        break;
      // `Hash#values_at` (hash.c rb_hash_values_at) on a hash value: ruby-compat's.
      case "values_at":
        if (r !== null && !this.index.methodNames.has(name))
          return `${rc("valuesAt")}(${[R, ...args()].join(", ")})`;
        break;
      // `Hash#with_indifferent_access` (core_ext/hash/indifferent_access.rb) is
      // activesupport's flat `withIndifferentAccess(hash)`.
      case "with_indifferent_access":
        if (n.args.length === 0 && r !== null && !this.index.methodNames.has(name))
          return `${this.imp(ctx, "@blazetrails/activesupport", "withIndifferentAccess")}(${R})`;
        break;
      // `Integer#ordinalize` / `#ordinal` (core_ext/integer/inflections.rb) are
      // `ActiveSupport::Inflector.ordinalize(self)`: activesupport's flat export.
      case "ordinalize":
      case "ordinal":
        if (n.args.length === 0 && r !== null && !this.index.methodNames.has(name))
          return `${this.imp(ctx, "@blazetrails/activesupport", name)}(${R})`;
        break;
      // `Numeric#div` (numeric.c `num_div`) is the floored quotient.
      case "div":
        if (n.args.length === 1 && !this.index.methodNames.has("div"))
          return `Math.floor(${R} / ${argList()})`;
        break;
      // Ruby `Exception#backtrace` / `#set_backtrace` are ruby-compat's
      // `excBacktrace` / `excSetBacktrace` (error.c `exc_backtrace`).
      case "backtrace":
        if (n.args.length === 0) return `${rc("excBacktrace")}(${R})`;
        break;
      case "set_backtrace":
        if (n.args.length === 1) return `${rc("excSetBacktrace")}(${R}, ${argList()})`;
        break;
      case "equal?":
        return `(${R} === ${argList()})`;
      case "hash":
        if (n.args.length === 0) return `${rc("rbHash")}(${R})`;
        break;
      case "eql?":
        return `${rc("rbEql")}(${R}, ${argList()})`;
      case "inspect":
        return `${rc("rbInspect")}(${R})`;
      case "to_s":
        if (n.args.length === 0) {
          // `Symbol#to_s` drops the colon (`rb_sym2str`) where the file keeps it.
          if (ctx.f.symbolColon) {
            const v = /^[A-Za-z_$][\w$]*$/.test(R) ? R : null;
            const body = (x: string) =>
              `${rc("isSymbol")}(${x}) ? ${rc("symbolToS")}(${x}) : ${rc("rbObjAsString")}(${x})`;
            return v ? `(${body(v)})` : `((v) => ${body("v")})(${R})`;
          }
          // A value known not to be nil, a String / Number / Boolean, is JS `String(x)`.
          const t = this.typeOf(recvNode, ctx);
          if (t?.k === "prim" && t.name !== "null" && !t.nullable) return `String(${r})`;
          return `${rc("rbObjAsString")}(${R})`;
        }
        break;
      case "fetch":
        if (r !== null) return `${rc("fetch")}(${R}, ${argList()})`;
        break;
    }

    // ── `Mod.x` where `def self.x` is a gem module function → the exported function.
    if (recvNode?.k === "const") {
      const hit = this.index.resolveConst(recvNode.path, ctx.nesting);
      const s = hit?.kind === "scope" ? this.index.scopes.get(hit.fqn) : undefined;
      const exp = s ? this.resolver.exportNames.get(s.fqn) : undefined;
      // A module is a class (emit.ts emitModuleClass): its singleton method is
      // a static one, called on it as Ruby calls it.
      if (
        s?.kind === "module" &&
        exp &&
        s.sdefs.has(name) &&
        !/=$/.test(name) &&
        this.resolver.isClassModule(s.fqn) &&
        this.resolver.tsFileOf(s.sdefs.get(name)!.file) === exp.tsFile
      ) {
        this.stat(ctx, "module-static-call");
        return `${r}.${tsMethodName(name, s.fqn, true)}(${argList()})`;
      }
      if (s?.kind === "module" && exp && s.sdefs.has(name) && !/=$/.test(name)) {
        this.stat(ctx, "module-function-call");
        // A reopened module's function lives in the reopening file's twin
        // (`ActiveJob.deprecator`, active_job/deprecator.rb).
        const tsFile = this.resolver.tsFileOf(s.sdefs.get(name)!.file);
        const fn = this.resolver.importFrom(tsFile, tsMethodName(name, s.fqn, true), ctx, this);
        // A local of the same name (`adapter_name = ActiveJob.adapter_name(x)`)
        // shadows the function: keep Ruby's qualified call on the module object.
        if (this.isLocal(ctx, fn) || ctx.assigning === fn) return `${r}.${fn}(${argList()})`;
        return `${fn}(${argList()})`;
      }
    }

    // ── Ruby String methods (ruby-compat STRING_METHOD_TABLE) via rbStrSend; a
    // bang method mutates in place, so a variable receiver is rebound.
    if (r !== null && recvNode) {
      const ts0 = tsMethodName(name);
      const rt = this.typeOf(recvNode, ctx);
      const stringish =
        (rt?.k === "prim" && rt.name === "string") ||
        (!rt && STRING_ONLY.has(name) && !this.index.methodNames.has(name));
      if (
        stringish &&
        /^[a-z_]/.test(name) &&
        STRING_TABLE.has(ts0) &&
        !(rt?.k === "prim" && NATIVE_STRING.has(ts0))
      ) {
        this.stat(ctx, "rbStrSend");
        const send = `${this.rc(ctx, "rbStrSend")}(${[r, JSON.stringify(ts0), ...args()].join(", ")})`;
        if (name.endsWith("!") && (recvNode.k === "lvar" || recvNode.k === "ivar")) {
          const t = this.tmp(ctx, "_r");
          const target = ctx.fnScope ?? ctx.scope;
          (target.hoisted ??= new Set()).add(t);
          const bt = rt ? STRING_RESULT_TYPES[ts0] : undefined;
          return bt
            ? `((([${t}, ${r}] = ${send}), ${t}) as ${bt})`
            : `(([${t}, ${r}] = ${send}), ${t})`;
        }
        // Only a receiver known to be a String: the untyped STRING_ONLY guess
        // can be another class's method of the same name (`StringScanner#scan`).
        const rt1 = rt ? STRING_RESULT_TYPES[ts0] : undefined;
        return rt1 ? `(${send}[0] as ${rt1})` : `${send}[0]`;
      }
    }

    const typed = this.typedCall(n, r, recvNode, ctx, argList, nav);
    if (typed !== null) return typed;

    if (r !== null && !/^[^a-z_A-Z]/.test(name)) {
      // A Ruby/ActiveSupport method on a receiver typed as an array or string
      // has no member there: use the helper form (ruby-compat / activesupport).
      const rt0 = this.typeOf(recvNode, ctx);
      if (
        (rt0?.k === "array" || (rt0?.k === "prim" && rt0.name === "string")) &&
        ![
          "length",
          "size",
          "map",
          "join",
          "push",
          "includes",
          "split",
          "slice",
          "concat",
          "filter",
          "find",
          "some",
          "every",
          "forEach",
          "flatMap",
          "indexOf",
          "replace",
          "trim",
          "startsWith",
          "endsWith",
        ].includes(tsMethodName(name))
      ) {
        const lowered0 = this.coreCall(n, r, recvNode!, ctx, args, nav);
        if (lowered0 !== null) return lowered0;
        this.stat(ctx, "core-helper-typed");
        return `${this.rc(ctx, rbCoreFn(name))}(${[r, ...args()].join(", ")})`;
      }
    }

    if (r !== null) {
      const lowered = this.coreCall(n, r, recvNode!, ctx, args, nav);
      if (lowered !== null) return lowered;
    }

    // ── operators
    if (n.recv && /^[^a-z_A-Z]/.test(name)) return this.operator(n, r!, ctx);

    // ── `klass.superclass` → ruby-compat rbClassSuperclass.
    if (name === "superclass" && n.args.length === 0 && !n.block)
      return `${this.rc(ctx, "rbClassSuperclass")}(${r ?? ctx.selfExpr})`;

    // ── Ruby `Exception#message` is JS `Error#message`, a property.
    if (name === "message" && n.args.length === 0 && !n.block && recvNode) {
      const mt = this.typeOf(recvNode, ctx);
      const own =
        mt?.k === "class" ? this.resolver.types.member(mt.key, "message", false) : undefined;
      if (!own || own.info.kind !== "method") return `${r}.message`;
    }

    // ── Ruby `Exception#cause` is JS `Error#cause`, a property.
    if (name === "cause" && n.args.length === 0 && !n.block && recvNode) return `${r}.cause`;

    // ── `obj.class.name` on another object (`e.cause.class.name`) is the Ruby
    // constant path ruby-compat registered (`Person::RecordNotFound`), not the
    // JS class name. Ported tests only: in lib the call gates credit `name`,
    // which the hand port spells as the JS class name.
    if (
      ctx.f.rubyFile.startsWith("test/") &&
      name === "name" &&
      n.args.length === 0 &&
      recvNode?.k === "call" &&
      recvNode.name === "class" &&
      recvNode.recv &&
      recvNode.recv.k !== "self"
    )
      return `${rc("rbModName")}(${r})`;
    // activejob's hand port writes `self.class.name` as `rbModName(this.constructor)`
    // (serializers/object-serializer.ts): the serialized payload names the
    // serializer by its Ruby path, which `safe_constantize` reads back.
    if (
      GEM.gem === "activejob" &&
      name === "name" &&
      n.args.length === 0 &&
      recvNode?.k === "call" &&
      recvNode.name === "class" &&
      recvNode.args.length === 0
    )
      return `${rc("rbModName")}(${r})`;
    // ── `klass.name` on a class is the JS class name.
    if (
      name === "name" &&
      n.args.length === 0 &&
      recvNode &&
      ((recvNode.k === "call" && recvNode.name === "class") ||
        this.isStaticClass(this.typeOf(recvNode, ctx)))
    ) {
      return `${r}.name`;
    }

    // ── `ENV[k]` / `ENV.fetch(k, d)` → activesupport `getEnv` (the hand port's idiom).
    if (recvNode?.k === "const" && recvNode.path.filter((x: string) => x).join("::") === "ENV") {
      const ge = this.as(ctx, "getEnv");
      const a = n.args.map((x: N) => this.argExpr(x, ctx));
      if (name === "[]") return `${ge}(${a[0]})`;
      if (name === "fetch") return a.length > 1 ? `(${ge}(${a[0]}) ?? ${a[1]})` : `${ge}(${a[0]})`;
      if (name === "key?" || name === "has_key?") return `(${ge}(${a[0]}) !== undefined)`;
    }

    // ── Ruby core class methods with a ruby-compat port (RUBY_COMPAT_EXPORTS: `Regexp.escape`).
    if (recvNode?.k === "const" && !this.index.resolveConst(recvNode.path, ctx.nesting)) {
      const key = `${recvNode.path.filter((x: string) => x).join("::")}.${name}`;
      const row = RUBY_COMPAT_EXPORTS.get(key);
      const exp = typeof row === "string" ? row : undefined;
      if (exp && this.resolver.pkgExports("@blazetrails/ruby-compat").has(exp)) {
        this.stat(ctx, "ruby-compat-export");
        return `${this.rc(ctx, exp)}(${argList()})`;
      }
      if (recvNode.path.filter((x: string) => x).join("::") === "Arel") {
        const cands = rubyMethodToTsIgnoringSkip(name) ?? [];
        const hit = cands.find((c) => this.resolver.pkgExports("@blazetrails/arel").has(c));
        if (hit) return `${r}.${hit}(${argList()})`;
      }
    }

    // ── Minitest's `obj.stub(:name, val_or_callable) { ... }` (minitest/mock.rb
    // `Object#stub`) is activesupport's `stub(obj, name, val, blockArgs, block)`.
    if (
      r !== null &&
      name === "stub" &&
      n.args[0]?.k === "sym" &&
      n.block &&
      !this.index.methodNames.has("stub")
    ) {
      const rest = n.args.slice(1).map((x: N) => this.argExpr(x, ctx));
      if (ctx.asyncBox) ctx.asyncBox.awaits = true;
      return `(await ${this.imp(ctx, "@blazetrails/activesupport", "stub")}(${r} as any, ${JSON.stringify(tsMethodName(n.args[0].value))}, ${rest[0] ?? "undefined"}, [${rest.slice(1).join(", ")}], ${this.blockArg(n.block, ctx)}))`;
    }
    // ── `Kernel.rand` (random.c rb_f_rand) reads `rand` off ruby-compat's
    // `Kernel` where a test has stubbed it there, else calls `kernelRand`.
    if (
      recvNode?.k === "const" &&
      recvNode.path.filter((x: string) => x).join("::") === "Kernel" &&
      !this.index.resolveConst(recvNode.path, ctx.nesting) &&
      name === "rand"
    )
      return `((${rc("Kernel")} as { rand?: typeof ${rc("kernelRand")} }).rand ?? ${rc("kernelRand")})(${argList()})`;

    // ── `x.class_eval("def …")`: Ruby source evaluated at run time has no generated form.
    if (
      recvNode &&
      ["class_eval", "module_eval", "instance_eval"].includes(name) &&
      (n.args[0]?.k === "str" || n.args[0]?.k === "dstr")
    )
      return this.decline(ctx, "ruby-eval", n, name);

    // ── `Proc.new { … }` (proc.c `rb_proc_s_new`) is the block itself: a Ruby Proc is
    // a JS function, so the block's arrow is the value.
    if (
      recvNode?.k === "const" &&
      recvNode.path.filter((x: string) => x).join("::") === "Proc" &&
      name === "new" &&
      n.args.length === 0 &&
      n.block?.k === "block"
    )
      return this.arrow(n.block.params, n.block.body, ctx);

    // ── `Object.new`: an instance of Ruby's Object. A plain JS object is a Hash
    // in trails, so it is an instance of a class named `Object`.
    if (
      recvNode?.k === "const" &&
      recvNode.path.filter((x: string) => x).join("::") === "Object" &&
      name === "new" &&
      n.args.length === 0 &&
      !n.block
    )
      return `new (class Object {})()`;

    // ── `Class.new(Super) do … end` → a class expression; the block runs as its static block.
    if (
      recvNode?.k === "const" &&
      recvNode.path.join("::") === "Class" &&
      name === "new" &&
      !this.index.resolveConst(recvNode.path, ctx.nesting)
    ) {
      const sup = n.args[0] ? this.expr(n.args[0], ctx) : null;
      const all: N[] = n.block?.k === "block" ? this.seqBody(n.block.body) : [];
      const body = all.filter((s) => s.k !== "def");
      const scope: Scope = { locals: new Set(), parent: ctx.scope };
      const inner = this.child(ctx, {
        scope,
        fnScope: scope,
        selfKind: "static",
        selfExpr: "this",
        inBlock: true,
        nested: false,
        testMode: false,
        asyncBox: { awaits: false },
      });
      const lines = this.block(body, inner, false);
      // Each `def` in the block is a member of the class expression.
      const methods = all
        .filter((s) => s.k === "def")
        .map((d) => {
          const ms: Scope = { locals: new Set(), parent: ctx.scope };
          const mctx = this.child(ctx, {
            scope: ms,
            fnScope: ms,
            selfKind: d.singleton ? "static" : "instance",
            selfExpr: "this",
            inBlock: false,
            nested: false,
            testMode: false,
            defName: d.name,
            defParams: d.params,
            asyncBox: { awaits: false },
          });
          const ps = this.paramList(d.params, mctx, false);
          const mb = this.block(this.seqBody(d.body), mctx, true);
          const asy = mctx.asyncBox!.awaits ? "async " : "";
          return `${d.singleton ? "static " : ""}${asy}${tsMethodName(d.name)}(${ps}): any {\n${indent(mb).join("\n")}\n}`;
        });
      this.stat(ctx, "class-new");
      const members = [
        ...methods,
        ...(lines.length ? [`static {\n${indent(lines).join("\n")}\n}`] : []),
      ];
      return `(class extends ${sup ?? "Object"} {\n${indent(members.join("\n").split("\n")).join("\n")}\n})`;
    }

    // ── CLAUDE.md: ActiveRecord::Promise is the native promise — Promise.new,
    // Promise::Complete.new and Promise.wrap collapse to their value.
    if (recvNode?.k === "const" && (name === "new" || name === "wrap")) {
      const fqn = this.index.resolveConst(recvNode.path, ctx.nesting)?.fqn;
      if (fqn === "ActiveRecord::Promise" || fqn === "ActiveRecord::Promise::Complete") {
        this.stat(ctx, "native-promise");
        const a = n.args.map((x: N) => this.argExpr(x, ctx));
        return name === "wrap" || fqn.endsWith("Complete")
          ? (a[0] ?? "null")
          : `Promise.resolve(${a[0] ?? "null"})`;
      }
    }

    // ── constructor
    // In a `ClassMethods` module (extended onto a class) `self` is the class.
    if (name === "new" && r === null && ctx.owner?.endsWith("::ClassMethods"))
      return `new this(${argList()})`;
    if (name === "new" && r === null)
      return ctx.selfKind === "static"
        ? `new this(${argList()})`
        : `new (this.constructor as any)(${argList()})`;
    // A dependency module ported as an object with its own `new` (Ruby `def
    // self.new`, ActiveSupport::TaggedLogging) keeps the call: `X.new(...)`.
    if (
      name === "new" &&
      r !== null &&
      recvNode?.k === "const" &&
      !this.index.resolveConst(recvNode.path, ctx.nesting) &&
      this.resolver.newables.has(recvNode.path[recvNode.path.length - 1])
    )
      return `${r}.new(${argList()})`;
    if (name === "new" && r !== null) {
      const hit =
        recvNode?.k === "const" ? this.index.resolveConst(recvNode.path, ctx.nesting) : null;
      const sc = hit?.kind === "scope" ? this.index.scopes.get(hit.fqn) : undefined;
      const coreSuper =
        sc?.superclassPath?.filter((x: string) => x).join("::") === "String" &&
        !sc.defs.has("initialize");
      if (r.includes("(") || (coreSuper && n.args.length)) return `new (${r} as any)(${argList()})`;
      const nargs = argList();
      return /^[\w$.]+$/.test(r)
        ? `new ${r}(${typedSplat(nargs, `ConstructorParameters<typeof ${r}>`)})`
        : `new ${needsParens(r) ? `(${r})` : r}(${nargs})`;
    }

    // `ActiveJob::Base.include(M)` on a gem constant is ruby-compat `include(Base, M)`.
    if (
      (name === "include" || name === "extend" || name === "prepend") &&
      recvNode?.k === "const" &&
      this.index.resolveConst(recvNode.path, ctx.nesting) &&
      n.args.length
    )
      return n.args.map((a: N) => `${rc(name)}(${r}, ${this.expr(a, ctx)})`).join(", ");

    // ── `Date.tomorrow` / `Time.current`: an ActiveSupport class-level core_ext
    // method `@blazetrails/date`'s class does not define is activesupport's flat
    // export, and a method chained on its value (`Date.tomorrow.noon`) is too.
    const asFlat = (x: N | null): string | null => {
      if (!x || x.k !== "call" || x.recv?.k !== "const") return null;
      const c = x.recv.path.filter((p: string) => p).join("::");
      if (!CORE_EXT_CALC[c]) return null;
      const ts = tsMethodName(x.name);
      if (dateStatics().has(ts)) return null;
      if (
        !calcExports(c).has(ts) &&
        !this.resolver.pkgExports("@blazetrails/activesupport").has(ts)
      )
        return null;
      return ts;
    };
    // The root `tomorrow` / `current` are time-ext's JS-`Date` helpers;
    // `Date.tomorrow`, `Time.current`, `DateTime.current` and a method chained on
    // them are their class's core_ext/<class>/calculations'.
    const flatSpec = (x: N | null, ts: string): string => {
      const c =
        x?.k === "call" && x.recv?.k === "const"
          ? x.recv.path.filter((p: string) => p).join("::")
          : "";
      return CORE_EXT_CALC[c] && calcExports(c).has(ts)
        ? `@blazetrails/activesupport/${CORE_EXT_CALC[c]}`
        : "@blazetrails/activesupport";
    };
    // `Time.current` and `DateTime.current` share a name: each is imported under
    // its class (`timeCurrent`, `dateTimeCurrent`).
    const flatImp = (x: N | null, ts: string): string => {
      const spec = flatSpec(x, ts);
      const c =
        x?.k === "call" && x.recv?.k === "const"
          ? x.recv.path.filter((p: string) => p).join("::")
          : "";
      const local =
        spec !== "@blazetrails/activesupport" && c !== "Date"
          ? `${c[0].toLowerCase()}${c.slice(1)}${ts[0].toUpperCase()}${ts.slice(1)}`
          : ts;
      return this.imp(ctx, spec, ts, local);
    };
    // `Date.today.noon`: a date-package static's value takes a core_ext method its
    // class lacks as that class's calculations function (`noon(today())`).
    if (
      recvNode?.k === "call" &&
      recvNode.recv?.k === "const" &&
      dateStatics().has(tsMethodName(recvNode.name))
    ) {
      const c = recvNode.recv.path.filter((p: string) => p).join("::");
      const ts = tsMethodName(name);
      if (CORE_EXT_CALC[c] && calcExports(c).has(ts) && !dateMembers().has(ts))
        return `${flatImp(recvNode, ts)}(${[r, ...args()].join(", ")})`;
    }
    const flatHere = asFlat(n);
    if (flatHere) {
      const fn = flatImp(n, flatHere);
      return `${fn}(${argList()})`;
    }
    if (
      recvNode &&
      asFlat(recvNode) &&
      (this.resolver.pkgExports("@blazetrails/activesupport").has(tsMethodName(name)) ||
        flatSpec(recvNode, tsMethodName(name)) !== "@blazetrails/activesupport")
    ) {
      const ts = tsMethodName(name);
      const fn = flatImp(recvNode, ts);
      return `${fn}(${[r, ...args()].join(", ")})`;
    }

    // ── An ActiveSupport core_ext method on a String / Time / Date (`now.in_time_zone`)
    // the gem does not define: trails seats it on ruby-compat's primitive method
    // tables, which `rbFSend` dispatches.
    if (
      r !== null &&
      recvNode &&
      recvNode.k !== "const" &&
      !this.index.methodNames.has(name) &&
      coreExtSends().has(tsMethodName(name)) &&
      !this.typeOf(recvNode, ctx)
    )
      return `${rc("rbFSend")}(${[r, JSON.stringify(tsMethodName(name)), ...args()].join(", ")})`;

    // ── A singleton method of Ruby's Hash (`Hash.ruby2_keywords_hash?(h)`) is
    // ruby-compat's `rbHashS<Name>[P]` (hash.c `rb_hash_s_ruby2_keywords_hash_p`).
    if (recvNode?.k === "const" && recvNode.path.filter((x: string) => x).join("::") === "Hash") {
      const base = snakeToCamel(name.replace(/[?!]$/, ""));
      const fn = `rbHashS${base[0].toUpperCase()}${base.slice(1)}${name.endsWith("?") ? "P" : ""}`;
      if (this.resolver.pkgExports("@blazetrails/ruby-compat").has(fn))
        return `${rc(fn)}(${argList()})`;
    }

    // ── ordinary dispatch
    const recv = r ?? ctx.selfExpr;
    const resolved = this.resolver.member(n, recvNode, ctx, this);
    if (resolved?.kind === "property" && n.args.length === 0 && !n.block)
      return `${recv}${nav}${resolved.name}`;
    if (
      recvNode?.k === "call" &&
      recvNode.name === "env" &&
      recvNode.recv?.k === "const" &&
      recvNode.recv.path.filter((x: string) => x).join("::") === "Rails" &&
      name.endsWith("?") &&
      n.args.length === 0
    )
      return `${recv}[${JSON.stringify(name)}]()`;
    if (recvNode?.k === "const" && recvNode.path.filter((x: string) => x).join("::") === "Rails") {
      const member = this.resolver.trailsSeat.get(propName(name));
      if (member && !member.method && n.args.length === 0 && !n.block)
        return `${recv}.${propName(name)}${member.nullable ? "!" : ""}`;
    }
    const depGetter =
      (!recvNode || recvNode.k === "self") && n.args.length === 0 && !n.block
        ? this.inheritedDepGetter(ctx.owner, name, ctx.selfKind === "static")
        : undefined;
    if (depGetter) return `${recv}${nav}${depGetter.tsName}`;
    const callee = resolved?.name ?? this.callName(name);
    if (
      this.index.classAttrPredicates.has(name) &&
      n.args.length === 0 &&
      !n.block &&
      (recvNode?.k === "const" || (recvNode?.k === "call" && recvNode.name === "class"))
    )
      return `${recv}${nav}${callee}`;
    // The gem's attr names say nothing about a dependency constant's members
    // (`I18n.locale` is a method, though the gem has `attr_accessor :locale`).
    const depConstRecv =
      recvNode?.k === "const" && !this.index.resolveConst(recvNode.path, ctx.nesting);
    if (
      !resolved &&
      n.args.length === 0 &&
      !n.block &&
      !depConstRecv &&
      this.isAttrLike(name, recvNode != null && recvNode.k !== "self")
    )
      return `${recv}${nav}${propName(name.replace(/[?!]$/, ""))}`;
    // A block passed to a gem method whose optional positionals the call skips
    // (`instrument(:enqueue, &block)` against `instrument(operation, payload = {}, &block)`):
    // each skipped slot is `undefined`, so the block lands in its own slot
    // (CLAUDE.md, "An optional positional before trailing options or a block").
    let a = argList();
    // A class method reached through an included concern's `ClassMethods`
    // (`HelloJob.queue_as`) is found the way a writer is.
    const ps =
      resolved?.params ??
      (recvNode?.k === "const" && n.block
        ? (() => {
            const own = this.writerOwner(name, recvNode, ctx);
            return (own?.defs.get(name) ?? own?.sdefs.get(name))?.params;
          })()
        : undefined);
    if (ps && n.block && !n.args.some((x: N) => x.k === "splat" || x.k === "kwargs")) {
      // Keywords are one options slot, before the block.
      const positional =
        ps.filter((p) => p.kind === "req" || p.kind === "opt").length +
        (ps.some((p) => p.kind === "key" || p.kind === "keyreq" || p.kind === "keyrest") ? 1 : 0);
      const hasRest = ps.some((p) => p.kind === "rest");
      const missing = positional - n.args.length;
      if (!hasRest && missing > 0) {
        const parts = n.args.map((x: N) => this.argExpr(x, ctx));
        parts.push(
          ...Array.from({ length: missing }, () => "undefined"),
          this.blockArg(n.block, ctx),
        );
        a = parts.join(", ");
      }
    }
    const calleeType =
      nav !== "." || !/^[\w$]+$/.test(callee)
        ? null
        : recv === "this"
          ? // `this` is a type only in an instance member; a module function's
            // `this: any` and a static's class need no cast.
            ctx.selfKind === "instance" && !ctx.thisAny
            ? `this["${callee}"]`
            : null
          : /^[\w$]+(\.[\w$]+)*$/.test(recv)
            ? `typeof ${recv}.${callee}`
            : null;
    const call = `${recv}${nav}${callee}(${calleeType ? typedSplat(a, `Parameters<${calleeType}>`) : a})`;
    // A method that yields hands back its block's value (`instrument(…) { enqueue }`),
    // so a block that became async makes the call's result a promise.
    // An untyped receiver (`queue_adapter.enqueue(self)`, `job.enqueue`) answers
    // whichever gem method has the name; any async one makes the result a promise.
    const anyAsync =
      !resolved &&
      !depConstRecv &&
      (([...this.resolver.asyncDefs].some(
        (k) => k.endsWith(`#${name}`) || k.endsWith(`.${name}`),
      ) &&
        !this.resolver.types.handDefines(callee)) ||
        // Every hand declaration of the name answers a Promise (`Relation#exists?`).
        this.resolver.types.alwaysAsync(callee));
    // A gem method handed an async block (`enqueued_jobs_with(...) do |payload|
    // … perform_now end`) awaits its `yield`s, even inside an iteration block
    // (`jobs_with`'s `select { … yield job … }`), on the next pass.
    if (resolved && n.block && /(^|, )(rbBlock\()?async (function|\()/.test(a))
      this.resolver.asyncYielders.add(name);
    // …and passes it on: `jobs_with(..., &block)` from such a method.
    if (
      resolved &&
      n.block?.k === "blockpass" &&
      ctx.defName &&
      this.resolver.asyncYielders.has(ctx.defName)
    )
      this.resolver.asyncYielders.add(name);
    if (
      anyAsync ||
      resolved?.async ||
      (resolved &&
        n.block?.k !== "blockpass" &&
        n.block &&
        /(^|, )(rbBlock\()?async (function|\()/.test(a))
    ) {
      if (ctx.asyncBox) ctx.asyncBox.awaits = true;
      return `(await ${call})`;
    }
    return call;
  }

  /**
   * RFC 0149: an option hash is bare-keyed by the camelCase spelling of the
   * Symbol's name. `h[:inverse_of]` reads `h.inverseOf` when `h` is typed as
   * an options interface that declares it, or is an untyped `options`/`opts`.
   */
  optionKey(n: N, rt: TypeRef, ctx: Ctx): string | null {
    const k = n.args?.[0];
    if (!k || k.k !== "sym" || !/^[a-z_][a-z0-9_]*$/.test(k.value)) return null;
    const camel = propName(k.value);
    if (rt?.k === "class") {
      return this.resolver.types.member(rt.key, k.value, false) ||
        this.resolver.types.cls(rt.key)?.instance[camel]
        ? camel
        : null;
    }
    const recv: N = n.recv;
    const nm =
      recv?.k === "lvar" || recv?.k === "ivar"
        ? recv.name
        : recv?.k === "call" && !recv.args?.length
          ? recv.name
          : "";
    if (OPTIONS_NAME.test(nm)) {
      this.stat(ctx, "option-key-camel");
      return camel;
    }
    return null;
  }

  // ───────────────────────────── types ─────────────────────────────

  /**
   * `if x.is_a?(K)` / `K === x`: type the local `x` as a `K` for the then-branch.
   * Returns the undo.
   */
  narrow(cond: N, ctx: Ctx): () => void {
    let local: string | undefined;
    let klass: N | undefined;
    if (
      cond.k === "call" &&
      ["is_a?", "kind_of?", "instance_of?"].includes(cond.name) &&
      cond.recv?.k === "lvar" &&
      cond.args[0]?.k === "const"
    ) {
      local = cond.recv.name;
      klass = cond.args[0];
    } else if (
      cond.k === "call" &&
      cond.name === "===" &&
      cond.recv?.k === "const" &&
      cond.args[0]?.k === "lvar"
    ) {
      local = cond.args[0].name;
      klass = cond.recv;
    }
    if (!local || !klass) return () => {};
    const t = this.typeOf(klass, ctx);
    if (t?.k !== "class" || !t.static) return () => {};
    let s: Scope | undefined = ctx.scope;
    while (s && !s.locals.has(local)) s = s.parent;
    if (!s) return () => {};
    s.types ??= new Map();
    const had = s.types.has(local);
    const prev = s.types.get(local);
    s.types.set(local, { k: "class", key: t.key });
    const scope = s;
    return () => {
      if (had) scope.types!.set(local, prev ?? null);
      else scope.types!.delete(local);
    };
  }

  /** The oracle key of the class/module whose body we are in. */
  ownerKey(ctx: Ctx): string | undefined {
    return ctx.owner ? this.resolver.oracleKey(ctx.owner) : undefined;
  }

  selfType(ctx: Ctx): TypeRef {
    if (ctx.owner && ctx.isModule && ctx.selfKind === "module") {
      const ms = this.resolver.moduleSelf(ctx.owner);
      return ms ? { k: "class", key: ms.key, static: ms.static } : null;
    }
    const k = this.ownerKey(ctx);
    return k ? { k: "class", key: k, static: ctx.selfKind === "static" } : null;
  }

  /** The oracle key of a class-typed value. */
  classKey(t: TypeRef): string | undefined {
    return t?.k === "class" ? t.key : undefined;
  }

  /** The value is a class itself (its static side). */
  isStaticClass(t: TypeRef): boolean {
    return t?.k === "class" && !!t.static;
  }

  /** The gem class a `Class.new(GemClass)` local holds. */
  gemClassFqn(t: TypeRef): string | undefined {
    return t?.k === "gemClass" ? t.fqn : undefined;
  }

  localType(ctx: Ctx, name: string): TypeRef {
    for (let s: Scope | undefined = ctx.scope; s; s = s.parent) {
      if (s.locals.has(name)) return s.types?.get(name) ?? null;
    }
    return null;
  }

  noteLocalType(ctx: Ctx, name: string, value: N): void {
    let s: Scope | undefined = ctx.scope;
    while (s && !s.locals.has(name)) s = s.parent;
    if (!s) return;
    // The most recent assignment in lowering order wins (`left = left.ast`
    // retypes `left`); branches are not merged, a deliberate approximation.
    const t = this.typeOf(value, ctx);
    s.types ??= new Map();
    s.types.set(name, t);
  }

  typeOf(n: N | null | undefined, ctx: Ctx): TypeRef {
    if (!n) return null;
    const T = this.resolver.types;
    // `Time.zone` / `Time.find_zone` answer an `ActiveSupport::TimeZone`
    // (time-zone-config.ts `zone()`), whose `name` is a property.
    if (
      n.k === "call" &&
      n.recv?.k === "const" &&
      n.recv.path.filter((x: string) => x).join("::") === "Time" &&
      ["zone", "find_zone", "find_zone!"].includes(n.name) &&
      T.cls("@activesupport/values/time-zone.ts#TimeZone")
    )
      return { k: "class", key: "@activesupport/values/time-zone.ts#TimeZone" } as TypeRef;
    // `TimeWithZone#time_zone` is an `ActiveSupport::TimeZone` (time_with_zone.rb
    // `attr_reader :time_zone`); trails widens the getter to `TimeZone | Timezone`.
    if (
      n.k === "call" &&
      n.name === "time_zone" &&
      n.args.length === 0 &&
      n.recv &&
      this.classKey(this.typeOf(n.recv, ctx)) === "@activesupport/time-with-zone.ts#TimeWithZone"
    )
      return { k: "class", key: "@activesupport/values/time-zone.ts#TimeZone" } as TypeRef;
    // `Class.new(Super)` with a gem class: a subclass of it (class-level writers resolve).
    if (
      n.k === "call" &&
      n.name === "new" &&
      n.recv?.k === "const" &&
      n.recv.path.filter((x: string) => x).join("::") === "Class" &&
      n.args[0]?.k === "const"
    ) {
      const hit = this.index.resolveConst(n.args[0].path, ctx.nesting);
      if (hit?.kind === "scope") return { k: "gemClass", fqn: hit.fqn };
    }
    switch (n.k) {
      case "self":
        return this.selfType(ctx);
      case "true":
      case "false":
        return { k: "prim", name: "boolean" };
      case "str":
      case "dstr":
      case "sym":
        return { k: "prim", name: "string" };
      case "int":
      case "float":
        return { k: "prim", name: "number" };
      case "array":
        return { k: "array", el: null };
      case "hash":
        return { k: "hash" };
      case "lasgn":
        return this.typeOf(n.value, ctx);
      case "if": {
        const a = n.then ? this.typeOf(this.seqBody(n.then).at(-1), ctx) : null;
        const b = n.else ? this.typeOf(this.seqBody(n.else).at(-1), ctx) : null;
        return a?.k === "prim" && b?.k === "prim" && a.name === b.name ? a : null;
      }
      case "ivar": {
        if (ctx.selfKind === "static") return null;
        const inferred = ctx.owner ? ctx.f.ivarTypes?.get(ctx.owner)?.get(n.name) : undefined;
        if (inferred) return inferred;
        const k = this.ownerKey(ctx);
        return k ? T.ivar(k, n.name) : null;
      }
      case "lvar":
        return this.localType(ctx, n.name);
      case "const":
        return this.resolver.constType(n.path, ctx.nesting);
      case "call": {
        const name: string = n.name;
        // `Array.wrap(x)` / `Array(x)` answer an Array; so do these Enumerable
        // calls on one, and `Hash#keys` / `#values` / `String#split`.
        if (
          (name === "wrap" &&
            n.recv?.k === "const" &&
            n.recv.path.filter((x: string) => x).join("::") === "Array") ||
          (name === "Array" && n.recv === null)
        )
          return { k: "array", el: null };
        if (
          n.recv &&
          (((name === "keys" || name === "values") && !n.args.length) || name === "split") &&
          this.typeOf(n.recv, ctx)?.k !== "gemClass" &&
          this.typeOf(n.recv, ctx)?.k !== "class"
        )
          return { k: "array", el: null };
        if (
          [
            "map",
            "collect",
            "flat_map",
            "select",
            "filter",
            "reject",
            "filter_map",
            "compact",
            "flatten",
            "uniq",
            "sort",
            "sort_by",
            "reverse",
          ].includes(name) &&
          this.typeOf(n.recv, ctx)?.k === "array"
        )
          return { k: "array", el: null };
        if (
          [
            "==",
            "!=",
            "<",
            ">",
            "<=",
            ">=",
            "!",
            "nil?",
            "is_a?",
            "kind_of?",
            "instance_of?",
            "respond_to?",
            "present?",
            "blank?",
          ].includes(name)
        )
          return { k: "prim", name: "boolean" };
        if (name === "to_s" || name === "inspect" || name === "to_str")
          return { k: "prim", name: "string" };
        // A String method on a String receiver answers what STRING_RESULT_TYPES
        // says, so a chain (`s.sub(..).insert(..)`) stays on the string path.
        if (n.recv && !name.endsWith("!")) {
          const rt = this.typeOf(n.recv, ctx);
          if (rt?.k === "prim" && rt.name === "string") {
            const res = STRING_RESULT_TYPES[tsMethodName(name)];
            if (res === "string") return { k: "prim", name: "string" };
          }
        }
        if (
          ["to_i", "to_f", "size", "length", "-@", "+@", "abs", "round", "floor", "ceil"].includes(
            name,
          )
        )
          return { k: "prim", name: "number" };
        if (name === "count" && !n.args.length && !n.block) return { k: "prim", name: "number" };
        if (!n.recv && name === "Array") return { k: "array", el: null };
        if (
          [
            "map",
            "select",
            "reject",
            "filter",
            "flat_map",
            "compact",
            "uniq",
            "to_a",
            "keys",
            "values",
            "sort",
            "sort_by",
            "split",
            "zip",
            "flatten",
          ].includes(name) &&
          n.recv
        )
          return { k: "array", el: null };
        if (["+", "-", "*", "/", "%", "**"].includes(name)) {
          const lt = this.typeOf(n.recv, ctx);
          if (lt?.k === "prim" && lt.name === "number") return lt;
          if (lt?.k === "prim" && lt.name === "string" && name === "+") return lt;
        }
        if (name === "class" && n.args.length === 0) {
          const t = !n.recv || n.recv.k === "self" ? this.selfType(ctx) : this.typeOf(n.recv, ctx);
          return t?.k === "class" && !t.static ? { k: "class", key: t.key, static: true } : null;
        }
        if (name === "new" && n.recv) {
          const t = this.typeOf(n.recv, ctx);
          return t?.k === "class" && t.static ? { k: "class", key: t.key } : null;
        }
        const rt = !n.recv || n.recv.k === "self" ? this.selfType(ctx) : this.typeOf(n.recv, ctx);
        if (rt?.k !== "class") return null;
        const m = T.member(rt.key, name, !!rt.static);
        if (m) return m.info.ret ?? null;
        for (const c of OP_SPELL[name] ?? []) {
          const om = T.member(rt.key, c, !!rt.static);
          if (om) return om.info.ret ?? null;
        }
        return null;
      }
    }
    return null;
  }

  /**
   * A call whose receiver type is known: the member is looked up in the oracle,
   * so the emitted name is the hand port's own spelling, a getter is read as a
   * property, and a Promise-returning member is awaited.
   */
  typedCall(
    n: N,
    r: string | null,
    recvNode: N | null,
    ctx: Ctx,
    argList: () => string,
    nav: string,
  ): string | null {
    const rt = !recvNode || recvNode.k === "self" ? this.selfType(ctx) : this.typeOf(recvNode, ctx);
    if (rt?.k !== "class") return null;
    const m = this.resolver.types.member(rt.key, n.name, !!rt.static);
    if (!m) return null;
    const recv = r ?? ctx.selfExpr;
    this.stat(ctx, "typed-call");
    let e: string;
    const asyncSelfDef =
      (!recvNode || recvNode.k === "self") &&
      !!ctx.owner &&
      this.index
        .ancestors(ctx.owner)
        .some((sc) =>
          this.resolver.asyncDefs.has(`${sc.fqn}${ctx.selfKind === "static" ? "." : "#"}${n.name}`),
        );
    // A hand getter that answers a Promise, where the gem defines an async `def` of
    // that name: the generated member is that def, a method.
    const asyncDefOfName =
      m.info.kind !== "method" &&
      m.info.async &&
      (this.index.methodNames.get(n.name)?.def ?? 0) > 0 &&
      [...this.resolver.asyncDefs].some(
        (k) => k.endsWith(`#${n.name}`) || k.endsWith(`.${n.name}`),
      );
    if (
      (asyncSelfDef || asyncDefOfName) &&
      m.info.kind !== "method" &&
      !n.args.length &&
      !n.block
    ) {
      if (ctx.asyncBox) ctx.asyncBox.awaits = true;
      return `(await ${recv}${nav}${m.tsName}())`;
    }
    if (m.info.kind !== "method") {
      if (n.args.length || n.block) return null;
      e = `${recv}${nav}${m.tsName}`;
    } else e = `${recv}${nav}${m.tsName}(${this.typedArgs(n, m.info.params, ctx) ?? argList()})`;
    if (m.info.async && ctx.isCtor && !ctx.inBlock) {
      // A JS constructor cannot await (plan: hard stop). Keep the call, count it.
      ctx.f.declines.push({ reason: "async-in-constructor", line: n.l, ruby: n.name });
      return e;
    }
    if (m.info.async) {
      this.stat(ctx, "await");
      if (ctx.asyncBox) ctx.asyncBox.awaits = true;
      if (ctx.inBlock) this.stat(ctx, "await-in-block");
      return `(await ${e})`;
    }
    return e;
  }

  /**
   * A typed call's positional arguments, each asserted non-null (`!`) where its
   * own type admits `null` and the callee's parameter does not: Ruby passes the
   * value unguarded, and a `nil` there raises in the callee as the JS `TypeError`
   * would. Null when the call has a splat, keywords or a block.
   */
  typedArgs(n: N, params: TypeRef[] | undefined, ctx: Ctx): string | null {
    if (
      !params ||
      n.block ||
      n.args.some(
        (a: N) =>
          a.k !== "lvar" &&
          a.k !== "ivar" &&
          a.k !== "call" &&
          a.k !== "const" &&
          ![
            "str",
            "dstr",
            "int",
            "float",
            "sym",
            "true",
            "false",
            "nil",
            "array",
            "hash",
            "self",
          ].includes(a.k),
      )
    )
      return null;
    return n.args
      .map((a: N, i: number) => {
        const e = this.argExpr(a, ctx);
        const pt = params[i];
        const at = this.typeOf(a, ctx);
        const nullable = (t: TypeRef) => !!t && "nullable" in t && !!t.nullable;
        return pt && at && !nullable(pt) && nullable(at) ? `${needsParens(e) ? `(${e})` : e}!` : e;
      })
      .join(", ");
  }

  operator(n: N, r: string, ctx: Ctx): string {
    const name = n.name;
    const a = n.args.map((x: N) => this.argExpr(x, ctx));
    const SPELL = OP_SPELL;
    const rt = this.typeOf(n.recv, ctx);
    if (rt?.k === "class" && SPELL[name]) {
      for (const c of SPELL[name]) {
        const m = this.resolver.types.member(rt.key, c, !!rt.static);
        if (m && m.info.kind === "method") {
          this.stat(ctx, "typed-operator");
          const e = `${needsParens(r) ? `(${r})` : r}.${m.tsName}(${a.join(", ")})`;
          if (m.info.async && ctx.asyncBox && !ctx.isCtor) {
            ctx.asyncBox.awaits = true;
            return `(await ${e})`;
          }
          return e;
        }
      }
    }
    if (rt?.k === "array" && name === "<<") return `${needsParens(r) ? `(${r})` : r}.push(${a[0]})`;
    const ok = this.optionKey(n, rt, ctx);
    if (ok && name === "[]") return `${needsParens(r) ? `(${r})` : r}.${ok}`;
    const rc = (x: string) => this.rc(ctx, x);
    const lhs = needsParens(r) ? `(${r})` : r;
    switch (name) {
      case "==":
        // `argument.class == String`: Ruby's class of the value (`rbObjClass`)
        // against ruby-compat's core class (`rbCString`).
        if (
          n.recv?.k === "call" &&
          n.recv.name === "class" &&
          n.recv.args.length === 0 &&
          n.recv.recv &&
          n.args[0]?.k === "const" &&
          RB_CORE_CLASSES[n.args[0].path.filter((x: string) => x).join("::")]
        )
          return `${rc("rbObjClass")}(${this.expr(n.recv.recv, ctx)}) === ${rc(RB_CORE_CLASSES[n.args[0].path.filter((x: string) => x).join("::")])}`;
        if (this.primEq(n, rt, ctx)) return `${lhs} === ${a[0]}`;
        return `${rc("rbEqual")}(${r}, ${a[0]})`;
      case "!=":
        if (this.primEq(n, rt, ctx)) return `${lhs} !== ${a[0]}`;
        return `!${rc("rbEqual")}(${r}, ${a[0]})`;
      case "!":
        return `!${this.truthy(r, true)}`;
      case "===":
        if (n.recv.k === "const") {
          const t = this.typeTest(n.recv, needsParens(a[0]) ? `(${a[0]})` : a[0], ctx);
          if (t) return `(${t})`;
        }
        return `${rc("rbEqq")}(${r}, ${a[0]})`;
      case "=~":
        // Ruby `=~` sets the backref ($~, $1…) — ruby-compat's matchOperator /
        // rbStrMatch do; `regex =~ str` is the same search with the string first.
        if (n.recv.k === "regex" || n.recv.k === "dregex")
          return `${rc("rbStrMatch")}(${a[0]}, ${r})`;
        return `${rc("matchOperator")}(${r}, ${a[0]})`;
      case "!~":
        return `!${rc("rbMatch")}(${r}, ${a[0]})`;
      case "<=>":
        return `${rc("cmp")}(${r}, ${a[0]})`;
      case "[]":
        // `IsolatedExecutionState[k]` is its `get(k)` (activesupport, the hand
        // port's `explain-registry.ts` idiom): the object has no index signature.
        if (isIsolatedExecutionState(n.recv) && a.length === 1) return `${r}.get(${a[0]})`;
        // `ENV[k]` is activesupport `getEnv(k)`, the hand port's idiom.
        if (n.recv?.k === "const" && n.recv.path.filter((x: string) => x).join("::") === "ENV")
          return `${this.as(ctx, "getEnv")}(${a[0]})`;
        // `ActiveSupport::TimeZone[name]` (time_zone.rb `self.[]`) is `TimeZone.find`.
        if (
          n.recv?.k === "const" &&
          /^(ActiveSupport::)?TimeZone$/.test(n.recv.path.filter((x: string) => x).join("::")) &&
          !this.index.resolveConst(n.recv.path, ctx.nesting)
        )
          return `${r}.find(${a[0]})`;
        if (a.length === 1 && this.mayBeMap(n.recv, ctx)) return `${rc("hashAref")}(${r}, ${a[0]})`;
        // A Range index is a slice, which JS `[]` cannot express.
        if (a.length === 1 && !a[0].startsWith("...") && n.args[0]?.k !== "range")
          return `${lhs}[${a[0]}]`;
        return `${rc("rbAref")}(${r}, ${a.join(", ")})`;
      case "<<":
        if (n.recv.k === "str" || n.recv.k === "dstr") return `(${r} + ${a[0]})`;
        // A JS string cannot be appended to in place (CLAUDE.md "Ruby Strings are JS
        // string primitives"): a local is reassigned the result, which for an
        // Array is the same receiver.
        {
          // Array#<< / Set#<< / String#<< (array.c rb_ary_push, set.rb add,
          // string.c rb_str_concat) append in place and answer the receiver; any
          // other receiver answers its own `<<` (trails spells it `append`).
          const t = this.typeOf(n.recv, ctx);
          const b = needsParens(a[0]) ? `(${a[0]})` : a[0];
          const app = (x: string) =>
            t?.k === "array"
              ? `(${x}.push(${b}), ${x})`
              : t?.k === "prim" && t.name === "string"
                ? `${x} + ${b}`
                : `(typeof ${x} === "string" ? ${x} + ${b} : Array.isArray(${x}) ? (${x}.push(${b}), ${x}) : ${x} instanceof globalThis.Set ? ${x}.add(${b}) : ${x}.append(${b}))`;
          if (n.recv.k === "lvar") return `(${r} = ${app(r)})`;
          return this.withOnce(r, app);
        }
      case "+":
      case "-":
      case "*":
      case "/":
      case "%":
      case "<":
      case ">":
      case "<=":
      case ">=":
      case "&":
      case "|":
      case "^":
      case "**":
        {
          const lt0 = this.typeOf(n.recv, ctx);
          // `String#%` is `format(self, *arg)` (string.c `rb_str_format_m`):
          // an Array argument is splatted, anything else (nil included) is the
          // one argument, which `[arg].flat(1)` gives with one evaluation.
          if (name === "%" && lt0?.k === "prim" && lt0.name === "string") {
            const argv = n.args[0]?.k === "array" ? `...${a[0]}` : `...[${a[0]}].flat(1)`;
            return `${this.rc(ctx, "format")}(${lhs}, ${argv})`;
          }
          if (lt0?.k === "prim" && (lt0.name === "number" || lt0.name === "string"))
            return `(${lhs} ${name} ${needsParens(a[0]) ? `(${a[0]})` : a[0]})`;
          // A class the hand port types answers the operator itself, under its
          // trails spelling (`TimeWithZone#+` is `plus`).
          if (lt0?.k === "class") {
            const m = this.resolver.types.member(lt0.key, name, !!lt0.static);
            if (m?.info.kind === "method") {
              const call = `${lhs}.${m.tsName}(${a[0]})`;
              if (!m.info.async) return call;
              if (ctx.asyncBox) ctx.asyncBox.awaits = true;
              return `(await ${call})`;
            }
          }
          if (lt0?.k === "array" && name === "+") {
            const rt0 = this.typeOf(n.args[0], ctx);
            if (rt0?.k === "array")
              return `[...${lhs}, ...${needsParens(a[0]) ? `(${a[0]})` : a[0]}]`;
          }
        }
        if (
          n.recv.k === "array" ||
          (["+", "-", "|", "&", "*"].includes(name) && this.mayBeArray(n.recv)) ||
          // An untyped comparison may be between Ruby Times (activejob).
          (GEM.gem === "activejob" &&
            ["<", ">", "<=", ">="].includes(name) &&
            this.mayBeArray(n.recv) &&
            this.typeOf(n.recv, ctx)?.k !== "prim")
        )
          return `${rc("rbBinop")}(${r}, ${JSON.stringify(name)}, ${a[0]})`;
        return `(${lhs} ${name} ${needsParens(a[0]) ? `(${a[0]})` : a[0]})`;
      case "<<<":
        break;
      case ">>":
        return `${rc("rbRshift")}(${r}, ${a[0]})`;
      case "-@": {
        // `-str` is String#-@ (string.c str_uminus): the deduplicated frozen string,
        // which a JS string already is.
        const rn = n.recv;
        const t = this.typeOf(rn, ctx);
        if (
          (t?.k === "prim" && t.name === "string") ||
          rn?.k === "str" ||
          rn?.k === "dstr" ||
          (rn?.k === "call" && ["join", "to_s", "inspect", "dup", "freeze"].includes(rn.name))
        )
          return r;
        return `-${lhs}`;
      }
      case "+@":
        return r;
      case "~":
        return `~${lhs}`;
    }
    return `${lhs}.${tsMethodName(name)}(${a.join(", ")})`;
  }

  mayBeArray(n: N): boolean {
    if (n.k === "int" || n.k === "float" || n.k === "str" || n.k === "dstr") return false;
    if (n.k === "call" && ["size", "length", "count", "to_i", "to_f"].includes(n.name))
      return false;
    return true;
  }

  /**
   * Ruby core methods on an unknown receiver. Native JS forms are used where
   * the call gate credits them (`enumerable-idioms.ts`), ruby-compat otherwise.
   */
  coreCall(
    n: N,
    r: string,
    recvNode: N,
    ctx: Ctx,
    args: () => string[],
    nav: string,
  ): string | null {
    const name: string = n.name;
    const rc = (x: string) => this.rc(ctx, x);
    const blk: N | null = n.block;
    const fn = () => {
      if (!blk) return null;
      if (
        SPLAT_YIELD_ONE.has(name) &&
        blk.k === "block" &&
        blk.params.length >= 2 &&
        blk.params.every((p: Param) => p.kind === "req" && p.name)
      )
        return this.arrow(
          [
            {
              kind: "req",
              name: undefined,
              destructure: blk.params.map((p: Param) => p.name!),
            } as Param,
          ],
          blk.body,
          ctx,
        );
      return this.blockArg(blk, ctx);
    };
    const R = needsParens(r) ? `(${r})` : r;
    const recvIsString = () => {
      const t = this.typeOf(recvNode, ctx);
      return t?.k === "prim" && t.name === "string";
    };
    if (this.resolver.isGemReceiver(recvNode, ctx, this)) return null;
    // A block-less `each_pair` / `each_with_index` answers an Enumerator of
    // pairs (`[key, value]`, `[element, index]`); the pairs are an array here.
    if (!blk && n.args.length === 0) {
      if (name === "each_pair") return this.entries(r, ctx, recvNode);
      if (name === "each_with_index") return `Array.from(${r}, (e: any, i: number) => [e, i])`;
    }
    // A block that awaits must run sequentially, as Ruby's iteration does: an
    // async arrow handed to Array#map would start every iteration at once.
    if (blk && ASYNC_ENUM.has(name)) {
      const f = fn()!;
      if (f.startsWith("async ")) {
        this.stat(ctx, "async-enumerable");
        if (ctx.asyncBox) ctx.asyncBox.awaits = true;
        const pairs =
          blk.k === "block" &&
          blk.params.length >= 2 &&
          blk.params.every((p: Param) => p.kind === "req" && p.name) &&
          !["each_with_index", "each_with_object", "inject", "reduce"].includes(name);
        const g = pairs
          ? this.arrow(
              [
                {
                  kind: "req",
                  name: undefined,
                  destructure: blk.params.map((p: Param) => p.name!),
                } as Param,
              ],
              blk.body,
              ctx,
            )
          : f;
        const native =
          name === "transform_values" && this.mayBeMap(recvNode, ctx)
            ? null
            : asyncEnumBody(name, n.args.length);
        if (native) {
          const extra = n.args.map((x: N) => this.argExpr(x, ctx));
          const xs =
            this.typeOf(recvNode, ctx)?.k === "array"
              ? "self"
              : "(self instanceof globalThis.Map || self instanceof globalThis.Set ? [...self] : Array.isArray(self) ? self : Object.entries((self ?? {}) as object))";
          return `(await (async (self, g${extra.map((_: string, i: number) => `, a${i}`).join("")}) => { const xs: unknown[] = ${xs}; ${native} })(${[r, g, ...extra].join(", ")}))`;
        }
        return `(await ${rc("rbAsyncEnum")}(${[r, JSON.stringify(name), ...n.args.map((x: N) => this.argExpr(x, ctx)), g].join(", ")}))`;
      }
    }
    // A splatted argument list has no fixed native form.
    if (
      n.args.some((a: N) => a.k === "splat" || a.k === "fwdargs") &&
      !["push", "unshift", "concat", "join", "split", "first", "last"].includes(name)
    )
      return null;
    // A Ruby Enumerable that is not an Array (a `Set`, a `Hash` as a `Map` or a
    // plain object) has none of the Array methods these forms use: a Set / Map is
    // spread, a plain object is its `[key, value]` pairs (`Hash#each` yields
    // them), and anything else passes through (an Array, a Relation answering
    // its own).
    // `options.except(:case_sensitive, :scope)` on an option hash: a plain
    // object keyed by camelCase names (RFC 0149), so ruby-compat's
    // `except(options, "caseSensitive", "scope")`, as the hand port writes it.
    if (
      (name === "except" || name === "slice") &&
      n.args.length &&
      n.args.every((a: N) => a.k === "sym") &&
      recvNode &&
      /options$/.test(
        recvNode.k === "call" || recvNode.k === "lvar" || recvNode.k === "ivar"
          ? String(recvNode.name).replace(/^@/, "")
          : "",
      )
    )
      return `${rc(name)}(${r}, ${n.args.map((a: N) => JSON.stringify(propName(a.value))).join(", ")})`;
    const recvType = this.typeOf(recvNode, ctx);
    const enumOf = (x: string) =>
      `${x} instanceof globalThis.Set || ${x} instanceof globalThis.Map ? [...${x}] : ` +
      `Object.getPrototypeOf(${x}) === Object.prototype ? Object.entries(${x} as object) : (${x} as unknown[])`;
    const E =
      recvType?.k === "array"
        ? R
        : /^[\w$]+(\.[\w$]+)*$/.test(r)
          ? `(${enumOf(r)})`
          : `((x) => ${enumOf("x")})(${r})`;
    switch (name) {
      case "clear":
        // Array#clear / Hash#clear (array.c rb_ary_clear, hash.c rb_hash_clear)
        // empty the receiver in place and answer it; a Map or Set has its own.
        if (n.args.length === 0 && !blk) {
          if (recvType?.k === "array") return this.withOnce(r, (x) => `(${x}.length = 0, ${x})`);
          if (recvType?.k === "hash" && !recvType.map)
            return this.withOnce(
              r,
              (x) => `(Object.keys(${x}).forEach((k) => delete ${x}[k]), ${x})`,
            );
          return this.withOnce(
            r,
            (x) => `(Array.isArray(${x}) ? (${x}.length = 0) : ${x}.clear(), ${x})`,
          );
        }
        break;
      case "grep":
        // `x.grep(C)` keeps the elements `C === e` holds for (enum.c grep_i).
        if (n.args.length === 1 && !blk && n.args[0].k === "const") {
          const t = this.typeTest(n.args[0], "e", ctx);
          if (t) return `${E}${nav}filter((e: any) => ${t})`;
        }
        break;
      case "map":
      case "collect":
        if (blk) return `${E}${nav}map(${fn()})`;
        break;
      case "flat_map":
      case "collect_concat":
        if (blk) return `${E}${nav}flatMap(${fn()})`;
        break;
      case "select":
      case "filter":
      case "find_all":
        if (blk) return `${E}${nav}filter(${fn()})`;
        break;
      case "reject":
        // Typed variadic so forwarding `...xs` into a one-parameter block type-checks.
        if (blk)
          return `${E}${nav}filter((...xs: any[]) => !${this.truthy(`((${fn()}) as (...a: any[]) => unknown)(...xs)`, true)})`;
        break;
      case "detect":
      case "find":
        if (blk && n.args.length === 0) return `${E}${nav}find(${fn()})`;
        break;
      case "any?":
      case "all?":
      case "none?":
        // `h.all? { |key, value| }`: Ruby splats each yielded pair across the
        // block's parameters (as `each` above); JS `every` passes (element, index).
        if (
          blk?.k === "block" &&
          blk.params.length >= 2 &&
          blk.params.every((p: Param) => p.kind === "req" && p.name)
        ) {
          const one: Param[] = [
            {
              kind: "req",
              name: undefined,
              destructure: blk.params.map((p: Param) => p.name!),
            } as Param,
          ];
          const m = n.name === "all?" ? "every" : "some";
          return `${n.name === "none?" ? "!" : ""}${this.entries(r, ctx, recvNode)}.${m}(${this.arrow(one, blk.body, ctx)})`;
        }
        if (n.name === "all?") {
          if (blk) return `${E}${nav}every(${fn()})`;
          break;
        }
        if (n.name === "none?") {
          if (blk) return `!${E}${nav}some(${fn()})`;
          break;
        }
        if (blk) return `${E}${nav}some(${fn()})`;
        if (n.args.length === 0) return `${E}${nav}some((x: any) => x != null && x !== false)`;
        break;
      case "each":
        // Ruby splats one yielded pair across a block's parameters (`|label, value|`),
        // and a Hash yields `[key, value]`; JS forEach would pass (element, index).
        if (
          blk?.k === "block" &&
          blk.params.length >= 2 &&
          blk.params.every((p: Param) => p.kind === "req" && p.name)
        ) {
          const one: Param[] = [
            {
              kind: "req",
              name: undefined,
              destructure: blk.params.map((p: Param) => p.name!),
            } as Param,
          ];
          return `${this.entries(r, ctx, recvNode)}.forEach(${this.arrow(one, blk.body, ctx)})`;
        }
        if (blk) return `${R}${nav}forEach(${fn()})`;
        break;
      case "each_with_index":
        if (blk) return `${R}${nav}forEach(${fn()})`;
        break;
      case "each_with_object":
        // enum.c enum_each_with_object: yields each element with the memo, answers the memo.
        if (blk && n.args.length === 1) {
          const [memo, f] = args();
          return `${this.entries(r, ctx, recvNode)}.reduce((memo: any, x: any) => ((${f})(x, memo), memo), ${memo})`;
        }
        break;
      case "inject":
      case "reduce":
        return `${rc("inject")}(${r}, ${args().join(", ")})`;
      case "include?":
      case "member?":
        if (n.args.length === 1 && !blk && hashNamed(recvNode))
          return this.hasKeyForm(recvNode, r, args()[0], ctx);
        if (n.args.length === 1 && !blk) return `${E}${nav}includes(${args()[0]})`;
        break;
      case "key?":
      case "has_key?":
        if (n.args.length === 1) return this.hasKeyForm(recvNode, r, args()[0], ctx);
        break;
      case "size":
      case "length":
        if (n.args.length === 0 && !blk && hashNamed(recvNode)) return `${rc("size")}(${r})`;
        // In a ported test an untyped receiver may be a Set (`Serializers.serializers`).
        if (
          n.args.length === 0 &&
          !blk &&
          ctx.f.rubyFile.startsWith("test/") &&
          !["array", "prim"].includes(this.typeOf(recvNode, ctx)?.k ?? "")
        )
          return this.withOnce(
            r,
            (x) =>
              `(${x} instanceof globalThis.Set || ${x} instanceof globalThis.Map ? ${x}.size : ${x}.length)`,
          );
        if (n.args.length === 0 && !blk) return `${R}${nav}length`;
        break;
      case "empty?":
        if (n.args.length === 0) return `${rc("isEmpty")}(${r})`;
        break;
      case "first":
        if (blk) break;
        // ActiveSupport String#first(limit) (core_ext/string/access.rb); an
        // Array's `first(n)` is `take(ary, n)`, ruby-compat's `first` takes none.
        if (recvIsString()) return `${this.as(ctx, "first")}(${[r, ...args()].join(", ")})`;
        if (n.args.length === 1 && this.typeOf(recvNode, ctx)?.k === "array")
          return `${rc("take")}(${r}, ${args()[0]})`;
        return `${rc("first")}(${[r, ...args()].join(", ")})`;
      case "last":
        if (blk) break;
        if (recvIsString()) return `${this.as(ctx, "last")}(${[r, ...args()].join(", ")})`;
        return `${rc("last")}(${[r, ...args()].join(", ")})`;
      case "join":
        // Array#join (array.c rb_ary_join) converts each element by its Ruby
        // `to_s` (a Hash's is `inspect`); JS join gives `[object Object]` (activejob).
        if (GEM.gem === "activejob" && nav === ".")
          return `${rc("aryJoin")}(${[r, ...args()].join(", ")})`;
        return `${R}${nav}join(${args().join(", ")})`;
      case "drop":
        if (!blk && n.args.length === 1) return `${rc("drop")}(${r} as unknown[], ${args()[0]})`;
        break;
      case "compact":
        // Hash#compact (hash.c rb_hash_compact) on a plain object is activesupport's.
        if (!blk && n.args.length === 0 && recvNode.k === "hash")
          return `${this.imp(ctx, "@blazetrails/activesupport", "compact", "hashCompact")}(${r})`;
        if (!blk && n.args.length === 0) return `${rc("compact")}(${r})`;
        break;
      case "uniq":
        if (!blk && n.args.length === 0) return `${rc("uniq")}(${r})`;
        break;
      case "flatten":
        return `${R}${nav}flat(${n.args.length ? args()[0] : "Infinity"})`;
      case "keys":
        if (n.args.length === 0) return `Object.keys(${r})`;
        break;
      case "values":
        if (n.args.length === 0) return `Object.values(${r})`;
        break;
      // The native spread / `Object.assign` copies only a plain object's own
      // keys, so an argument that may be a Map (a caller's Hash) keeps the helper.
      case "merge":
        if (!blk && n.args.length === 1 && this.plainHash(n.args[0], ctx))
          return `{ ...${R}, ...${args()[0]} }`;
        if (!blk && n.args.length === 1) return `${rc("merge")}(${r}, ${args()[0]})`;
        break;
      case "merge!":
      case "update":
        if (!blk && n.args.length === 1 && name === "merge!" && this.plainHash(n.args[0], ctx))
          return `Object.assign(${r}, ${args()[0]})`;
        if (!blk && n.args.length === 1) return `${rc("update")}(${r}, ${args()[0]})`;
        break;
      case "to_sym":
      case "to_str":
        if (n.args.length === 0) return r;
        break;
      case "to_i":
        if (n.args.length === 0) return `${rc("rbToI")}(${r})`;
        break;
      case "to_f":
        // A value with its own `to_f` (a Ruby Time) answers it; `Number(time)` is NaN.
        if (n.args.length === 0) {
          const t = this.typeOf(recvNode, ctx);
          return t?.k === "prim" ? `Number(${r})` : `${rc("toF")}(${r})`;
        }
        break;
      case "to_a":
        if (n.args.length === 0) return `${rc("rbToA")}(${r})`;
        break;
      case "to_h":
        // An Array of pairs is a plain-object Hash (CLAUDE.md "A Ruby Hash is a
        // plain object"); `toH` answers a Map-backed Hash.
        if (n.args.length === 0 && !blk && recvType?.k === "array")
          return `Object.fromEntries(${r})`;
        if (n.args.length === 0 && !blk) return `${rc("rbToH")}(${r})`;
        break;
      case "start_with?":
        return `${R}${nav}startsWith(${args().join(", ")})`;
      case "end_with?":
        return `${R}${nav}endsWith(${args().join(", ")})`;
      case "downcase":
        return `${R}${nav}toLowerCase()`;
      case "upcase":
        return `${R}${nav}toUpperCase()`;
      case "strip":
        return `${R}${nav}trim()`;
      case "split":
        return `${R}${nav}split(${args().join(", ")})`;
      case "sub":
        if (!blk) return `${R}${nav}replace(${args().join(", ")})`;
        break;
      case "gsub":
        if (!blk && n.args.length === 2) return `${rc("gsub")}(${r}, ${args().join(", ")})`;
        break;
      case "match?":
        if (n.args.length === 1 && recvNode.k === "regex") return `${R}.test(${args()[0]})`;
        return `${rc("isMatch")}(${r}, ${args().join(", ")})`;
      case "zero?":
        return `(${r} === 0)`;
      case "push":
      case "unshift":
        return `${R}${nav}${name}(${args().join(", ")})`;
      case "pop":
      case "shift":
        if (n.args.length === 0) return `${R}${nav}${name}()`;
        break;
      case "concat":
        if (n.args.length === 1) return `${R}${nav}push(...${args()[0]})`;
        break;
      case "call":
        if (
          recvNode.k === "lvar" &&
          jsIdent(recvNode.name) === ctx.blockVar &&
          ctx.asyncBox &&
          ctx.defName &&
          this.resolver.asyncYielders.has(ctx.defName)
        ) {
          ctx.asyncBox.awaits = true;
          return `(await ${R}${nav === "?." ? "?." : ""}(${args().join(", ")}))`;
        }
        if (recvNode.k !== "self") return `${R}${nav === "?." ? "?." : ""}(${args().join(", ")})`;
        break;
      case "delete":
        // `Hash#delete` / `Array#delete` answer the removed value (hash.c
        // rb_hash_delete_m, array.c rb_ary_delete): ruby-compat `hashDelete` /
        // `aryDelete`, by the receiver's type (a Hash when it is not known).
        // An untyped receiver in activejob (`queue_adapter.enqueued_jobs`) is
        // dispatched at run time by the shim's `rbDelete`.
        if (n.args.length === 1 && !blk && !recvType)
          return this.withOnce(
            r,
            (x) =>
              `(Array.isArray(${x}) ? ${rc("aryDelete")}(${x}, ${args()[0]}) : ${rc("hashDelete")}(${x}, ${args()[0]}))`,
          );
        if (n.args.length === 1 && !blk)
          return `${rc(this.typeOf(recvNode, ctx)?.k === "array" ? "aryDelete" : "hashDelete")}(${r}, ${args()[0]})`;
        break;
      case "sort_by":
        // enum.c enum_sort_by: stable, the keys compared by `<=>`.
        if (blk)
          return `[...${E}].map((x: any) => [(${fn()})(x), x]).sort((a: any, b: any) => ${rc("cmp")}(a[0], b[0]) ?? 0).map((p: any) => p[1])`;
        break;
      case "tally":
        // enum.c enum_tally: a Hash keyed by the element itself, so a Map.
        if (!blk && n.args.length === 0)
          return `${E}${nav}reduce((h: Map<any, number>, x: any) => h.set(x, (h.get(x) ?? 0) + 1), new Map())`;
        break;
      case "group_by":
        if (blk) return `${rc("groupBy")}(${r}, ${fn()})`;
        break;
      case "index_by":
        if (blk) return `${this.as(ctx, "indexBy")}(${r}, ${fn()})`;
        break;
      case "sum":
        return `${rc("sum")}(${[r, ...args()].join(", ")})`;
      case "count":
        if (n.args.length === 0 && !blk) return `${R}${nav}length`;
        // Enumerable#count with a block (enum.c count_iter_i): the elements it holds for.
        if (n.args.length === 0 && blk) {
          const f = fn();
          if (f && !f.startsWith("async ")) return `${E}${nav}filter(${f}).length`;
        }
        break;
      case "max":
      case "min":
        if (!blk && n.args.length === 0) return `${rc(name)}(${r})`;
        break;
      case "map!":
        // array.c rb_ary_collect_bang: each element replaced in place; answers the receiver.
        if (blk && !this.index.methodNames.has(name))
          return this.withOnce(
            r,
            (x) => `(${x}.splice(0, ${x}.length, ...${x}.map(${fn()})), ${x})`,
          );
        break;
      case "flatten!":
        // array.c rb_ary_flatten_bang: nil when nothing was nested.
        if (!blk && n.args.length <= 1 && !this.index.methodNames.has(name)) {
          const d = n.args.length ? args()[0] : "Infinity";
          return this.withOnce(
            r,
            (x) =>
              `(${x}.some(Array.isArray) ? (${x}.splice(0, ${x}.length, ...${x}.flat(${d})), ${x}) : null)`,
          );
        }
        break;
      case "times":
        // numeric.c int_dotimes: yields 0...n in order and answers n.
        if (blk && n.args.length === 0) {
          const f = fn()!;
          const i = blk.k === "block" && !blk.params.length ? "" : "i";
          if (f.startsWith("async ")) {
            if (ctx.asyncBox) ctx.asyncBox.awaits = true;
            return `(await (async (n: number) => { for (let i = 0; i < n; i++) await (${f})(${i}); return n; })(${r}))`;
          }
          return `((n: number) => { for (let i = 0; i < n; i++) (${f})(${i}); return n; })(${r})`;
        }
        break;
      case "with_index":
        if (this.index.methodNames.has(name)) return null;
        // `ary.map.with_index { |x, i| }` (and each / select): the JS array
        // method already passes the index, so the enumerator chain is one call.
        {
          const JS_INDEXED: Record<string, string> = {
            map: "map",
            each: "forEach",
            select: "filter",
          };
          const inner = recvNode?.k === "call" ? recvNode : null;
          if (
            blk &&
            n.args.length === 0 &&
            inner &&
            JS_INDEXED[inner.name] &&
            inner.recv &&
            !inner.block &&
            inner.args.length === 0
          ) {
            const ir = this.expr(inner.recv, ctx);
            return `${needsParens(ir) ? `(${ir})` : ir}.${JS_INDEXED[inner.name]}(${fn()})`;
          }
        }
      // fallthrough
      case "each_slice":
      case "each_index":
      case "zip":
      case "partition":
      case "min_by":
      case "max_by":
      case "transform_values":
      case "transform_keys":
      case "slice":
      case "except":
      case "dig":
      case "filter_map":
      case "each_value":
      case "each_key":
      case "each_pair":
      case "values_at":
      case "sort":
      case "reverse":
      case "intersect?":
      case "symbolize_keys":
      case "stringify_keys":
      case "deep_dup":
      case "to_set":
      case "sum_by":
      case "chars":
      case "lines":
      case "squish":
      case "underscore":
      case "camelize":
      case "classify":
      case "constantize":
      case "safe_constantize":
      case "demodulize":
      case "pluralize":
      case "singularize":
      case "humanize":
      case "foreign_key":
      case "tableize":
      case "parameterize":
      case "in?":
      case "abs":
      case "round":
      case "ceil":
      case "floor":
      case "between?":
      case "succ":
      case "upto":
      case "downto":
      case "step":
      case "ljust":
      case "rjust":
      case "center":
      case "chomp":
      case "chop":
      case "lstrip":
      case "rstrip":
      case "tr":
      case "delete_prefix":
      case "delete_suffix":
      case "unpack1":
      case "pack":
      case "bytesize":
      case "encoding":
      case "force_encoding":
      case "b":
      case "scan":
      case "positive?":
      case "negative?":
      case "odd?":
      case "even?":
      case "integer?":
      case "finite?":
      case "nan?":
      case "minmax":
      case "cycle":
      case "rotate":
      case "sample":
      case "shuffle":
      case "fill":
      case "insert":
      case "delete_at":
      case "delete_if":
      case "keep_if":
      case "select!":
      case "reject!":
      case "uniq!":
      case "compact!":
      case "sort!":
      case "reverse!":
      case "concat!":
      case "replace":
      case "invert":
      case "key":
      case "assoc":
      case "store":
      case "default":
      case "compare_by_identity":
      case "extract!":
      case "extract_options!":
      case "in_groups_of":
      case "split_at":
      case "each_char":
      case "each_line":
      case "each_byte":
      case "start":
      case "freeze!":
      case "with_object":
        if (this.index.methodNames.has(name)) return null;
        return `${rc(rbCoreFn(name))}(${[r, ...args()].join(", ")})`;
    }
    return null;
  }
}

/**
 * The body of an Enumerable method whose block awaits, run in order as Ruby's
 * iteration is (enum.c, array.c), over `xs` with the block `g`; `self` is the
 * receiver and `a0…` its arguments. `null` where the method has no native body.
 */
function asyncEnumBody(name: string, argc: number): string | null {
  const T = (v: string) => `(${v} != null && ${v} !== false)`;
  switch (argc === 0 ? name : argc === 1 ? `${name}/1` : "") {
    case "each":
    case "each_pair":
      return "for (const x of xs) await g(x); return self;";
    case "each_with_index":
      return "for (let i = 0; i < xs.length; i++) await g(xs[i], i); return self;";
    case "map":
    case "collect":
      return "const out: unknown[] = []; for (const x of xs) out.push(await g(x)); return out;";
    case "flat_map":
    case "collect_concat":
      return "const out: unknown[] = []; for (const x of xs) out.push(...[await g(x)].flat()); return out;";
    case "select":
    case "filter":
      return `const out: unknown[] = []; for (const x of xs) { const v = await g(x); if ${T("v")} out.push(x); } return out;`;
    case "reject":
      return `const out: unknown[] = []; for (const x of xs) { const v = await g(x); if (!${T("v")}) out.push(x); } return out;`;
    case "filter_map":
      return `const out: unknown[] = []; for (const x of xs) { const v = await g(x); if ${T("v")} out.push(v); } return out;`;
    case "find":
    case "detect":
      return `for (const x of xs) { const v = await g(x); if ${T("v")} return x; } return null;`;
    case "any?":
      return `for (const x of xs) { const v = await g(x); if ${T("v")} return true; } return false;`;
    case "all?":
      return `for (const x of xs) { const v = await g(x); if (!${T("v")}) return false; } return true;`;
    case "none?":
      return `for (const x of xs) { const v = await g(x); if ${T("v")} return false; } return true;`;
    case "count":
      return `let n = 0; for (const x of xs) { const v = await g(x); if ${T("v")} n++; } return n;`;
    case "each_with_object/1":
      return "for (const x of xs) await g(x, a0); return a0;";
    case "inject/1":
    case "reduce/1":
      return "let acc = a0; for (const x of xs) acc = await g(acc, x); return acc;";
    // hash.c rb_hash_transform_values on a plain-object Hash (a Map keeps the helper).
    case "transform_values":
      return "const out: Record<string, unknown> = {}; for (const [k, v] of Object.entries(self ?? {})) out[k] = await g(v); return out;";
  }
  return null;
}

/** Enumerable methods whose awaiting block is run sequentially by `rbAsyncEnum`. */
const ASYNC_ENUM = new Set(
  "map collect flat_map collect_concat each each_with_index each_with_object select filter reject find detect any? all? none? sum inject reduce each_value each_pair each_key filter_map group_by index_by sort_by count transform_values".split(
    " ",
  ),
);

const SPLAT_YIELD_ONE = new Set(
  "map collect flat_map collect_concat select filter find_all reject find detect sort_by min_by max_by group_by partition filter_map sum count".split(
    " ",
  ),
);
/** Operator → the named member spellings a typed receiver may define. */
const OP_SPELL: Record<string, string[]> = {
  "[]": ["get", "at", "fetch"],
  "[]=": ["set", "store"],
  "==": ["equals", "eq"],
  "<<": ["append", "push", "add"],
  "+": ["plus", "add"],
  "-": ["minus", "subtract"],
  "<=>": ["compareTo", "compare", "cmp"],
  "===": ["caseEq"],
};

/** ruby-compat's STRING_METHOD_TABLE keys (scripts/codegen/data/string-method-table.json). */
const STRING_TABLE = new Set<string>(
  JSON.parse(
    readFileSync(new URL("../data/string-method-table.json", import.meta.url), "utf8"),
  ) as string[],
);
/** Ruby methods only String has (so an untyped receiver of one is a String). */
/**
 * A callback macro's Symbol filter names a method, and activesupport's port
 * reads a filter as a Symbol only with its leading colon (`Symbol === filter`,
 * callbacks.rb `Filters`; packages/activesupport/src/callbacks.ts), so it is
 * spelled `":" + the TS method name`, as the hand ports do
 * (`this.beforeValidation(":setBeforeValidationMarker")`). `set_callback` /
 * `skip_callback` name the chain and kind first; their filters start at the third.
 */
function callbackFilterSymbols(n: N): N {
  if (n.recv !== null && n.recv?.k !== "self") return n;
  const name: string = n.name;
  // `Rescuable#rescue_with_handler` `instance_exec`s a `rescue_from` block
  // (activesupport/lib/active_support/rescuable.rb:117-121).
  // `ActiveSupport::Testing::SetupAndTeardown`'s `setup do … end` /
  // `teardown do … end` are callbacks run on the test (setup_and_teardown.rb:28-36).
  if ((name === "rescue_from" || name === "setup" || name === "teardown") && n.block?.k === "block")
    return { ...n, block: { ...n.block, k: "iexec" } };
  const from = /^(before|after|around)_[a-z_]+$/.test(name)
    ? 0
    : name === "set_callback" || name === "skip_callback"
      ? 2
      : -1;
  if (from < 0) return n;
  // The macro's block is `instance_exec`ed on the record / job.
  const block = n.block?.k === "block" ? { ...n.block, k: "iexec" } : n.block;
  if (!n.args.some((a: N, i: number) => i >= from && a.k === "sym")) return { ...n, block };
  return {
    ...n,
    block,
    args: n.args.map((a: N, i: number) =>
      i >= from && a.k === "sym" ? { k: "str", value: `:${tsMethodName(a.value)}`, l: a.l } : a,
    ),
  };
}

/** A constant reference to `ActiveSupport::IsolatedExecutionState`. */
function isIsolatedExecutionState(n: N | null | undefined): boolean {
  if (n?.k !== "const") return false;
  const path = (n.path as string[]).filter((x) => x);
  return path[path.length - 1] === "IsolatedExecutionState";
}

function isExecutionContext(n: N | null | undefined): boolean {
  if (n?.k !== "const") return false;
  const path = (n.path as string[]).filter((x) => x);
  return path[path.length - 1] === "ExecutionContext";
}

/**
 * What a ruby-compat `rbStrSend` call answers, by the Ruby method's documented
 * return (`vendor/ruby/v3.3.11/string.c`): `rbStrSend` is typed `unknown`, so
 * without this a chained call (`s.gsub(..).strip`) fails to type-check. A bang
 * method answers `nil` when it changed nothing.
 */
const STRING_RESULT_TYPES: Record<string, string> = {
  ...Object.fromEntries(
    [
      "uplus",
      "gsub",
      "sub",
      "append",
      "plus",
      "prepend",
      "insert",
      "downcase",
      "upcase",
      "capitalize",
      "tr",
      "strip",
      "lstrip",
      "rstrip",
      "chomp",
      "chop",
      "squeeze",
      "delete",
      "deletePrefix",
      "deleteSuffix",
      "ljust",
      "rjust",
      "center",
      "toSym",
      "reverse",
      "succ",
      "dup",
    ].map((m) => [m, "string"]),
  ),
  ...Object.fromEntries(
    [
      "gsubBang",
      "subBang",
      "trBang",
      "stripBang",
      "downcaseBang",
      "upcaseBang",
      "deletePrefixBang",
      "deleteSuffixBang",
      "squeezeBang",
      "chompBang",
    ].map((m) => [m, "string | null"]),
  ),
  get: "string",
  bytesize: "number",
  size: "number",
  count: "number",
  equals: "boolean",
  isMatch: "boolean",
  isEmpty: "boolean",
  scan: "any[]",
  bytes: "number[]",
};

const STRING_ONLY = new Set(
  "sub sub! gsub gsub! chomp chomp! chop chop! strip strip! lstrip lstrip! rstrip rstrip! squeeze squeeze! tr tr! tr_s delete_prefix delete_prefix! delete_suffix delete_suffix! upcase upcase! downcase downcase! capitalize capitalize! swapcase ljust rjust center scan unpack1 bytesize succ! each_line each_char".split(
    " ",
  ),
);
/** String methods emitted natively on a value already typed as a string. */
const NATIVE_STRING = new Set([
  "split",
  "length",
  "isStartWith",
  "isEndWith",
  "isInclude",
  "slice",
  "concat",
]);

/** Ruby attribute macros → the activesupport function the extractor credits as `fn.call(Host, "name", opts)`. */
const ATTR_MACROS: Record<string, string> = {
  class_attribute: "classAttribute",
  mattr_accessor: "mattrAccessor",
  mattr_reader: "mattrReader",
  mattr_writer: "mattrWriter",
  cattr_accessor: "cattrAccessor",
  cattr_reader: "cattrReader",
  cattr_writer: "cattrWriter",
  thread_mattr_accessor: "threadMattrAccessor",
  thread_cattr_accessor: "threadMattrAccessor",
};

function rbCoreFn(name: string): string {
  const base = name.replace(/\?$/, "").replace(/!$/, "Bang");
  const camel = snakeToCamel(base);
  const out = name.endsWith("?") ? "is" + camel[0].toUpperCase() + camel.slice(1) : camel;
  return RESERVED.has(out) ? "rb" + out[0].toUpperCase() + out.slice(1) : out;
}

/** An arrow function used as an operand needs parentheses. */
function wrapArrow(e: string): string {
  return /^(async )?\([^)]*\)(: \w+)? =>/.test(e) ? `(${e})` : e;
}

export function indent(lines: string[]): string[] {
  return lines.flatMap((l) => l.split("\n")).map((l) => (l ? "  " + l : l));
}

export function needsParens(e: string): boolean {
  return (
    !/^[\w$.]+(\([^()]*\))?$/.test(e) &&
    !/^[\w$.]+$/.test(e) &&
    !/^\(.*\)$/s.test(e) &&
    !/^".*"$/.test(e)
  );
}

function escTpl(s: string): string {
  return (
    s
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${")
      // A literal newline would take the emitter's indentation on later lines.
      .replace(/\n/g, "\\n")
  );
}

function jsFlags(f: string): string {
  return (f.includes("i") ? "i" : "") + (f.includes("m") ? "s" : "");
}

function regexLit(src: string, flags: string): string {
  let s = src
    .replace(/\\A/g, "^")
    .replace(/\\z/g, "$")
    .replace(/\\Z/g, "$")
    .replace(/\\h/g, "[0-9a-fA-F]")
    .replace(/\(\?<(\w+)>/g, "(?<$1>")
    .replace(
      /\[\[:(alpha|alnum|space|digit|upper|lower|word):\]\]/g,
      (_m, c) =>
        ({
          alpha: "[a-zA-Z]",
          alnum: "[a-zA-Z0-9]",
          space: "\\s",
          digit: "\\d",
          upper: "[A-Z]",
          lower: "[a-z]",
          word: "\\w",
        })[c as "alpha"],
    );
  if (flags.includes("x"))
    s = s
      .replace(/\\#/g, "\uE000")
      .replace(/#.*$/gm, "")
      .replace(/\s+/g, "")
      .replace(/\uE000/g, "\\#");
  s = s.replace(/\//g, "\\/").replace(/\n/g, "\\n");
  // Ruby `^`/`$` are line anchors; JS needs `m` for that.
  const f = jsFlags(flags) + (/[\^$]/.test(src.replace(/\\[Az]/g, "")) ? "m" : "");
  return `/${s}/${f}`;
}

export function propKey(k: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
}

export { lexicalChain, qualify, walk };
export type { Ctx, Scope };

/**
 * A local Rails names as a Hash (`hash`, `h`, `job_hash`): `size` / `include?`
 * read its keys (`Hash#size`, `Hash#include?` is `key?`), not an Array's.
 */
function hashNamed(n: N | null): boolean {
  return n?.k === "lvar" && /^(hash|h|\w+_hash)$/.test(n.name);
}

let dateStaticsMemo: Set<string> | undefined;
/** Static members `@blazetrails/date`'s `Date` / `Time` / `DateTime` declare. */
let dateMembersMemo: Set<string> | undefined;
/** Instance member names the `@blazetrails/date` classes define. */
function dateMembers(): Set<string> {
  if (dateMembersMemo) return dateMembersMemo;
  dateMembersMemo = new Set();
  const dir = path.join(ROOT, "packages/date/src");
  for (const f of readdirSync(dir))
    if (/\.ts$/.test(f) && !/test/.test(f))
      for (const m of readFileSync(path.join(dir, f), "utf8").matchAll(
        /^ {2}(?:async )?(?:get )?(\w+)\s*[(<]/gm,
      ))
        dateMembersMemo.add(m[1]);
  return dateMembersMemo;
}

function dateStatics(): Set<string> {
  if (dateStaticsMemo) return dateStaticsMemo;
  dateStaticsMemo = new Set();
  const dir = path.join(ROOT, "packages/date/src");
  for (const f of readdirSync(dir))
    if (/\.ts$/.test(f) && !/test/.test(f))
      for (const m of readFileSync(path.join(dir, f), "utf8").matchAll(
        /\bstatic (?:async )?(?:get )?(\w+)\s*[(<]/g,
      ))
        dateStaticsMemo.add(m[1]);
  return dateStaticsMemo;
}

const CORE_EXT_CALC: Record<string, string> = {
  Date: "core-ext/date/calculations",
  Time: "core-ext/time/calculations",
  DateTime: "core-ext/date-time/calculations",
};
const calcMemo = new Map<string, Set<string>>();
/** Names activesupport's `core-ext/<class>/calculations.ts` exports for `Date` / `Time` / `DateTime`. */
function calcExports(cls: string): Set<string> {
  let m = calcMemo.get(cls);
  if (!m) {
    m = new Set(
      [
        ...readFileSync(
          path.join(ROOT, "packages/activesupport/src", `${CORE_EXT_CALC[cls]}.ts`),
          "utf8",
        ).matchAll(/^export (?:async )?(?:function|const) (\w+)/gm),
      ].map((x) => x[1]),
    );
    calcMemo.set(cls, m);
  }
  return m;
}

function isAwaited(e: string): boolean {
  if (!e.startsWith("(await ")) return false;
  let depth = 0;
  for (let i = 0; i < e.length; i++) {
    if (e[i] === "(") depth++;
    else if (e[i] === ")" && --depth === 0) return i === e.length - 1;
  }
  return false;
}

function isBoolExpr(e: string): boolean {
  if (/^!/.test(e)) return true;
  if (!e.startsWith("(") || !e.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < e.length; i++) {
    if (e[i] === "(") depth++;
    else if (e[i] === ")" && --depth === 0 && i !== e.length - 1) return false;
  }
  const inner = e.slice(1, -1);
  let d = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
    else if (d === 0 && /^(===|!==|==|!=|<=|>=| instanceof | in )/.test(inner.slice(i)))
      return true;
  }
  return false;
}

/**
 * `...xs` alone as an argument list, typed as the callee's parameters: a Ruby
 * splat is an untyped Array, which TS spreads only into a rest parameter or as a
 * tuple. `paramsOf` is `Parameters<…>` / `ConstructorParameters<…>` of the callee.
 */
function typedSplat(args: string, paramsOf: string): string {
  if (!args.startsWith("...")) return args;
  let depth = 0;
  for (const c of args) {
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) return args;
  }
  return `...(${args.slice(3)} as ${paramsOf})`;
}

const OPTIONS_NAME = /^@?(options|opts|.*_options)$/;
