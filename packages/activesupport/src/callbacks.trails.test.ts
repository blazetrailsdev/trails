import { describe, it, expect } from "vitest";
import {
  CallbackChain,
  Callback,
  defineCallbacks,
  setCallback,
  skipCallback,
  runCallbacks,
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
