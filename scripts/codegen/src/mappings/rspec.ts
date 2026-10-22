/** RSpec expectations and rspec-mocks as vitest (`@blazetrails/vitest-matchers` for the matchers vitest lacks). */
import type { N } from "../ir.js";
import type { Ctx, Lowerer } from "../lower.js";

/**
 * RSpec's `expect(x).to matcher`, `expect { … }.to raise_error(…)`, and the
 * rspec-mocks `allow(o).to receive(:m)…` / `expect(o).to receive(:m)…`, as
 * vitest. Null for any other call.
 */
export function rspec(lw: Lowerer, n: N, ctx: Ctx): string | null {
  if (!["to", "not_to", "to_not"].includes(n.name) || n.recv?.k !== "call") return null;
  const neg = n.name !== "to";
  const target: N = n.recv;
  const matcher: N | undefined = n.args[0];
  if (!matcher || matcher.k !== "call") return null;
  const vi = () => lw.imp(ctx, "vitest", "vi");
  const expectFn = () => lw.imp(ctx, "vitest", "expect");
  // rspec-mocks: `allow(o)` / `allow_any_instance_of(K)` / `expect(o)` `.to receive(:m)…`.
  const chain: N[] = [];
  for (let m: N = matcher; m?.k === "call"; m = m.recv) chain.unshift(m);
  if (chain[0]?.name === "receive" && chain[0].recv === null && chain[0].args[0]?.k === "sym") {
    if (
      !["allow", "allow_any_instance_of", "expect", "expect_any_instance_of"].includes(target.name)
    )
      return null;
    const anyInstance = target.name.endsWith("_any_instance_of");
    const obj = lw.expr(target.args[0], ctx);
    const owner = anyInstance ? `${obj}.prototype` : obj;
    let spy = `${vi()}.spyOn(${owner}, ${JSON.stringify(lw.callName(chain[0].args[0].value))})`;
    let withArgs: string | null = null;
    for (const c of chain.slice(1)) {
      const a = c.args.map((x: N) => lw.expr(x, ctx));
      if (c.name === "and_return")
        spy =
          a.length <= 1
            ? `${spy}.mockReturnValue(${a[0] ?? "undefined"})`
            : `${spy}${a.map((v: string) => `.mockReturnValueOnce(${v})`).join("")}`;
      else if (c.name === "and_call_original") void 0;
      else if (c.name === "and_raise") spy = `${spy}.mockImplementation(() => { throw ${a[0]}; })`;
      else if (c.name === "and_yield")
        spy = `${spy}.mockImplementation((...args: unknown[]) => (args.at(-1) as (...a: unknown[]) => unknown)(${a.join(", ")}))`;
      else if (c.name === "with") withArgs = a.join(", ");
      else return lw.decline(ctx, "unhandled-node", n, `rspec-mocks ${c.name}`);
    }
    if (target.name.startsWith("allow")) return spy;
    // A message expectation is checked when the example ends.
    const v = lw.tmp(ctx, "spy");
    (ctx.testTail ??= []).push(
      `${expectFn()}(${v})${neg ? ".not" : ""}.${withArgs !== null ? `toHaveBeenCalledWith(${withArgs})` : "toHaveBeenCalled()"};`,
    );
    return `const ${v} = ${spy}`;
  }
  if (target.name !== "expect" || target.recv !== null) return null;
  const ex = expectFn();
  const not = neg ? ".not" : "";
  const ma = (i: number) => lw.expr(matcher.args[i], ctx);
  // `expect { … }`: the block, run once.
  if (target.block?.k === "block" && !target.args.length) {
    const f = lw.arrow(
      target.block.params ?? [],
      target.block.body,
      lw.child(ctx, { testMode: true }),
    );
    const run = `(${f.startsWith("async") ? f : `async ${f}`})()`;
    if (ctx.asyncBox) ctx.asyncBox.awaits = true;
    if (matcher.name === "raise_error" || matcher.name === "raise_exception") {
      if (neg) return `await ${run}`;
      const [k, msg] = matcher.args;
      if (!k) return `await ${ex}(${run}).rejects.toThrow()`;
      if (k.k === "str" || k.k === "regex") return `await ${ex}(${run}).rejects.toThrow(${ma(0)})`;
      if (!msg) return `await ${ex}(${run}).rejects.toBeInstanceOf(${ma(0)})`;
      const m = lw.expr(msg, ctx);
      const check = msg.k === "regex" ? `${m}.test(e.message)` : `e.message === ${m}`;
      return `await ${ex}(${run}).rejects.toSatisfy((e: Error) => e instanceof ${ma(0)} && ${check})`;
    }
    const blockMatcher = rspecBlockMatcher(lw, matcher, target, ctx, ex, not);
    if (blockMatcher) return blockMatcher;
    return lw.decline(ctx, "unhandled-node", n, `rspec block matcher ${matcher.name}`);
  }
  if (target.args.length !== 1) return null;
  const actual = lw.expr(target.args[0], ctx);
  const one = (m: N, act: string): string | null => {
    const arg = (i: number) => rspecArg(lw, m.args[i], ctx);
    const args = () => m.args.map((_: N, i: number) => arg(i)).join(", ");
    const lit = (x: N) =>
      ["str", "int", "float", "sym", "true", "false", "nil"].includes(x?.k) ||
      (x?.k === "array" && x.elems.every((e: N) => lit(e)));
    switch (m.name) {
      case "eq":
      case "eql":
        return lit(m.args[0])
          ? `${ex}(${act})${not}.toEqual(${arg(0)})`
          : `${ex}(${act})${not}.toEqualRuby(${arg(0)})`;
      case "equal":
      case "be":
        if (!m.args.length) return `${ex}(${act})${not}.toBeRubyTruthy()`;
        return `${ex}(${act})${not}.toBe(${arg(0)})`;
      case "be_nil":
        return `${ex}(${act})${not}.toBeNull()`;
      case "be_empty":
        return `${ex}(${act})${not}.toBeEmpty()`;
      case "be_truthy":
        return `${ex}(${act})${not}.toBeRubyTruthy()`;
      case "be_falsey":
      case "be_falsy":
        return `${ex}(${act})${not}.toBeRubyFalsy()`;
      case "match":
        return `${ex}(${act})${not}.toMatch(${arg(0)})`;
      case "include":
        return `${ex}(${act})${not}.toInclude(${args()})`;
      case "be_between": {
        // `be_between(a, b).exclusive`
        return `${ex}(${act})${not}.toBeBetween(${args()})`;
      }
      case "start_with":
        return `${ex}(${act})${not}.toStartWith(${args()})`;
      case "end_with":
        return `${ex}(${act})${not}.toEndWith(${args()})`;
      case "contain_exactly":
        return `${ex}(${act})${not}.toContainExactly(${args()})`;
      case "match_array":
        return `${ex}(${act})${not}.toContainExactly(...${arg(0)})`;
      case "have_key":
        return `${ex}(${act})${not}.toHaveKey(${arg(0)})`;
      case "and": {
        // Compound `a.and(b)`: both hold (rspec compound.rb).
        const l = m.recv?.k === "call" ? one(m.recv, act) : null;
        const r = m.args[0]?.k === "call" ? one(m.args[0], act) : null;
        return l && r ? `${l}; ${r}` : null;
      }
      case ">":
      case ">=":
      case "<":
      case "<=": {
        // `be > 0`: rspec BeComparedTo.
        if (m.recv?.k !== "call" || m.recv.name !== "be" || m.recv.args.length) return null;
        const fn = {
          ">": "toBeGreaterThan",
          ">=": "toBeGreaterThanOrEqual",
          "<": "toBeLessThan",
          "<=": "toBeLessThanOrEqual",
        }[m.name as ">"];
        return `${ex}(${act})${not}.${fn}(${arg(0)})`;
      }
      case "be_a":
      case "be_an":
      case "be_kind_of":
      case "be_a_kind_of":
        return `${ex}(${act})${not}.toBeInstanceOf(${arg(0)})`;
      case "be_an_instance_of":
      case "be_instance_of":
        return `${ex}(${act})${not}.toBeExactInstanceOf(${arg(0)})`;
      case "respond_to":
        return `${ex}(${act})${not}.toRespondTo(${JSON.stringify(lw.callName(m.args[0].value))})`;
      case "all": {
        const inner = m.args[0]?.k === "call" ? one(m.args[0], "x") : null;
        return inner ? `for (const x of ${act}) ${inner}` : null;
      }
    }
    // `be_valid` / `be_an_image`: the predicate `valid?` / `image?` (rspec
    // BePredicate strips `be_`, then `a_` / `an_`).
    const pred = /^be_(?:an?_)?(.+)$/.exec(m.name);
    if (pred) {
      const call = lw.expr(
        { k: "call", recv: target.args[0], name: `${pred[1]}?`, args: m.args, l: m.l },
        ctx,
      );
      return `${ex}(${call}).${neg ? "toBeRubyFalsy" : "toBeRubyTruthy"}()`;
    }
    return null;
  };
  return (
    one(matcher, actual) ?? lw.decline(ctx, "unhandled-node", n, `rspec matcher ${matcher.name}`)
  );
}

