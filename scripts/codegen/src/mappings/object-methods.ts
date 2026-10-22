/**
 * Ruby `Object` / `Kernel` / ActiveSupport methods every value answers
 * (`dup`, `send`, `is_a?`, `try`, `tap`, `to_s`, `3.seconds`): one rule per
 * Ruby name, tried by `Lowerer.callInner` (lower.ts) on any receiver, implicit
 * self included, before gem dispatch.
 */
import type { N, Param } from "../ir.js";
import { GEM } from "../gem.js";
import { indent, jsIdent, tsMethodName, type Scope } from "../lower.js";
import { ruleTable, type CallRule } from "./call-site.js";

const [rules, rule] = ruleTable();
const argc = (n: N) => n.args.length;

// ActiveSupport `Object#try` / `try!` (core_ext/object/try.rb): activesupport
// `tryCall(x, "m", …)` / `tryBang`, the method name as its TS spelling (the
// hand port's `tryCall(scope, "proxyAssociation")`); a block form is `tryWith`.
rule("try try!", (c) => {
  const { n, r, ctx, name, lw } = c;
  if (r === null || lw.index.methodNames.has(name)) return null;
  if (n.args[0]?.k === "sym") {
    const rest = n.args.slice(1).map((x: N) => lw.argExpr(x, ctx));
    const fn = lw.as(ctx, name === "try" ? "tryCall" : "tryBang");
    return `${fn}(${[r, JSON.stringify(tsMethodName(n.args[0].value)), ...rest].join(", ")})`;
  }
  if (name === "try" && argc(n) === 0 && n.block)
    return `${lw.as(ctx, "tryWith")}(${r}, ${lw.blockArg(n.block, ctx)})`;
  return null;
});

// `Module#const_get` / `const_defined?` / `const_set` (object.c
// rb_mod_const_get …) are ruby-compat's, with the module as first argument.
const CONST_FNS: Record<string, string> = {
  const_get: "rbModConstGet",
  "const_defined?": "rbModConstDefined",
  const_set: "rbModConstSet",
};
rule("const_get const_defined? const_set", (c) =>
  c.lw.index.methodNames.has(c.name)
    ? null
    : `${c.rc(CONST_FNS[c.name])}(${[c.R, ...c.args()].join(", ")})`,
);

// A Ruby Symbol is a JS string (CLAUDE.md), so `to_sym` on a String or Symbol
// is the value itself, whatever the receiver's static type, unless the gem
// defines its own `to_sym`.
rule("to_sym", (c) => {
  const { n, r, ctx } = c;
  if (r === null || argc(n) !== 0 || n.block || c.lw.index.methodNames.has("to_sym")) return null;
  return ctx.f.symbolColon ? `${c.rc("stringToSym")}(${r})` : r;
});

rule("nil?", (c) => `(${c.R} == null)`);

rule("is_a? kind_of? instance_of?", (c) => {
  if (argc(c.n) === 1 && c.n.args[0].k === "const")
    return `(${c.lw.typeTest(c.n.args[0], c.R, c.ctx)})`;
  return `${c.rc("rbObjIsKindOf")}(${c.R}, ${c.argList()})`;
});

rule("respond_to?", (c) => {
  const { n, R, ctx, lw } = c;
  const rest = () => n.args.slice(1).map((x: N) => lw.argExpr(x, ctx));
  // The name asked about is the TS member's (`:permitted?` is `isPermitted`).
  if (n.args[0]?.k === "sym")
    return `${c.rc("rbObjRespondTo")}(${[R, JSON.stringify(tsMethodName(n.args[0].value)), ...rest()].join(", ")})`;
  // A Ruby method name known only at run time (`QUEUE_ADAPTER_METHODS`'s
  // `:enqueue_at`) is translated to the TS member name when asked.
  // docs/ruby-ts-conventions.md: snake_case is camelCase, `x?` is `isX`.
  const tsName = `((s: string) => { const c = s.replace(/[?!]$/, "").replace(/_([a-z0-9])/g, (_m: string, x: string) => x.toUpperCase()); return s.endsWith("?") ? "is" + c[0].toUpperCase() + c.slice(1) : c; })(String(${lw.argExpr(n.args[0], ctx)}))`;
  return `${c.rc("rbObjRespondTo")}(${[R, tsName, ...rest()].join(", ")})`;
});

// Class#descendants / #subclasses (core_ext/class/subclasses.rb) are
// activesupport's DescendantsTracker functions on a constant receiver.
rule("descendants subclasses", (c) =>
  argc(c.n) === 0 && c.recvNode?.k === "const" && GEM.gem === "activejob"
    ? `${c.lw.as(c.ctx, c.name)}(${c.R})`
    : null,
);

