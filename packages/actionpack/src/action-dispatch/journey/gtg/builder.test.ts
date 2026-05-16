import { describe, it, expect } from "vitest";
import { Parser } from "../parser.js";
import { Or } from "../nodes/node.js";
import { Builder } from "./builder.js";
import { Simulator } from "./simulator.js";

function asts(strings: string[]) {
  const parser = new Parser();
  return strings.map((s) => {
    const memo = { id: s };
    const tree = parser.parse(s);
    for (const n of tree) n.memo = memo;
    return tree;
  });
}

function tt(strings: string[]) {
  return new Builder(new Or(asts(strings))).transitionTable();
}

describe("ActionDispatch::Journey::GTG::Builder", () => {
  it("test_following_states_multi", () => {
    const t = tt(["a|a"]);
    expect(t.move([[0, null]], "a", 0, 1).length).toBe(1);
  });

  it("test_following_states_multi_regexp", () => {
    const t = tt([":a|b"]);
    expect(t.move([[0, null]], "fooo", 0, 4).length).toBe(1);
    expect(t.move([[0, null]], "b", 0, 1).length).toBe(2);
  });

  it("test_multi_path", () => {
    const t = tt(["/:a/d", "/b/c"]);
    const steps: Array<[number, string]> = [
      [1, "/"],
      [2, "b"],
      [2, "/"],
      [1, "c"],
    ];
    let state = [[0, null]] as readonly (readonly [number, number | null])[];
    for (const [exp, sym] of steps) {
      state = t.move(state, sym, 0, sym.length);
      expect(state.length).toBe(exp);
    }
  });

  it("test_match_data_ambiguous", () => {
    const t = tt([
      "/articles(.:format)",
      "/articles/new(.:format)",
      "/articles/:id/edit(.:format)",
      "/articles/:id(.:format)",
    ]);
    const sim = new Simulator(t);
    const memos = sim.memos("/articles/new", () => []);
    expect(memos.length).toBe(2);
  });

  it("test_match_same_paths", () => {
    const t = tt(["/articles/new(.:format)", "/articles/new(.:format)"]);
    const sim = new Simulator(t);
    const memos = sim.memos("/articles/new", () => []);
    expect(memos.length).toBe(2);
  });

  it("test_catchall", () => {
    const t = tt(["/", "/*unmatched_route"]);
    const sim = new Simulator(t);
    expect(sim.memos("/test", () => []).length).toBe(1);
    expect(sim.memos("/", () => []).length).toBe(1);
  });
});