export function rspecArg(lw: Lowerer, a: N, ctx: Ctx): string {
  if (
    a?.k === "call" &&
    !a.recv &&
    ["an_instance_of", "a_kind_of", "kind_of", "instance_of"].includes(a.name) &&
    a.args.length === 1
  )
    return lw.expr(a.args[0], ctx);
  return lw.expr(a, ctx);
}

/**
 * `expect { … }.to change { x }.from(a).to(b).by(n)` / `yield_*` / `output(…).to_stderr`,
 * as the async matchers of `@blazetrails/vitest-matchers`. Null for any other matcher.
 */
export function rspecBlockMatcher(
  lw: Lowerer,
  matcher: N,
  target: N,
  ctx: Ctx,
  ex: string,
  not: string,
): string | null {
  const chain: N[] = [];
  for (let m: N = matcher; m?.k === "call"; m = m.recv) chain.unshift(m);
  const head = chain[0];
  if (head.recv) return null;
  const async = (f: string) => (f.startsWith("async") ? f : `async ${f}`);
  const blk = lw.arrow(
    target.block.params ?? [],
    target.block.body,
    lw.child(ctx, { testMode: true }),
  );
  const args = (c: N) => c.args.map((a: N) => rspecArg(lw, a, ctx)).join(", ");
  switch (head.name) {
    case "change": {
      let read: string;
      if (head.block?.k === "block")
        read = async(lw.arrow([], head.block.body, lw.child(ctx, { testMode: true })));
      else if (head.args.length === 2 && head.args[1].k === "sym")
        read = `async () => ${lw.expr({ k: "call", recv: head.args[0], name: head.args[1].value, args: [], l: head.l }, ctx)}`;
      else return null;
      const opts: string[] = [];
      for (const c of chain.slice(1)) {
        if (!["from", "to", "by"].includes(c.name) || c.args.length !== 1) return null;
        opts.push(`${c.name}: ${lw.expr(c.args[0], ctx)}`);
      }
      return `await ${ex}(${async(blk)})${not}.toChange(${read}${opts.length ? `, { ${opts.join(", ")} }` : ""})`;
    }
    case "yield_control": {
      let times = "";
      for (const c of chain.slice(1)) {
        if (c.name === "once") times = "1";
        else if (c.name === "twice") times = "2";
        else if (c.name === "exactly" && c.args.length === 1) times = lw.expr(c.args[0], ctx);
        else if (c.name !== "times") return null;
      }
      return `await ${ex}(${async(blk)})${not}.toYieldControl(${times})`;
    }
    case "yield_with_no_args":
      return chain.length === 1 ? `await ${ex}(${async(blk)})${not}.toYieldWithNoArgs()` : null;
    case "yield_with_args":
      return chain.length === 1
        ? `await ${ex}(${async(blk)})${not}.toYieldWithArgs(${args(head)})`
        : null;
    case "yield_successive_args":
      return chain.length === 1
        ? `await ${ex}(${async(blk)})${not}.toYieldSuccessiveArgs(${args(head)})`
        : null;
    case "output": {
      if (chain.length > 2) return null;
      const to = chain[1]?.name ?? "to_stdout";
      if (to !== "to_stdout" && to !== "to_stderr") return null;
      const exp = head.args.length ? lw.expr(head.args[0], ctx) : "undefined";
      return `await ${ex}(${async(blk)})${not}.toOutput(${exp}, ${JSON.stringify(to.slice(3))})`;
    }
  }
  return null;
}
