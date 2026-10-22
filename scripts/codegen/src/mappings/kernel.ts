/**
 * Implicit-self calls to Kernel and Module functions (`raise`, `format`,
 * `Integer(x)`, `require`, `include M`, `define_method`): one rule per Ruby
 * name, tried by `Lowerer.callInner` (lower.ts) when the call has no receiver
 * and no gem ancestor defines the name.
 */
import type { N } from "../ir.js";
import { tsMethodName } from "../lower.js";
import { snakeToCamel } from "../../../parity/conventions.js";
import { constName, ruleTable, type CallRule } from "./call-site.js";

/**
 * Minitest's and ActiveSupport's assertion modules: flat functions in trails
 * (activesupport testing/assertions.ts), carried by the test host that stands
 * in for `ActiveSupport::TestCase`; there is no module value to include.
 */
const FLAT_ASSERTION_MODULES = new Set([
  "ActiveSupport::Testing::Assertions",
  "Minitest::Assertions",
]);

const [rules, rule] = ruleTable();

// A module or class body's `extend M` / `include M` (outside the class
// emitter's own handling) is ruby-compat's `extend(self, M)` / `include(self, M)`.
rule("extend include", (c) => {
  const { n, ctx, name } = c;
  const mod = constName(n.args[0]);
  if (name === "include" && n.args.length === 1 && mod && FLAT_ASSERTION_MODULES.has(mod)) {
    c.lw.stat(ctx, "flat-assertion-module");
    return `void "include ${mod}: the test host's"`;
  }
  if (ctx.selfKind === "static" && n.args.length)
    return n.args.map((a: N) => `${c.rc(name)}(${ctx.selfExpr}, ${c.lw.expr(a, ctx)})`).join(", ");
  return null;
});

// `delegate :m, to: :t` run as a statement with `self` a class (`included do`):
// activesupport `delegate` on the instance side, the hand port's
// `delegate.call(base.prototype, "m", { to: "class" })` (activerecord core.ts).
rule("delegate", (c) => {
  const { n, ctx } = c;
  if (ctx.selfKind !== "static" || !n.args.some((a: N) => a.k === "sym")) return null;
  const names = n.args
    .filter((a: N) => a.k === "sym")
    .map((a: N) => JSON.stringify(tsMethodName(a.value)));
  const opts = n.args.filter((a: N) => a.k !== "sym").map((a: N) => c.lw.argExpr(a, ctx));
  return `${c.lw.as(ctx, "delegate")}.call(${ctx.selfExpr}.prototype, ${[...names, ...opts].join(", ")})`;
});

// `Kernel#DelegateClass(superclass)` is ruby-compat's `DelegateClass`.
rule("DelegateClass", (c) => `${c.rc("DelegateClass")}(${c.argList()})`);
rule("raise fail", (c) => `${c.rc("rbRaise")}(${c.argList()})`);
rule("block_given?", (c) => `(${c.ctx.blockVar ?? "block"} != null)`);
// Kernel#BigDecimal(value, ndigits) (bigdecimal.c `f_BigDecimal`).
rule("BigDecimal", (c) => `new ${c.rc("BigDecimal")}(${c.argList()})`);
rule("lambda proc", (c) =>
  c.n.block?.k === "block" ? c.lw.arrow(c.n.block.params, c.n.block.body, c.ctx) : null,
);
rule("require require_relative", () => "undefined");
rule("loop", (c) =>
  c.n.block?.k === "block" ? c.lw.iife({ k: "seq", body: [c.n] }, c.ctx) : null,
);

const evalRule: CallRule = (c) => {
  const { n, ctx, name } = c;
  if (name === "class_eval" && !n.args.length && n.block?.k === "block")
    return c.lw.classEvalBlock(ctx.selfExpr, n, ctx);
  if (name === "define_method" && ctx.methodSelf && n.block?.k === "block" && n.args.length === 1)
    return `${c.rc("rbDefineMethod")}(${ctx.selfExpr}, ${c.lw.methodNameArg(n.args[0], ctx)}, ${c.lw.arrow(
      n.block.params ?? [],
      n.block.body,
      c.lw.child(ctx, {
        selfExpr: ctx.methodSelf,
        selfKind: "instance",
        methodSelf: undefined,
      }),
    )})`;
  if (
    name === "define_method" ||
    name === "instance_exec" ||
    name === "instance_eval" ||
    name === "class_eval"
  )
    return `${c.rc(snakeToCamel("rb_" + name))}(${ctx.selfExpr}, ${c.argList()})`;
  return c.lw.decline(ctx, "ruby-eval", n, name);
};
rule(
  "binding eval instance_eval class_eval module_eval instance_exec class_exec define_method",
  evalRule,
);

// Module#method_defined? on self (a class body or `class_eval` block).
rule(
  "method_defined? public_method_defined?",
  (c) =>
    `${c.rc("rbModMethodDefined")}(${[c.ctx.selfExpr, c.lw.methodNameArg(c.n.args[0], c.ctx), ...c.n.args.slice(1).map((a: N) => c.lw.expr(a, c.ctx))].join(", ")})`,
);

rule("puts warn", (c) => `console.warn(${c.argList()})`);
rule("format sprintf", (c) => `${c.rc("rbFormat")}(${c.argList()})`);
rule("Array", (c) => `${c.rc("rbFArray")}(${c.argList()})`);
rule("Integer", (c) => `${c.rc("rbInteger")}(${c.argList()})`);
rule("Float", (c) => `${c.rc("rbFloat")}(${c.argList()})`);
rule("String", (c) => `String(${c.argList()})`);
rule("freeze", (c) => c.ctx.selfExpr);

// A Symbol tag keeps its colon (`kernelThrow(":abort")`, the hand port's
// spelling, and what activesupport's callbacks catch): a catch tag is matched
// by identity, so it follows the Symbol convention.
rule("catch throw", (c) => {
  const parts = c.args();
  if (c.n.args[0]?.k === "sym") parts[0] = JSON.stringify(`:${c.n.args[0].value}`);
  return `${c.rc("rbF" + c.name[0].toUpperCase() + c.name.slice(1))}(${parts.join(", ")})`;
});

/** Kernel / Module function name → its rule (implicit self only). */
export const KERNEL_FUNCTIONS: Readonly<Record<string, CallRule>> = rules;