// Object#acts_like? (core_ext/object/acts_like.rb), on any receiver nil included.
rule("acts_like?", (c) =>
  argc(c.n) === 1
    ? `${c.lw.as(c.ctx, "actsLike")}.call(${c.R}, ${c.lw.argExpr(c.n.args[0], c.ctx)})`
    : null,
);

rule("present?", (c) => `${c.lw.as(c.ctx, "isPresent")}(${c.R})`);
rule("blank?", (c) => `${c.lw.as(c.ctx, "isBlank")}(${c.R})`);
rule("presence", (c) => `${c.lw.as(c.ctx, "presence")}(${c.R})`);
rule("dup", (c) => `${c.rc("rbObjDup")}(${c.R})`);
rule("clone", (c) => `${c.rc("rbObjClone")}(${c.R})`);

rule("send __send__", (c) => {
  const { n, R, ctx, lw } = c;
  // A literal name is the TS member's (`:deserialize_arguments_if_needed` is
  // `deserializeArgumentsIfNeeded`), awaited when a gem def of it is async.
  if (n.args[0]?.k === "sym") {
    const sym: string = n.args[0].value;
    const call = `${c.rc("rbFSend")}(${[R, JSON.stringify(tsMethodName(sym)), ...n.args.slice(1).map((x: N) => lw.argExpr(x, ctx))].join(", ")})`;
    if ([...lw.resolver.asyncDefs].some((k) => k.endsWith(`#${sym}`))) {
      if (ctx.asyncBox) ctx.asyncBox.awaits = true;
      return `(await ${call})`;
    }
    return call;
  }
  // `MAGIC.send(method) { … }` where `method` is a parameter every call of this
  // method passes a literal Symbol (`magic_match(io, :find)` / `(io, :select)`,
  // magic.rb:87, :94): the call each one names.
  if (n.args[0]?.k === "lvar" && ctx.defName) {
    const i = (ctx.defParams ?? []).findIndex((p) => p.name === n.args[0].name);
    const syms = i >= 0 ? lw.posSyms.get(ctx.defName)?.get(i) : null;
    if (syms && syms.size >= 1 && syms.size <= 3) {
      const v = lw.expr(n.args[0], ctx);
      const arms = [...syms].map((sym) => ({
        sym,
        code: lw.expr({ ...n, name: sym, args: n.args.slice(1) }, ctx),
      }));
      return arms
        .slice(0, -1)
        .reduceRight(
          (acc, a) => `${v} === ${JSON.stringify(a.sym)} ? ${a.code} : ${acc}`,
          arms.at(-1)!.code,
        );
    }
  }
  // `MAGIC.send(method) { |type, matches| … }` (marcel magic.rb:131): an Array
  // iterator yields one element, which a block of several parameters splats
  // (vm_callee_setup_block_arg); JS's `find` / `select` pass (element, index, array).
  if (
    n.block?.k === "block" &&
    n.block.params.length >= 2 &&
    n.block.params.every((p: Param) => p.kind === "req" && p.name)
  ) {
    const plain = n.args.map((x: N) => lw.argExpr(x, ctx));
    const f = lw.blockArg(n.block, ctx);
    return `${c.rc("rbFSend")}(${[R, ...plain, `(x: unknown) => (${f})(...(Array.isArray(x) ? x : [x]))`].join(", ")})`;
  }
  return `${c.rc("rbFSend")}(${R}, ${c.argList()})`;
});

// Ruby `Range#cover?` is ruby-compat Range's `cover`.
rule("cover?", (c) =>
  argc(c.n) === 1 ? `${c.R}${c.nav}cover(${c.lw.argExpr(c.n.args[0], c.ctx)})` : null,
);

rule("public_send", (c) => `${c.rc("rbFPublicSend")}(${c.R}, ${c.argList()})`);

rule("class", (c) => {
  const { n, ctx, recvNode, lw, R } = c;
  if (argc(n) !== 0) return null;
  const own =
    (!recvNode || recvNode.k === "self") && ctx.selfKind === "instance" && ctx.owner
      ? lw.resolver.exportNames.get(ctx.owner)
      : undefined;
  // `self.class` is ruby-compat's `rbObjClass` (the hand port's spelling,
  // activejob core.ts), typed as the class it is written in.
  if (own && lw.index.scopes.get(ctx.owner!)?.kind === "class") {
    const ref = lw.resolver.fqnRef(ctx.owner!, ctx, lw);
    return `(${c.rc("rbObjClass")}(${R}) as unknown as typeof ${ref})`;
  }
  return `${c.rc("rbObjClass")}(${R})`;
});

