/**
 * Ruby operator calls (`a == b`, `h[k]`, `s << x`, `a + b`): one rule per
 * operator, answering the TypeScript or null for the fallback, a call to the
 * operator's trails member name (`tsMethodName`). `Lowerer.operator` (lower.ts)
 * first tries a typed receiver's own member (`OP_SPELL`), then looks the
 * operator up here.
 */
import type { N } from "../ir.js";
import type { TypeRef } from "../types.js";
import { GEM } from "../gem.js";
import { isIsolatedExecutionState, needsParens, type Ctx, type Lowerer } from "../lower.js";
import { RB_CORE_CLASSES } from "./core-classes.js";

/** Operator → the named member spellings a typed receiver may define. */
export const OP_SPELL: Readonly<Record<string, string[]>> = {
  "[]": ["get", "at", "fetch"],
  "[]=": ["set", "store"],
  "==": ["equals", "eq"],
  "<<": ["append", "push", "add"],
  "+": ["plus", "add"],
  "-": ["minus", "subtract"],
  "<=>": ["compareTo", "compare", "cmp"],
  "===": ["caseEq"],
};

/** What a rule sees of the operator call it lowers. */
export interface OperatorSite {
  lw: Lowerer;
  ctx: Ctx;
  n: N;
  name: string;
  /** The receiver's expression, and the same parenthesized for a member access. */
  r: string;
  lhs: string;
  /** The lowered arguments. */
  a: string[];
  /** The receiver's type. */
  rt: TypeRef;
  /** A ruby-compat helper (`Lowerer.rc`). */
  rc(name: string): string;
}

export type OperatorRule = (o: OperatorSite) => string | null;

const constName = (n: N | null | undefined) =>
  n?.k === "const" ? n.path.filter((x: string) => x).join("::") : null;

const rules: Record<string, OperatorRule> = {};
const rule = (names: string, f: OperatorRule) => {
  for (const k of names.split(" ")) rules[k] = f;
};

rule("==", (o) => {
  const { n } = o;
  // `argument.class == String`: Ruby's class of the value (`rbObjClass`)
  // against ruby-compat's core class (`rbCString`).
  const core = RB_CORE_CLASSES[constName(n.args[0]) ?? ""];
  if (
    n.recv?.k === "call" &&
    n.recv.name === "class" &&
    n.recv.args.length === 0 &&
    n.recv.recv &&
    core
  )
    return `${o.rc("rbObjClass")}(${o.lw.expr(n.recv.recv, o.ctx)}) === ${o.rc(core)}`;
  if (o.lw.primEq(n, o.rt, o.ctx)) return `${o.lhs} === ${o.a[0]}`;
  return `${o.rc("rbEqual")}(${o.r}, ${o.a[0]})`;
});

rule("!=", (o) => {
  if (o.lw.primEq(o.n, o.rt, o.ctx)) return `${o.lhs} !== ${o.a[0]}`;
  return `!${o.rc("rbEqual")}(${o.r}, ${o.a[0]})`;
});

rule("!", (o) => `!${o.lw.truthy(o.r, true)}`);

rule("===", (o) => {
  if (o.n.recv.k === "const") {
    const t = o.lw.typeTest(o.n.recv, needsParens(o.a[0]) ? `(${o.a[0]})` : o.a[0], o.ctx);
    if (t) return `(${t})`;
  }
  return `${o.rc("rbEqq")}(${o.r}, ${o.a[0]})`;
});

// Ruby `=~` sets the backref ($~, $1…) — ruby-compat's matchOperator /
// rbStrMatch do; `regex =~ str` is the same search with the string first.
rule("=~", (o) => {
  if (o.n.recv.k === "regex" || o.n.recv.k === "dregex")
    return `${o.rc("rbStrMatch")}(${o.a[0]}, ${o.r})`;
  return `${o.rc("matchOperator")}(${o.r}, ${o.a[0]})`;
});

rule("!~", (o) => `!${o.rc("rbMatch")}(${o.r}, ${o.a[0]})`);
rule("<=>", (o) => `${o.rc("cmp")}(${o.r}, ${o.a[0]})`);

