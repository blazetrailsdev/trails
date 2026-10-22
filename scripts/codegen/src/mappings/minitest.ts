/** Minitest assertions as vitest expectations (`@blazetrails/vitest-matchers` for the Ruby-semantics ones). */
import type { N } from "../ir.js";
import type { Ctx, Lowerer } from "../lower.js";
import { snakeToCamel } from "../../../parity/conventions.js";

/**
 * A minitest assertion in a ported test as the `expect` form test-compare
 * scores back to it (CONTRIBUTING.md, "Porting a Minitest assertion"): the
 * built-in matcher where it gives Ruby's answer for the value, else the
 * `@blazetrails/vitest-matchers` one. Test code calls no ruby-compat function
 * to assert. Null for a call that is not an assertion.
 */
export function assertion(lw: Lowerer, n: N, ctx: Ctx): string | null {
  const a = (i: number) => lw.expr(n.args[i], ctx);
  const blockFn = () =>
    n.block?.k === "block" ? lw.arrow([], n.block.body, lw.child(ctx, { testMode: true })) : null;
  // A value Ruby and JS agree on: `toEqual` / `toBeTruthy` give Ruby's answer.
  const plainLit = (x: N): boolean =>
    ["str", "int", "float", "sym", "true", "false", "nil"].includes(x.k) ||
    (x.k === "array" && x.elems?.every((e: N) => plainLit(e)));
  const boolTyped = (x: N) => {
    const t = lw.typeOf(x, ctx);
    return t?.k === "prim" && t.name === "boolean" && !t.nullable;
  };
  switch (n.name) {
    case "assert":
      if (n.args.length < 1) return null;
      return boolTyped(n.args[0])
        ? `expect(${a(0)}).toBeTruthy()`
        : `expect(${a(0)}).toBeRubyTruthy()`;
    case "assert_not":
    case "refute":
      if (n.args.length < 1) return null;
      return boolTyped(n.args[0])
        ? `expect(${a(0)}).toBeFalsy()`
        : `expect(${a(0)}).toBeRubyFalsy()`;
    // Minitest's `assert_equal` is Ruby's `==`: `toEqual` for a literal, and
    // `toEqualRuby` where the expected value may define its own `==` (a Hash
    // literal is `==` to a Map-backed Hash, hash.c rb_hash_equal).
    case "assert_equal":
      if (n.args.length < 2) return null;
      return plainLit(n.args[0])
        ? `expect(${a(1)}).toEqual(${a(0)})`
        : `expect(${a(1)}).toEqualRuby(${a(0)})`;
    case "assert_not_equal":
    case "refute_equal":
      return n.args.length >= 2 ? `expect(${a(1)}).not.toEqualRuby(${a(0)})` : null;
    // `assert_predicate obj, :sym?` sends the predicate (minitest assertions.rb),
    // so it is lowered as the call `obj.sym?`; a Ruby predicate may answer a value.
    case "assert_predicate":
    case "assert_not_predicate":
    case "refute_predicate": {
      if (n.args.length < 2 || n.args[1].k !== "sym") return null;
      const v = lw.expr(
        { k: "call", recv: n.args[0], name: n.args[1].value, args: [], l: n.l },
        ctx,
      );
      return `expect(${v}).${n.name === "assert_predicate" ? "toBeRubyTruthy" : "toBeRubyFalsy"}()`;
    }
    case "assert_nil":
      return n.args.length >= 1 ? `expect(${a(0)}).toBeNull()` : null;
    case "assert_not_nil":
    case "refute_nil":
      return n.args.length >= 1 ? `expect(${a(0)}).not.toBeNull()` : null;
    case "assert_same":
      return n.args.length >= 2 ? `expect(${a(1)}).toBe(${a(0)})` : null;
    case "assert_match":
      return n.args.length >= 2 ? `expect(${a(1)}).toMatch(${a(0)})` : null;
    case "assert_no_match":
      return n.args.length >= 2 ? `expect(${a(1)}).not.toMatch(${a(0)})` : null;
    // An Array includes by `==` (`toContainEqual`), a String by substring.
    case "assert_includes":
    case "assert_not_includes":
    case "refute_includes": {
      if (n.args.length < 2) return null;
      const t = lw.typeOf(n.args[0], ctx);
      const m =
        n.args[0].k === "str" || (t?.k === "prim" && t.name === "string")
          ? "toContain"
          : "toContainEqual";
      return `expect(${a(0)})${n.name === "assert_includes" ? "" : ".not"}.${m}(${a(1)})`;
    }
    // `assert_kind_of String, x`: a JS primitive is no `instanceof` its Ruby
    // class, so a core class is checked by the primitive's own type.
    case "assert_kind_of": {
      if (n.args.length < 2) return null;
      const c0 = n.args[0];
      const name =
        c0.k === "const" && c0.path.filter((x: string) => x).length === 1
          ? c0.path.filter((x: string) => x)[0]
          : null;
      switch (name) {
        case "String":
        case "Symbol":
          return `expect(typeof ${a(1)}).toBe("string")`;
        case "Integer":
          return `expect(Number.isInteger(${a(1)})).toBe(true)`;
        case "Float":
        case "Numeric":
          return `expect(typeof ${a(1)}).toBe("number")`;
        case "NilClass":
          return `expect(${a(1)}).toBeNull()`;
        case "TrueClass":
          return `expect(${a(1)}).toBe(true)`;
        case "FalseClass":
          return `expect(${a(1)}).toBe(false)`;
        // A Ruby Hash is a plain object unless it needs a Hash feature.
        case "Hash":
          return `expect(${a(1)}).toBeTypeOf("object")`;
      }
      return `expect(${a(1)}).toBeInstanceOf(${a(0)})`;
    }
    case "assert_not_instance_of":
      return n.args.length >= 2 ? `expect(${a(1)}).not.toBeExactInstanceOf(${a(0)})` : null;
    case "assert_instance_of":
      return n.args.length >= 2 ? `expect(${a(1)}).toBeExactInstanceOf(${a(0)})` : null;
    case "assert_respond_to":
      return n.args.length >= 2 ? `expect(${a(0)}).toRespondTo(${a(1)})` : null;
    case "assert_in_delta":
      return n.args.length >= 2
        ? `expect(${a(1)}).toBeWithinDelta(${a(0)}${n.args.length >= 3 ? `, ${a(2)}` : ""})`
        : null;
    case "flunk":
      return `expect.unreachable(${n.args.length ? a(0) : ""})`;
    // Minitest::Assertions#pass: an assertion that passes.
    case "pass":
      return n.args.length <= 1 ? "expect(true).toBe(true)" : null;
    case "assert_empty":
      return n.args.length >= 1 ? `expect(${a(0)}).toBeEmpty()` : null;
    case "assert_not_empty":
    case "refute_empty":
      return n.args.length >= 1 ? `expect(${a(0)}).not.toBeEmpty()` : null;
    case "assert_raises":
    case "assert_raise": {
      const f = blockFn();
      if (!f) return null;
      if (ctx.asyncBox) ctx.asyncBox.awaits = true;
      // ActiveSupport's `assertRaises` answers the raised error, as Minitest's
      // `assert_raises` does (`err = assert_raises(...) { }`).
      const classes = n.args.filter((x: N) => x.k !== "kwargs").map((x: N) => lw.expr(x, ctx));
      return `(await ${lw.imp(ctx, "@blazetrails/activesupport", "assertRaises")}([${classes.join(", ")}], {}, ${f}))`;
    }
    // `assert_difference(expression, difference = 1, message = nil, &block)` and
    // `assert_no_difference(expression, message = nil, &block)`
    // (active_support/testing/assertions.rb): a skipped optional is `undefined`.
    case "assert_difference":
    case "assert_no_difference": {
      const f = blockFn();
      if (!f || n.args.some((x: N) => x.k === "splat" || x.k === "kwargs")) return null;
      const slots = n.name === "assert_difference" ? 3 : 2;
      const given = n.args.map((x: N) => lw.argExpr(x, ctx));
      while (given.length < slots) given.push("undefined");
      if (ctx.asyncBox) ctx.asyncBox.awaits = true;
      return `(await ${lw.imp(ctx, "@blazetrails/activesupport", snakeToCamel(n.name))}(${[...given, f].join(", ")}))`;
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
          ? lw.imp(ctx, "@blazetrails/activesupport", "TopLevel")
          : lw.expr(m0, ctx);
      const rest = [lw.expr(pos[1], ctx), lw.expr(pos[2], ctx), f];
      if (kw) rest.push(lw.expr(kw, ctx));
      if (ctx.asyncBox) ctx.asyncBox.awaits = true;
      return `(await ${lw.imp(ctx, "@blazetrails/activesupport/test-case", "TestCase", "AsTestCase")}.stubConst(${mod} as any, ${rest.join(", ")}))`;
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