rule("freeze", (c) => {
  if (argc(c.n) !== 0) return null;
  return c.recvNode?.k === "str" || c.recvNode?.k === "dstr" ? c.R : `Object.freeze(${c.R})`;
});

rule("frozen?", (c) => `Object.isFrozen(${c.R})`);

rule("tap", (c) => {
  const { n, ctx, lw, R } = c;
  if (n.block?.k !== "block") return null;
  const p = n.block.params[0]?.name ?? "_";
  const scope: Scope = { locals: new Set([p]), parent: ctx.scope };
  const inner = lw.child(ctx, {
    scope,
    fnScope: scope,
    inBlock: true,
    nested: false,
    asyncBox: { awaits: false },
  });
  const body = lw.block(lw.seqBody(n.block.body), inner, false);
  const hz: Set<string> | undefined = scope.hoisted;
  if (hz?.size) body.unshift(`let ${[...hz].map((h) => `${jsIdent(h)}: any`).join(", ")};`);
  const asy = inner.asyncBox!.awaits;
  if (asy && ctx.asyncBox) ctx.asyncBox.awaits = true;
  const fn = `(${asy ? "async " : ""}(${jsIdent(p)}) => {\n${indent([...body, `return ${jsIdent(p)};`]).join("\n")}\n})(${R})`;
  return asy ? `(await ${fn})` : fn;
});

rule("then yield_self", (c) =>
  c.n.block?.k === "block"
    ? `(${c.lw.arrow(c.n.block.params, c.n.block.body, c.ctx)})(${c.R})`
    : null,
);

rule("instance_variable_get", (c) => `${c.rc("rbIvarGet")}(${c.R}, ${c.argList()})`);
rule("instance_variable_set", (c) => `${c.rc("rbIvarSet")}(${c.R}, ${c.argList()})`);
rule("instance_variable_defined?", (c) => `${c.rc("rbIvarDefined")}(${c.R}, ${c.argList()})`);
rule("singleton_class", (c) => `(${c.rc("rbObjSingletonClass")}(${c.R}) as any)`);

// `Module#ancestors` on a class: ruby-compat walks the prototype chain and the
// modules `include` spliced into it.
rule("ancestors", (c) =>
  argc(c.n) === 0 && !c.lw.index.methodNames.has("ancestors")
    ? `${c.rc("rbModAncestors")}(${c.R})`
    : null,
);

// `klass.singleton_class.public_instance_methods(false)`: a JS class's
// singleton class is its own statics (CLAUDE.md "singleton_class is a
// per-object subclass"), so the class's own public static names, in Ruby
// spelling for an `include?(:_queue_adapter)` test. A class_attribute written
// on the class (its own `__class_attr_<name>` storage, class_attribute.ts) is
// the singleton reader Ruby's setter defines.
rule("public_instance_methods", (c) => {
  const { n, lw, ctx } = c;
  if (
    n.recv?.k === "call" &&
    n.recv.name === "singleton_class" &&
    n.recv.args.length === 0 &&
    argc(n) === 1 &&
    n.args[0].k === "false"
  )
    return `Object.getOwnPropertyNames(${lw.expr(n.recv.recv, ctx)}).filter((n) => !["length", "name", "prototype"].includes(n)).map((n) => n.replace(/^__class_attr_/, "")).map((n) => ((u: string) => (n.startsWith("_") && !u.startsWith("_") ? "_" + u : u))(${lw.as(ctx, "underscore")}(n)))`;
  return null;
});

// `3.seconds` on a numeric literal: activesupport's `Numeric#seconds`
// (core_ext/numeric/time.rb) is `ActiveSupport::Duration.seconds(self)`.
rule(
  "month months year years second seconds minute minutes hour hours day days week weeks fortnight fortnights",
  (c) => {
    const { n, name, r, lw, ctx, recvNode } = c;
    if (argc(n) === 0 && (n.recv?.k === "int" || n.recv?.k === "float")) {
      const unit = name.endsWith("s") ? name : name + "s";
      return `${lw.imp(ctx, "@blazetrails/activesupport", "Duration")}.${unit}(${lw.expr(n.recv, ctx)})`;
    }
    // On a value that may be an Integer or a Duration (`options[:wait].seconds`):
    // Duration's `method_missing` reaches the Integer's (duration.rb), so either
    // way it is a Duration of that many units. Plural units only: a singular
    // `second` / `day` on an untyped value is as likely `Array#second`
    // (core_ext/array/access.rb).
    if (
      argc(n) === 0 &&
      r !== null &&
      name.endsWith("s") &&
      !lw.index.methodNames.has(name) &&
      !lw.typeOf(recvNode, ctx)
    ) {
      const unit = name.endsWith("s") ? name : name + "s";
      const D = lw.as(ctx, "Duration");
      return `${D}.${unit}(${lw.withOnce(r, (x) => `(${x} instanceof ${D} ? ${x}.value : ${x})`)})`;
    }
    return null;
  },
);

