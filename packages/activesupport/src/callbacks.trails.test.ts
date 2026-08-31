import { describe, it, expect } from "vitest";
import {
  CallbackChain,
  Callback,
  defineCallbacks,
  setCallback,
  skipCallback,
  runCallbacks,
  ProcCall,
} from "./callbacks.js";

// trails-only coverage: CallbackChain.compile() memoizes the folded
// CallbackSequence (Rails' @all_callbacks), rebuilding only on chain mutation.
// No Rails counterpart test — this pins our internal optimization so a future
// refactor can't silently reintroduce per-run refolding.
describe("CallbackChain compile memoization (trails)", () => {
  const makeCallback = (name: string) => new Callback(name, () => {}, "before", {}, {});

  it("returns the same compiled sequence on repeated calls", () => {
    const chain = new CallbackChain("save");
    chain.append(makeCallback("a"));
    expect(chain.compile()).toBe(chain.compile());
  });

  it("rebuilds after append", () => {
    const chain = new CallbackChain("save");
    chain.append(makeCallback("a"));
    const first = chain.compile();
    chain.append(makeCallback("b"));
    expect(chain.compile()).not.toBe(first);
  });

  it("rebuilds after prepend", () => {
    const chain = new CallbackChain("save");
    chain.append(makeCallback("a"));
    const first = chain.compile();
    chain.prepend(makeCallback("b"));
    expect(chain.compile()).not.toBe(first);
  });

  it("rebuilds after insert", () => {
    const chain = new CallbackChain("save");
    chain.append(makeCallback("a"));
    const first = chain.compile();
    chain.insert(0, makeCallback("b"));
    expect(chain.compile()).not.toBe(first);
  });

  it("rebuilds after delete", () => {
    const chain = new CallbackChain("save");
    const cb = makeCallback("a");
    chain.append(cb);
    chain.append(makeCallback("b"));
    const first = chain.compile();
    chain.delete(cb);
    expect(chain.compile()).not.toBe(first);
  });

  it("rebuilds after remove", () => {
    const chain = new CallbackChain("save");
    chain.append(makeCallback("a"));
    const first = chain.compile();
    chain.remove("before");
    expect(chain.compile()).not.toBe(first);
  });

  it("rebuilds after clear", () => {
    const chain = new CallbackChain("save");
    chain.append(makeCallback("a"));
    const first = chain.compile();
    chain.clear();
    expect(chain.compile()).not.toBe(first);
  });
});

// trails-only coverage: the documented type-omitted form
// `set_callback :save, :before_method` (`callbacks.rb:713`) defaults to
// `:before` (`callbacks.rb:698`).
describe("setCallback type-omitted form (trails)", () => {
  it("defaults the callback type to before", () => {
    const target = {};
    defineCallbacks(target, "save");
    const ran: string[] = [];
    setCallback(target, "save", () => ran.push("filter"));
    runCallbacks(target, "save", () => ran.push("block"));
    expect(ran).toEqual(["filter", "block"]);
  });

  it("skipCallback defaults the callback type to before", () => {
    const target = {};
    defineCallbacks(target, "save");
    const ran: string[] = [];
    const filter = () => ran.push("filter");
    setCallback(target, "save", filter);
    skipCallback(target, "save", filter);
    runCallbacks(target, "save", () => ran.push("block"));
    expect(ran).toEqual(["block"]);
  });
});

// trails-only coverage: `run_callbacks(kind, type)` (callbacks.rb:96-104)
// forwards `type` into `CallbackChain#compile(type)` (callbacks.rb:614-630),
// whose type arm folds only the callbacks of that one kind and memoizes them in
// @single_callbacks. Rails has no test for it, so it is pinned here.
describe("runCallbacks type argument (trails)", () => {
  class Target {}

  const build = (ran: string[]): Target => {
    const target = new Target();
    defineCallbacks(target, "save");
    setCallback(target, "save", "before", () => {
      ran.push("before");
    });
    setCallback(target, "save", "after", () => {
      ran.push("after");
    });
    return target;
  };

  it("runs only the callbacks of the given type", () => {
    const ran: string[] = [];
    const target = build(ran);
    runCallbacks(target, "save", () => ran.push("block"), undefined, "before");
    expect(ran).toEqual(["before", "block"]);
  });

  it("runs the whole chain when no type is given", () => {
    const ran: string[] = [];
    const target = build(ran);
    runCallbacks(target, "save", () => ran.push("block"));
    expect(ran).toEqual(["before", "block", "after"]);
  });

  it("memoizes each type separately from the unfiltered sequence", () => {
    const ran: string[] = [];
    const target = build(ran);
    runCallbacks(target, "save", () => ran.push("block"), undefined, "after");
    runCallbacks(target, "save", () => ran.push("block"), undefined, "after");
    expect(ran).toEqual(["block", "after", "block", "after"]);
  });
});

// `(@override_target || target)` (callbacks.rb:470, :475, :481) — a `ProcCall`
// built with no target resolves to the runtime `target`.
describe("ProcCall", () => {
  it("falls back to the runtime target when no override target was given", () => {
    const calls: unknown[] = [];
    const target = (...args: unknown[]) => {
      calls.push(args);
      return true;
    };

    const template = new ProcCall(null);

    expect(template.expand(target, 1, null)).toEqual([target, null, "call", target, 1]);
    expect(template.makeLambda()(target, 1)).toBe(true);
    expect(template.invertedLambda()(target, 1)).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("prefers the override target over the runtime target", () => {
    const overrideTarget = () => true;
    const target = () => false;
    const template = new ProcCall(overrideTarget);

    expect(template.expand(target, 1, null)[0]).toBe(overrideTarget);
    expect(template.makeLambda()(target, 1)).toBe(true);
  });
});