rule("[]", (o) => {
  const { n, a, r, ctx, lw } = o;
  // A gem class defining `[]` (mini_magick image/info.rb `Info#[]`) answers it.
  if ((!n.recv || n.recv.k === "self") && lw.resolver.member(n, n.recv, ctx, lw)?.kind === "method")
    return `${r}.${lw.callName("[]")}(${a.join(", ")})`;
  // `IsolatedExecutionState[k]` is its `get(k)` (activesupport, the hand
  // port's `explain-registry.ts` idiom): the object has no index signature.
  if (isIsolatedExecutionState(n.recv) && a.length === 1) return `${r}.get(${a[0]})`;
  // `ENV[k]` is activesupport `getEnv(k)`, the hand port's idiom.
  if (constName(n.recv) === "ENV") return `${lw.as(ctx, "getEnv")}(${a[0]})`;
  // `ActiveSupport::TimeZone[name]` (time_zone.rb `self.[]`) is `TimeZone.find`.
  if (
    n.recv?.k === "const" &&
    /^(ActiveSupport::)?TimeZone$/.test(constName(n.recv)) &&
    !lw.index.resolveConst(n.recv.path, ctx.nesting)
  )
    return `${r}.find(${a[0]})`;
  // `Dir[pattern]` (dir.c dir_s_aref): one pattern is `Dir.glob(pattern)`.
  if (constName(n.recv) === "Dir" && a.length === 1) return `${r}.glob(${a[0]})`;
  if (a.length === 1 && lw.mayBeMap(n.recv, ctx)) return `${o.rc("hashAref")}(${r}, ${a[0]})`;
  // A Range index is a slice, which JS `[]` cannot express.
  if (a.length === 1 && !a[0].startsWith("...") && n.args[0]?.k !== "range")
    return `${o.lhs}[${a[0]}]`;
  // `str[1..-1]` / `ary[0, 2]`: `String#[]` (string.c rb_str_aref_m) through
  // the String method table's `get`, or `Array#[]` (array.c rb_ary_aref).
  const t = lw.typeOf(n.recv, ctx);
  // `s[0..0]` / `s[1..-1]`: a String slice by a literal Range from a
  // non-negative start is `slice` (string.c rb_str_aref_m), nil only where
  // the start is past the end.
  const native = lw.nativeStrSlice(n.args[0], a.length);
  const str = (x: string) =>
    native ? native(x) : `${o.rc("rbStrSend")}(${x}, "get", ${a.join(", ")})[0]`;
  const ary = (x: string) => `${o.rc("arySlice")}(${x}, ${a.join(", ")})`;
  if (t?.k === "prim" && t.name === "string") return str(r);
  if (t?.k === "array") return ary(r);
  if (!a.some((x) => x.startsWith("...")))
    return lw.withOnce(
      r,
      (x) => `(typeof ${x} === "string" ? ${str(x)} : ${ary(`${x} as unknown[]`)})`,
    );
  return `${o.rc("rbAref")}(${r}, ${a.join(", ")})`;
});

rule("<<", (o) => {
  const { n, a, r, ctx, lw } = o;
  if (n.recv.k === "str" || n.recv.k === "dstr") return `(${r} + ${a[0]})`;
  // A gem class defining `<<` (mini_magick tool.rb:135 `Tool#<<`) answers it.
  if (lw.resolver.member(n, n.recv, ctx, lw)?.kind === "method")
    return `${needsParens(r) ? `(${r})` : r}.${lw.callName("<<")}(${a[0]})`;
  // Array#<< / Set#<< / String#<< (array.c rb_ary_push, set.rb add, string.c
  // rb_str_concat) append in place and answer the receiver; any other receiver
  // answers its own `<<` (trails spells it `append`). A JS string cannot be
  // appended to in place (CLAUDE.md "Ruby Strings are JS string primitives").
  const t = lw.typeOf(n.recv, ctx);
  const b = needsParens(a[0]) ? `(${a[0]})` : a[0];
  const app = (x: string) =>
    t?.k === "array"
      ? `(${x}.push(${b}), ${x})`
      : t?.k === "prim" && t.name === "string"
        ? `${x} + ${b}`
        : `(typeof ${x} === "string" ? ${x} + ${b} : Array.isArray(${x}) ? (${x}.push(${b}), ${x}) : ${x} instanceof globalThis.Set ? ${x}.add(${b}) : ${x}.append(${b}))`;
  // A local known to hold a String is reassigned the result; one of unknown
  // type (a yielded `Tool`) is not, as nothing would read it.
  if (n.recv.k === "lvar" && t?.k === "prim" && t.name === "string") return `(${r} = ${app(r)})`;
  // An ivar holding a String (builder xmlmarkup.rb's `@target << text`) is
  // written back in the String arm only: another receiver's `<<` answers what
  // it likes, which must not replace the ivar.
  if (n.recv.k === "ivar") {
    if (t?.k === "prim" && t.name === "string") return `(${r} = ${r} + ${b})`;
    if (!t)
      return `(typeof ${r} === "string" ? (${r} = ${r} + ${b}) : Array.isArray(${r}) ? (${r}.push(${b}), ${r}) : ${r} instanceof globalThis.Set ? ${r}.add(${b}) : ${r}.append(${b}))`;
  }
  return lw.withOnce(r, app);
});