// `"59.123456789".to_r` on a decimal literal: the Rational String#to_r
// (rational.c `string_to_r`) answers, folded to its numerator and denominator.
rule("to_r", (c) => {
  const { n } = c;
  if (argc(n) !== 0 || n.recv?.k !== "str" || !/^-?\d+(\.\d+)?$/.test(n.recv.value)) return null;
  const [i, fr = ""] = n.recv.value.split(".");
  return `${c.rc("rational")}(${BigInt(i + fr)}n, ${10n ** BigInt(fr.length)}n)`;
});

// `Hash#values_at` (hash.c rb_hash_values_at) on a hash value: ruby-compat's.
rule("values_at", (c) =>
  c.r !== null && !c.lw.index.methodNames.has(c.name)
    ? `${c.rc("valuesAt")}(${[c.R, ...c.args()].join(", ")})`
    : null,
);

// `Hash#with_indifferent_access` (core_ext/hash/indifferent_access.rb) is
// activesupport's flat `withIndifferentAccess(hash)`.
rule("with_indifferent_access", (c) =>
  argc(c.n) === 0 && c.r !== null && !c.lw.index.methodNames.has(c.name)
    ? `${c.lw.imp(c.ctx, "@blazetrails/activesupport", "withIndifferentAccess")}(${c.R})`
    : null,
);

// `Integer#ordinalize` / `#ordinal` (core_ext/integer/inflections.rb) are
// `ActiveSupport::Inflector.ordinalize(self)`: activesupport's flat export.
rule("ordinalize ordinal", (c) =>
  argc(c.n) === 0 && c.r !== null && !c.lw.index.methodNames.has(c.name)
    ? `${c.lw.imp(c.ctx, "@blazetrails/activesupport", c.name)}(${c.R})`
    : null,
);

// `Numeric#div` (numeric.c `num_div`) is the floored quotient.
rule("div", (c) =>
  argc(c.n) === 1 && !c.lw.index.methodNames.has("div")
    ? `Math.floor(${c.R} / ${c.argList()})`
    : null,
);

// Ruby `Exception#backtrace` / `#set_backtrace` are ruby-compat's
// `excBacktrace` / `excSetBacktrace` (error.c `exc_backtrace`).
rule("backtrace", (c) => (argc(c.n) === 0 ? `${c.rc("excBacktrace")}(${c.R})` : null));
rule("set_backtrace", (c) =>
  argc(c.n) === 1 ? `${c.rc("excSetBacktrace")}(${c.R}, ${c.argList()})` : null,
);

rule("equal?", (c) => `(${c.R} === ${c.argList()})`);
rule("hash", (c) => (argc(c.n) === 0 ? `${c.rc("rbHash")}(${c.R})` : null));
rule("eql?", (c) => `${c.rc("rbEql")}(${c.R}, ${c.argList()})`);
rule("inspect", (c) => `${c.rc("rbInspect")}(${c.R})`);

rule("to_s", (c) => {
  const { n, ctx, R, r, lw, recvNode } = c;
  if (argc(n) !== 0) return null;
  // `Symbol#to_s` drops the colon (`rb_sym2str`) where the file keeps it.
  if (ctx.f.symbolColon) {
    const v = /^[A-Za-z_$][\w$]*$/.test(R) ? R : null;
    const body = (x: string) =>
      `${c.rc("isSymbol")}(${x}) ? ${c.rc("symbolToS")}(${x}) : ${c.rc("rbObjAsString")}(${x})`;
    return v ? `(${body(v)})` : `((v) => ${body("v")})(${R})`;
  }
  // A value known not to be nil, a String / Number / Boolean, is JS `String(x)`.
  const t = lw.typeOf(recvNode, ctx);
  if (t?.k === "prim" && t.name !== "null" && !t.nullable) return `String(${r})`;
  return `${c.rc("rbObjAsString")}(${R})`;
});

rule("fetch", (c) => (c.r !== null ? `${c.rc("fetch")}(${c.R}, ${c.argList()})` : null));

/** Ruby method every object answers → its rule. */
export const OBJECT_METHODS: Readonly<Record<string, CallRule>> = rules;