rule("+ - * / % < > <= >= & | ^ **", (o) => {
  const { n, a, r, ctx, lw, name, lhs } = o;
  const lt0 = lw.typeOf(n.recv, ctx);
  // `String#%` is `format(self, *arg)` (string.c `rb_str_format_m`): an Array
  // argument is splatted, anything else (nil included) is the one argument,
  // which `[arg].flat(1)` gives with one evaluation.
  if (name === "%" && lt0?.k === "prim" && lt0.name === "string") {
    const argv = n.args[0]?.k === "array" ? `...${a[0]}` : `...[${a[0]}].flat(1)`;
    return `${lw.rc(ctx, "format")}(${lhs}, ${argv})`;
  }
  if (lt0?.k === "prim" && (lt0.name === "number" || lt0.name === "string"))
    return `(${lhs} ${name} ${needsParens(a[0]) ? `(${a[0]})` : a[0]})`;
  // A class the hand port types answers the operator itself, under its trails
  // spelling (`TimeWithZone#+` is `plus`).
  if (lt0?.k === "class") {
    const m = lw.resolver.types.member(lt0.key, name, !!lt0.static);
    if (m?.info.kind === "method") {
      const call = `${lhs}.${m.tsName}(${a[0]})`;
      if (!m.info.async) return call;
      if (ctx.asyncBox) ctx.asyncBox.awaits = true;
      return `(await ${call})`;
    }
  }
  if (lt0?.k === "array" && name === "+") {
    const rt0 = lw.typeOf(n.args[0], ctx);
    if (rt0?.k === "array") return `[...${lhs}, ...${needsParens(a[0]) ? `(${a[0]})` : a[0]}]`;
  }
  if (
    n.recv.k === "array" ||
    (["+", "-", "|", "&", "*"].includes(name) && lw.mayBeArray(n.recv)) ||
    // An untyped comparison may be between Ruby Times (activejob).
    (GEM.gem === "activejob" &&
      ["<", ">", "<=", ">="].includes(name) &&
      lw.mayBeArray(n.recv) &&
      lw.typeOf(n.recv, ctx)?.k !== "prim")
  )
    return `${o.rc("rbBinop")}(${r}, ${JSON.stringify(name)}, ${a[0]})`;
  return `(${lhs} ${name} ${needsParens(a[0]) ? `(${a[0]})` : a[0]})`;
});

rule(">>", (o) => `${o.rc("rbRshift")}(${o.r}, ${o.a[0]})`);

// `-str` is String#-@ (string.c str_uminus): the deduplicated frozen string,
// which a JS string already is.
rule("-@", (o) => {
  const rn = o.n.recv;
  const t = o.lw.typeOf(rn, o.ctx);
  if (
    (t?.k === "prim" && t.name === "string") ||
    rn?.k === "str" ||
    rn?.k === "dstr" ||
    (rn?.k === "call" && ["join", "to_s", "inspect", "dup", "freeze"].includes(rn.name))
  )
    return o.r;
  return `-${o.lhs}`;
});

rule("+@", (o) => o.r);
rule("~", (o) => `~${o.lhs}`);

/** Ruby operator → its rule. */
export const OPERATORS: Readonly<Record<string, OperatorRule>> = rules;
